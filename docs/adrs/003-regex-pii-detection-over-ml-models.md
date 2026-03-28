# ADR-003: Regex-based PII Detection Over ML Models

**Date:** 2026-03-27
**Status:** Accepted
**Deciders:** @jamaalbuilds

## Context

The security module needs PII detection to prevent sensitive data (SSNs, emails, phone numbers, names, dates of birth) from leaking into LLM prompts and responses. Two primary approaches exist:

1. **Regex/pattern-based detection** — deterministic string matching with known PII patterns
2. **ML-based NER models** — Named Entity Recognition via spaCy, Presidio, or transformer models

## Decision

Use regex-based pattern matching for PII detection in v5.

## Rationale

### Why regex over ML:

- **Zero dependencies** — no Python runtime, no model downloads, no ONNX/TensorFlow. The toolkit stays TypeScript-only with no binary dependencies.
- **Deterministic** — same input always produces same output. Critical for security: you can unit test every edge case and guarantee behavior.
- **Fast** — microsecond-level execution. No model inference latency. Suitable for hot-path middleware (every request).
- **Portable** — works in Node.js, Edge runtimes (Vercel Edge, Cloudflare Workers), and browsers. ML models typically require Node.js with native bindings.
- **Auditable** — regex patterns are human-readable. Security teams can review and approve exactly what gets caught.
- **No false confidence** — ML models give probabilistic results that can miss novel PII patterns or hallucinate detections. Regex is explicit about what it catches and what it doesn't.

### Tradeoffs accepted:

- **Lower recall for names** — the Title Case heuristic (`/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/`) catches "John Smith" but misses unusual name patterns. ML NER would catch more names.
- **No contextual understanding** — "Washington" is flagged as a name, not a city. ML models can disambiguate.
- **Manual pattern maintenance** — new PII types require new regex patterns, not retraining.

### Why this is acceptable for v5:

The primary use case is **preventing obvious PII leakage** (SSNs, emails, phones) into LLM prompts — not HIPAA/GDPR compliance scanning. For compliance-grade detection, users should layer a dedicated tool (Presidio, AWS Macie) on top. The toolkit's job is to provide a fast, zero-config first line of defense.

## Alternatives Considered

### 1. Microsoft Presidio (via REST API)
- Pros: Comprehensive NER, configurable, supports custom PII types
- Cons: Requires Python sidecar or REST service, adds operational complexity, not Edge-compatible

### 2. compromise.js (NLP library)
- Pros: Pure JS, decent NER for English
- Cons: 200KB+ bundle, English-only, still probabilistic, adds a dependency

### 3. Transformer models via ONNX Runtime
- Pros: State-of-art accuracy
- Cons: 50MB+ model files, slow first inference, Node.js only, massive dependency

## Consequences

- `detectPII()` and `sanitizeForLLM()` ship with zero additional dependencies
- Works in all JavaScript runtimes including Edge
- Users needing ML-grade detection can compose: `detectPII()` for fast scanning + external NER for deep analysis
- Future: if demand warrants, we can add an optional `@jamaalbuilds/ai-toolkit-pii-ml` package with ML-based detection behind the same `PIIFinding` interface
