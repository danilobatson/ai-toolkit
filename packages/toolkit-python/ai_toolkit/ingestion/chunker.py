"""
Text chunking for RAG pipelines.

Splits text into overlapping chunks optimized for embedding and retrieval.
The recursive strategy splits on paragraph boundaries first, then sentences,
then words — preserving semantic coherence in each chunk.

Usage::

    from ai_toolkit.ingestion import chunk_text, ChunkConfig

    chunks = chunk_text(document_text, config=ChunkConfig(
        chunk_size=1000,
        chunk_overlap=200,
    ))
    # → [Chunk(text="...", index=0, ...), Chunk(text="...", index=1, ...), ...]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Chunk:
    """A single chunk of text with position metadata."""

    text: str
    """The chunk text content."""

    index: int
    """Chunk position in the sequence (0-based)."""

    start_char: int
    """Start character offset in the original document."""

    end_char: int
    """End character offset in the original document."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Inherited metadata from the source document + chunk-specific info."""

    @property
    def char_count(self) -> int:
        return len(self.text)


@dataclass
class ChunkConfig:
    """Configuration for text chunking."""

    chunk_size: int = 1000
    """Target chunk size in characters."""

    chunk_overlap: int = 200
    """Overlap between consecutive chunks in characters."""

    separators: list[str] | None = None
    """
    Ordered list of separators to split on, from coarsest to finest.
    Default: paragraph breaks → newlines → sentences → spaces
    """

    min_chunk_size: int = 50
    """Minimum chunk size. Chunks smaller than this are merged with neighbors."""

    strip_whitespace: bool = True
    """Strip leading/trailing whitespace from each chunk."""

    def __post_init__(self) -> None:
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError(
                f"chunk_overlap ({self.chunk_overlap}) must be less than "
                f"chunk_size ({self.chunk_size})"
            )
        if self.separators is None:
            self.separators = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]


# ─── Recursive Splitting ─────────────────────────────────────────────────────


def _split_on_separator(text: str, separator: str) -> list[str]:
    """Split text on a separator, keeping the separator at the end of each piece."""
    if not separator:
        return list(text)

    parts = text.split(separator)
    result = []
    for i, part in enumerate(parts):
        if i < len(parts) - 1:
            result.append(part + separator)
        elif part:  # Don't add empty trailing part
            result.append(part)
    return result


def _recursive_split(
    text: str,
    separators: list[str],
    chunk_size: int,
) -> list[str]:
    """
    Recursively split text using progressively finer separators.

    Strategy:
    1. Try splitting on the coarsest separator (e.g., paragraph breaks)
    2. If any piece is still too large, split it with the next separator
    3. Recurse until pieces are small enough or we run out of separators
    """
    if len(text) <= chunk_size:
        return [text]

    if not separators:
        # No more separators — hard-split at chunk_size
        result = []
        for i in range(0, len(text), chunk_size):
            result.append(text[i : i + chunk_size])
        return result

    separator = separators[0]
    remaining_separators = separators[1:]

    pieces = _split_on_separator(text, separator)

    result: list[str] = []
    for piece in pieces:
        if len(piece) <= chunk_size:
            result.append(piece)
        else:
            # This piece is too large — split with finer separator
            sub_pieces = _recursive_split(piece, remaining_separators, chunk_size)
            result.extend(sub_pieces)

    return result


def _merge_small_pieces(
    pieces: list[str],
    chunk_size: int,
    min_chunk_size: int,
) -> list[str]:
    """
    Merge small pieces together until they approach chunk_size.

    This is the key step that produces well-sized chunks from the raw
    recursive split output.
    """
    if not pieces:
        return []

    merged: list[str] = []
    current = pieces[0]

    for piece in pieces[1:]:
        combined = current + piece
        if len(combined) <= chunk_size:
            current = combined
        else:
            if len(current) >= min_chunk_size:
                merged.append(current)
            current = piece

    # Don't forget the last chunk
    if current:
        if len(current) < min_chunk_size and merged:
            # Merge tiny trailing chunk with the previous one
            merged[-1] = merged[-1] + current
        else:
            merged.append(current)

    return merged


def _add_overlap(chunks: list[str], overlap: int) -> list[str]:
    """Add overlap by prepending text from the previous chunk."""
    if overlap <= 0 or len(chunks) <= 1:
        return chunks

    result = [chunks[0]]
    for i in range(1, len(chunks)):
        prev = chunks[i - 1]
        # Take the last `overlap` characters from the previous chunk
        overlap_text = prev[-overlap:] if len(prev) > overlap else prev
        result.append(overlap_text + chunks[i])

    return result


# ─── Public API ──────────────────────────────────────────────────────────────


def chunk_text(
    text: str,
    *,
    config: ChunkConfig | None = None,
    source: str = "",
    metadata: dict[str, Any] | None = None,
) -> list[Chunk]:
    """
    Split text into overlapping chunks for embedding.

    Args:
        text: The full document text to chunk
        config: Chunking configuration (default: 1000 chars, 200 overlap)
        source: Source identifier for metadata
        metadata: Additional metadata to attach to each chunk

    Returns:
        List of Chunk objects with text, position, and metadata
    """
    if not text or not text.strip():
        return []

    if config is None:
        config = ChunkConfig()

    assert config.separators is not None  # Set in __post_init__

    # Step 1: Recursively split into small-enough pieces
    pieces = _recursive_split(text, config.separators, config.chunk_size)

    # Step 2: Merge small pieces back together
    merged = _merge_small_pieces(pieces, config.chunk_size, config.min_chunk_size)

    # Step 3: Strip whitespace if configured
    if config.strip_whitespace:
        merged = [p.strip() for p in merged if p.strip()]

    # Step 4: Add overlap
    final_texts = _add_overlap(merged, config.chunk_overlap)

    if config.strip_whitespace:
        final_texts = [t.strip() for t in final_texts if t.strip()]

    # Step 5: Build Chunk objects with position tracking
    base_metadata = metadata or {}
    if source:
        base_metadata["source"] = source

    chunks: list[Chunk] = []
    char_offset = 0

    for i, chunk_text_content in enumerate(final_texts):
        # Find the actual start position in the original text
        # (approximate — overlap makes exact tracking complex)
        if i == 0:
            start = 0
        else:
            # Find where this chunk's non-overlap content starts
            overlap_len = config.chunk_overlap if i > 0 else 0
            non_overlap = chunk_text_content[overlap_len:]
            pos = text.find(non_overlap[:50], char_offset)
            start = pos if pos >= 0 else char_offset

        end = min(start + len(chunk_text_content), len(text))

        chunk_meta = {
            **base_metadata,
            "chunk_index": i,
            "chunk_total": len(final_texts),
        }

        chunks.append(
            Chunk(
                text=chunk_text_content,
                index=i,
                start_char=start,
                end_char=end,
                metadata=chunk_meta,
            )
        )

        # Advance offset past the non-overlap portion
        char_offset = start + len(chunk_text_content) - config.chunk_overlap

    return chunks
