'use client';

import { useCallback, useState } from 'react';

type Rating = 'up' | 'down' | null;

export function Feedback() {
  const [rating, setRating] = useState<Rating>(null);

  const handleRate = useCallback((value: 'up' | 'down') => {
    setRating(value);
    console.log(`[feedback] ${value} — ${window.location.pathname}`);
  }, []);

  if (rating) {
    return (
      <div className="mt-12 border-t border-fd-border pt-6 text-center text-sm text-fd-muted-foreground">
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="mt-12 border-t border-fd-border pt-6 flex items-center justify-center gap-4">
      <span className="text-sm text-fd-muted-foreground">Was this page helpful?</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleRate('up')}
          className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          <ThumbsUpIcon />
          Yes
        </button>
        <button
          type="button"
          onClick={() => handleRate('down')}
          className="inline-flex items-center gap-1.5 rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          <ThumbsDownIcon />
          No
        </button>
      </div>
    </div>
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}
