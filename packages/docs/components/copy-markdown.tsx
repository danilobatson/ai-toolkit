'use client';

import { useCallback, useState } from 'react';

interface CopyMarkdownProps {
  title: string;
  url: string;
}

export function CopyMarkdown({ title, url }: CopyMarkdownProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const article = document.querySelector('.prose');
    if (!article) return;

    const markdown = extractMarkdown(article);
    const header = `# ${title}\n\nSource: ${url}\n\n`;

    await navigator.clipboard.writeText(header + markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [title, url]);

  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(
    `I'm reading the AI Toolkit docs for "${title}". Here's the page: ${url}\n\nHelp me understand and use this module.`
  )}`;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        title="Copy page as Markdown"
      >
        {copied ? (
          <CheckIcon />
        ) : (
          <ClipboardIcon />
        )}
        {copied ? 'Copied' : 'Copy MD'}
      </button>
      <a
        href={claudeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-2.5 py-1.5 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        title="Open in Claude"
      >
        <ClaudeIcon />
        Open in Claude
      </a>
    </div>
  );
}

function extractMarkdown(element: Element): string {
  const lines: string[] = [];

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) lines.push(text);
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1') lines.push(`# ${el.textContent?.trim()}\n`);
    else if (tag === 'h2') lines.push(`## ${el.textContent?.trim()}\n`);
    else if (tag === 'h3') lines.push(`### ${el.textContent?.trim()}\n`);
    else if (tag === 'h4') lines.push(`#### ${el.textContent?.trim()}\n`);
    else if (tag === 'p') lines.push(`${el.textContent?.trim()}\n`);
    else if (tag === 'pre') {
      const code = el.querySelector('code');
      const lang = code?.className?.match(/language-(\w+)/)?.[1] ?? '';
      lines.push(`\`\`\`${lang}\n${code?.textContent ?? el.textContent}\n\`\`\`\n`);
    } else if (tag === 'ul' || tag === 'ol') {
      const items = el.querySelectorAll(':scope > li');
      items.forEach((li, i) => {
        const prefix = tag === 'ol' ? `${i + 1}. ` : '- ';
        lines.push(`${prefix}${li.textContent?.trim()}`);
      });
      lines.push('');
    } else if (tag === 'table') {
      const rows = el.querySelectorAll('tr');
      rows.forEach((row, i) => {
        const cells = row.querySelectorAll('th, td');
        const line = Array.from(cells)
          .map((c) => c.textContent?.trim() ?? '')
          .join(' | ');
        lines.push(`| ${line} |`);
        if (i === 0) {
          lines.push(
            `| ${Array.from(cells)
              .map(() => '---')
              .join(' | ')} |`
          );
        }
      });
      lines.push('');
    } else if (tag === 'blockquote') {
      lines.push(`> ${el.textContent?.trim()}\n`);
    } else if (tag === 'hr') {
      lines.push('---\n');
    } else {
      const nested = extractMarkdown(el);
      if (nested) lines.push(nested);
    }
  }

  return lines.join('\n');
}

function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
