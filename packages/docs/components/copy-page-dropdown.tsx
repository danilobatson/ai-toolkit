'use client';

import { useCallback, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'fumadocs-ui/components/ui/popover';

interface CopyPageDropdownProps {
  title: string;
  url: string;
}

type ActionId = 'copy' | 'chatgpt' | 'claude' | null;

export function CopyPageDropdown({ title, url }: CopyPageDropdownProps) {
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState<ActionId>(null);

  const flash = useCallback((id: ActionId) => {
    setCompleted(id);
    setTimeout(() => setCompleted(null), 1500);
  }, []);

  const handleCopy = useCallback(async () => {
    const article = document.querySelector('.prose');
    if (!article) return;
    const markdown = extractMarkdown(article);
    const header = `# ${title}\n\nSource: ${url}\n\n`;
    await navigator.clipboard.writeText(header + markdown);
    flash('copy');
    setOpen(false);
  }, [title, url, flash]);

  const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(
    `I'm reading the AI Toolkit docs for "${title}". Here's the page: ${url}\n\nHelp me understand and use this module.`,
  )}`;

  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(
    `I'm reading the AI Toolkit docs for "${title}". Here's the page: ${url}\n\nHelp me understand and use this module.`,
  )}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Copy options"
          className="inline-flex items-center rounded-md border border-fd-border text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground shrink-0"
        >
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border-r border-fd-border">
            <CopyIcon />
            Copy page
          </span>
          <span className="px-1.5 py-1.5">
            <ChevronDownIcon />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-1.5"
        sideOffset={6}
      >
        <DropdownItem
          icon={<CopyIcon />}
          label={completed === 'copy' ? 'Copied!' : 'Copy page'}
          subtitle="Copy page as Markdown for LLMs"
          onClick={handleCopy}
          done={completed === 'copy'}
        />
        <DropdownItem
          icon={<OpenAIIcon />}
          label="Open in ChatGPT"
          subtitle="Ask questions about this page"
          onClick={() => {
            window.open(chatgptUrl, '_blank', 'noopener,noreferrer');
            flash('chatgpt');
            setOpen(false);
          }}
          done={completed === 'chatgpt'}
        />
        <DropdownItem
          icon={<AnthropicIcon />}
          label="Open in Claude"
          subtitle="Ask questions about this page"
          onClick={() => {
            window.open(claudeUrl, '_blank', 'noopener,noreferrer');
            flash('claude');
            setOpen(false);
          }}
          done={completed === 'claude'}
        />
      </PopoverContent>
    </Popover>
  );
}

function DropdownItem({
  icon,
  label,
  subtitle,
  onClick,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
  done: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-fd-accent"
    >
      <span className="mt-0.5 shrink-0 text-fd-muted-foreground">
        {done ? <CheckIcon /> : icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-fd-foreground">
          {label}
        </span>
        <span className="block text-xs text-fd-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

// --- Markdown extraction (unchanged from original) ---

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
              .join(' | ')} |`,
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

// --- Icons ---

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function AnthropicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0l6.57-16.96zm2.327 5.376L6.769 14.27h4.254L8.896 8.896z" />
    </svg>
  );
}

