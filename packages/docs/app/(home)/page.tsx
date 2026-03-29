import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          AI Toolkit
        </h1>
        <p className="text-fd-muted-foreground text-lg leading-relaxed">
          Unified AI development toolkit for TypeScript. One import. Clear names.
          Consistent API. Provider-agnostic. Auto-cleanup. Built-in security.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs/installation"
            className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Installation
          </Link>
        </div>
        <pre className="inline-block rounded-lg bg-fd-secondary px-4 py-2 text-sm">
          <code>npm install @jamaalbuilds/ai-toolkit</code>
        </pre>
      </div>
    </main>
  );
}
