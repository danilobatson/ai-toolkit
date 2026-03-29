import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CopyPageDropdown } from '@/components/copy-page-dropdown';
import { BASE_URL, GITHUB_REPO } from '@/lib/constants';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const { body: Mdx, toc } = await page.data.load();
  const pageUrl = `${BASE_URL}${page.url}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: page.data.title,
    description: page.data.description ?? 'AI Toolkit documentation',
    url: pageUrl,
    author: {
      '@type': 'Organization',
      name: 'AI Toolkit',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'AI Toolkit',
    },
    isPartOf: {
      '@type': 'WebSite',
      name: 'AI Toolkit Docs',
      url: BASE_URL,
    },
    inLanguage: 'en',
    proficiencyLevel: 'Beginner',
  };

  return (
    <DocsPage
      toc={toc}
      breadcrumb={{ enabled: true, includePage: true }}
      tableOfContent={{ header: <span className="text-sm font-medium">On this page</span> }}
    >
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocsBody>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="!mb-0">{page.data.title}</h1>
          <CopyPageDropdown title={page.data.title} url={pageUrl} />
        </div>
        <p className="text-fd-muted-foreground text-lg mb-6 -mt-2">{page.data.description}</p>
        <Mdx />
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 border-t border-fd-border pt-6">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <StarIcon />
            Star on GitHub
          </a>
          <a
            href={`${GITHUB_REPO}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <IssueIcon />
            Report Issue
          </a>
          <a
            href={`${GITHUB_REPO}/fork`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <ForkIcon />
            Contribute
          </a>
        </div>
      </DocsBody>
    </DocsPage>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IssueIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </svg>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) return {};

  const pageUrl = `${BASE_URL}${page.url}`;
  const description = page.data.description ?? 'AI Toolkit documentation';

  return {
    title: page.data.title,
    description,
    openGraph: {
      title: `${page.data.title} | AI Toolkit`,
      description,
      url: pageUrl,
      siteName: 'AI Toolkit Docs',
      type: 'article',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${page.data.title} | AI Toolkit`,
      description,
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}
