"""
Document ingestion pipeline: download → extract → chunk.

One-call function that takes a file path, URL, or raw bytes and returns
chunks ready for embedding.

Usage::

    from ai_toolkit.ingestion import ingest, ChunkConfig

    # From file
    chunks = await ingest("report.pdf")

    # From URL
    chunks = await ingest("https://example.com/paper.pdf")

    # With custom chunking
    chunks = await ingest("notes.docx", chunk_config=ChunkConfig(
        chunk_size=500,
        chunk_overlap=100,
    ))

    # Raw bytes (must specify format)
    chunks = await ingest(pdf_bytes, path="upload.pdf")

    # Then embed
    from ai_toolkit.llm import EmbeddingClient
    embeddings = EmbeddingClient()
    vectors = await embeddings.embed_batch([c.text for c in chunks])
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from ai_toolkit.ingestion.chunker import Chunk, ChunkConfig, chunk_text
from ai_toolkit.ingestion.extractors import (
    Document,
    DocumentFormat,
    extract_document,
)


@dataclass
class IngestResult:
    """Result of ingesting a document."""

    document: Document
    """The extracted document (full text + metadata)."""

    chunks: list[Chunk]
    """Chunked text ready for embedding."""

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)

    @property
    def char_count(self) -> int:
        return self.document.char_count


async def _download(url: str) -> tuple[bytes, str]:
    """
    Download a file from a URL. Returns (bytes, filename).

    Uses httpx if available (async), falls back to urllib (sync).
    """
    try:
        import httpx

        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Try to get filename from content-disposition or URL
            filename = url.split("/")[-1].split("?")[0]
            if not filename or "." not in filename:
                # Try content-type
                ct = response.headers.get("content-type", "")
                if "pdf" in ct:
                    filename = "download.pdf"
                elif "html" in ct:
                    filename = "download.html"
                elif "word" in ct or "docx" in ct:
                    filename = "download.docx"
                else:
                    filename = "download.txt"

            return response.content, filename

    except ImportError:
        # Fallback to urllib (sync, but works without extra deps)
        import urllib.request

        from asyncio import get_event_loop

        def _sync_download() -> tuple[bytes, str]:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = resp.read()
                filename = url.split("/")[-1].split("?")[0]
                if not filename or "." not in filename:
                    ct = resp.headers.get("content-type", "")
                    if "pdf" in ct:
                        filename = "download.pdf"
                    elif "html" in ct:
                        filename = "download.html"
                    else:
                        filename = "download.txt"
                return data, filename

        loop = get_event_loop()
        return await loop.run_in_executor(None, _sync_download)


def _is_url(source: str) -> bool:
    """Check if a string looks like a URL."""
    return source.startswith(("http://", "https://", "ftp://"))


async def ingest(
    source: str | bytes,
    *,
    path: str | None = None,
    format: DocumentFormat | None = None,
    mime_type: str | None = None,
    chunk_config: ChunkConfig | None = None,
    metadata: dict[str, Any] | None = None,
) -> IngestResult:
    """
    Ingest a document: download (if URL) → extract text → chunk.

    Args:
        source: File path, URL, or raw bytes
        path: Label/path for format detection (required when source is bytes
              and format is not specified)
        format: Explicit format override (skips auto-detection)
        mime_type: MIME type for format detection
        chunk_config: Chunking configuration (default: 1000 chars, 200 overlap)
        metadata: Additional metadata to attach to each chunk

    Returns:
        IngestResult with document and chunks ready for embedding

    Examples::

        # File path
        result = await ingest("report.pdf")

        # URL
        result = await ingest("https://example.com/paper.pdf")

        # Raw bytes with format hint
        result = await ingest(uploaded_bytes, path="upload.pdf")

        # Custom chunking
        result = await ingest("big_doc.pdf", chunk_config=ChunkConfig(chunk_size=500))
    """
    # Step 1: Download if URL
    if isinstance(source, str) and _is_url(source):
        url = source
        raw_bytes, detected_filename = await _download(url)
        path = path or detected_filename
        source = raw_bytes

    # Step 2: Extract text
    doc = extract_document(
        source,
        path=path,
        format=format,
        mime_type=mime_type,
    )

    # Step 3: Chunk
    base_metadata = metadata or {}
    base_metadata.update({
        "source": doc.source,
        "format": doc.format.value,
    })
    if doc.page_count:
        base_metadata["page_count"] = doc.page_count

    # Merge document metadata (author, title, etc.)
    base_metadata.update(doc.metadata)

    chunks = chunk_text(
        doc.content,
        config=chunk_config,
        source=doc.source,
        metadata=base_metadata,
    )

    return IngestResult(document=doc, chunks=chunks)
