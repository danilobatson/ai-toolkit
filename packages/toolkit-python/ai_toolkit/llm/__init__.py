"""
Provider-agnostic LLM client with retry, fallback, circuit breaker, and streaming.

Built-in providers: Anthropic, OpenAI, Google Gemini, Groq, Ollama.
Users can add custom providers by subclassing ``LLMProvider``.
"""

from .client import (
    CircuitBreaker,
    CircuitState,
    LLMClient,
    create_llm_client,
)
from .embeddings import (
    BatchEmbeddingResult,
    EmbeddingClient,
    EmbeddingResult,
    EmbeddingStats,
)
from .providers import (
    AnthropicProvider,
    GoogleProvider,
    GroqProvider,
    LLMProvider,
    LLMResponse,
    OllamaProvider,
    OpenAIProvider,
    estimate_cost,
    register_pricing,
)

__all__ = [
    # Client
    "CircuitBreaker",
    "CircuitState",
    "LLMClient",
    "create_llm_client",
    # Providers
    "AnthropicProvider",
    "GoogleProvider",
    "GroqProvider",
    "LLMProvider",
    "LLMResponse",
    "OllamaProvider",
    "OpenAIProvider",
    # Embeddings
    "BatchEmbeddingResult",
    "EmbeddingClient",
    "EmbeddingResult",
    "EmbeddingStats",
    # Utilities
    "estimate_cost",
    "register_pricing",
]
