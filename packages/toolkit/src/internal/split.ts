/**
 * Shared built-in text splitter used by chain/splitter and knowledge/operations.
 *
 * Recursive character splitting without external dependencies.
 * @internal — not part of the public API.
 */

export function builtInSplit(
	text: string,
	separators: string[],
	chunkSize: number,
	chunkOverlap: number,
	keepSeparator = true,
): string[] {
	if (text.length <= chunkSize) {
		return text.trim() ? [text] : [];
	}

	// Find the best separator that creates splits
	let splits: string[] = [text];
	for (const sep of separators) {
		if (sep === "") {
			// Character-level split
			splits = text.split("");
			break;
		}
		if (text.includes(sep)) {
			if (keepSeparator) {
				const parts: string[] = [];
				const segments = text.split(sep);
				for (let i = 0; i < segments.length; i++) {
					if (i === 0) {
						parts.push(segments[i]);
					} else {
						parts.push(sep + segments[i]);
					}
				}
				splits = parts.filter((s) => s.length > 0);
			} else {
				splits = text.split(sep).filter((s) => s.length > 0);
			}
			break;
		}
	}

	// Merge splits into chunks respecting chunkSize
	const chunks: string[] = [];
	let current = "";

	for (const split of splits) {
		if (current.length + split.length > chunkSize && current.length > 0) {
			chunks.push(current.trim());
			// Overlap: keep the end of current chunk
			if (chunkOverlap > 0 && current.length > chunkOverlap) {
				current = current.slice(-chunkOverlap) + split;
			} else {
				current = split;
			}
		} else {
			current += split;
		}
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}
