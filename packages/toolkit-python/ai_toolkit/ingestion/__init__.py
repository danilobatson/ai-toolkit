"""
Document ingestion pipeline: download → extract → chunk.

Takes a file path, URL, or raw bytes and returns chunks ready for embedding.

Usage::

    from ai_toolkit.ingestion import ingest, ChunkConfig

    # One-call pipeline
    result = await ingest("report.pdf")
    print(f"{result.chunk_count} chunks from {result.char_count} chars")

    # Embed the chunks
    from ai_toolkit.llm import EmbeddingClient
    embeddings = EmbeddingClient()
    vectors = await embeddings.embed_batch([c.text for c in result.chunks])
"""

from .chunker import Chunk, ChunkConfig, chunk_text
from .extractors import (
    Document,
    DocumentFormat,
    detect_format,
    extract_document,
    extract_docx,
    extract_html,
    extract_pdf,
    extract_text,
)
from .pipeline import IngestResult, ingest

__all__ = [
    # Pipeline
    "ingest",
    "IngestResult",
    # Chunking
    "Chunk",
    "ChunkConfig",
    "chunk_text",
    # Extraction
    "Document",
    "DocumentFormat",
    "detect_format",
    "extract_document",
    "extract_docx",
    "extract_html",
    "extract_pdf",
    "extract_text",
]
