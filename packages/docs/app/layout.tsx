import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const mono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    template: '%s | AI Toolkit',
    default: 'AI Toolkit',
  },
  description:
    'Unified AI development toolkit for TypeScript. One import. Clear names. Provider-agnostic.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ai-toolkit-docs.vercel.app',
  ),
  openGraph: {
    type: 'website',
    siteName: 'AI Toolkit Docs',
    title: 'AI Toolkit',
    description:
      'Unified AI development toolkit for TypeScript. One import. Clear names. Provider-agnostic.',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
