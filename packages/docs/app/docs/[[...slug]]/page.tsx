import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CopyMarkdown } from '@/components/copy-markdown';
import { Feedback } from '@/components/feedback';
import { BASE_URL } from '@/lib/constants';

const GITHUB_EDIT_BASE =
  'https://github.com/danilobatson/ai-toolkit/edit/main/packages/docs/content/docs';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const { body: Mdx, toc } = await page.data.load();
  const pageUrl = `${BASE_URL}${page.url}`;
  const slugPath = params.slug?.join('/') ?? 'index';
  const editUrl = `${GITHUB_EDIT_BASE}/${slugPath}.mdx`;

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
    <DocsPage toc={toc}>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocsBody>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="!mb-0">{page.data.title}</h1>
          <CopyMarkdown title={page.data.title} url={pageUrl} />
        </div>
        <p className="text-fd-muted-foreground text-lg mb-6 -mt-2">{page.data.description}</p>
        <Mdx />
        <div className="mt-8 flex justify-end">
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <EditIcon />
            Edit this page on GitHub
          </a>
        </div>
        <Feedback />
      </DocsBody>
    </DocsPage>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
