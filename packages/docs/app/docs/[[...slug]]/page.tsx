import { source } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CopyMarkdown } from '@/components/copy-markdown';
import { BASE_URL } from '@/lib/constants';

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
      </DocsBody>
    </DocsPage>
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
