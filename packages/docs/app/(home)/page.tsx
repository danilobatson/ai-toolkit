import Link from 'next/link';

const features = [
  {
    title: 'AI Models',
    description: 'Generate, stream, and structured output with provider fallback and cost tracking.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: 'Security',
    description: 'PII detection, audit logging, guardrails, and rate limiting built in.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: 'Observability',
    description: 'Trace every LLM call, evaluate quality, and track costs with Langfuse.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: 'MCP Servers',
    description: 'Build Model Context Protocol servers with Zod-validated tools and resources.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
];

const libraries = [
  { name: 'Vercel AI SDK', url: 'https://sdk.vercel.ai' },
  { name: 'LangChain', url: 'https://js.langchain.com' },
  { name: 'LangGraph', url: 'https://langchain-ai.github.io/langgraphjs/' },
  { name: 'LlamaIndex', url: 'https://ts.llamaindex.ai' },
  { name: 'Langfuse', url: 'https://langfuse.com' },
  { name: 'Inngest', url: 'https://inngest.com' },
  { name: 'Drizzle ORM', url: 'https://orm.drizzle.team' },
  { name: 'MCP SDK', url: 'https://modelcontextprotocol.io' },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      {/* Hero */}
      <section className="max-w-3xl text-center space-y-6 mb-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-fd-border px-3 py-1 text-sm text-fd-muted-foreground mb-4">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          17 modules &middot; 720+ tests
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          AI Toolkit
        </h1>
        <p className="text-fd-muted-foreground text-xl leading-relaxed max-w-2xl mx-auto">
          One import. Clear names. Consistent API. Provider-agnostic.
          Auto-cleanup. Built-in security. The unified AI development toolkit for TypeScript.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/danilobatson/ai-toolkit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border px-6 py-3 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
        <pre className="inline-block rounded-lg bg-fd-secondary px-4 py-2 text-sm">
          <code>yarn add @jamaalbuilds/ai-toolkit</code>
        </pre>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <a href="https://www.npmjs.com/package/@jamaalbuilds/ai-toolkit" target="_blank" rel="noopener noreferrer">
            <img alt="npm version" src="https://img.shields.io/npm/v/@jamaalbuilds/ai-toolkit?style=flat-square" />
          </a>
          <a href="https://www.npmjs.com/package/@jamaalbuilds/ai-toolkit" target="_blank" rel="noopener noreferrer">
            <img alt="npm downloads" src="https://img.shields.io/npm/dw/@jamaalbuilds/ai-toolkit?style=flat-square" />
          </a>
          <a href="https://github.com/danilobatson/ai-toolkit" target="_blank" rel="noopener noreferrer">
            <img alt="GitHub stars" src="https://img.shields.io/github/stars/danilobatson/ai-toolkit?style=flat-square" />
          </a>
          <a href="https://github.com/danilobatson/ai-toolkit/actions" target="_blank" rel="noopener noreferrer">
            <img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/danilobatson/ai-toolkit/ci.yml?style=flat-square&label=build" />
          </a>
          <a href="https://github.com/danilobatson/ai-toolkit/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
            <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
          </a>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="max-w-4xl w-full mb-20">
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border border-fd-border p-6 transition-colors hover:border-fd-foreground/20"
            >
              <div className="mb-3 text-fd-muted-foreground">{feature.icon}</div>
              <h3 className="font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-fd-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="max-w-3xl w-full text-center">
        <p className="text-sm text-fd-muted-foreground mb-4">Built on</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {libraries.map((lib) => (
            <a
              key={lib.name}
              href={lib.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-fd-border px-3 py-1 text-xs text-fd-muted-foreground transition-colors hover:border-fd-foreground/30 hover:text-fd-foreground"
            >
              {lib.name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
