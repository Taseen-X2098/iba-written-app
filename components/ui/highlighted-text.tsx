"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Highlight } from "@/lib/types";
import { FeedbackParagraphs } from "@/components/feedback/feedback-paragraphs";

interface ActiveHighlight {
  highlight: Highlight;
  rect: DOMRect;
}

export function HighlightedText({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null);

  // Simple string search implementation. 
  // For a robust implementation, we'd need to find all overlapping indices.
  // Assuming non-overlapping highlights for this MVP.
  
  const result: React.ReactNode[] = [];
  let currentIndex = 0;

  // Sort highlights by their position in text
  const sortedHighlights = [...highlights]
    .map((h) => {
      const index = text.indexOf(h.quote);
      return { ...h, startIndex: index, endIndex: index + h.quote.length };
    })
    .filter(h => h.startIndex !== -1)
    .sort((a, b) => a.startIndex - b.startIndex);

  sortedHighlights.forEach((h, i) => {
    // Add text before highlight
    if (h.startIndex > currentIndex) {
      result.push(<span key={`text-${currentIndex}`}>{text.slice(currentIndex, h.startIndex)}</span>);
    }
    
    // Add highlighted section
    if (h.startIndex >= currentIndex) {
      result.push(
        <span key={`highlight-wrapper-${i}`} className="inline-block">
          <mark 
            data-type={h.type}
            tabIndex={0}
            onMouseEnter={(event) => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                setActiveHighlight({ highlight: h, rect: event.currentTarget.getBoundingClientRect() });
              }
            }}
            onMouseLeave={() => setActiveHighlight(null)}
            onFocus={(event) => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                setActiveHighlight({ highlight: h, rect: event.currentTarget.getBoundingClientRect() });
              }
            }}
            onBlur={() => setActiveHighlight(null)}
          >
            {text.slice(h.startIndex, h.endIndex)}
          </mark>
        </span>
      );
      currentIndex = h.endIndex;
    }
  });

  // Add remaining text
  if (currentIndex < text.length) {
    result.push(<span key={`text-${currentIndex}`}>{text.slice(currentIndex)}</span>);
  }

  // Fallback if no highlights matched
  if (result.length === 0) {
    return <span>{text}</span>;
  }

  return (
    <>
      {result}
      {activeHighlight ? createPortal(
        <HighlightTooltip activeHighlight={activeHighlight} />,
        document.body,
      ) : null}
    </>
  );
}

function HighlightTooltip({ activeHighlight }: { activeHighlight: ActiveHighlight }) {
  const { highlight, rect } = activeHighlight;
  const placeBelow = rect.top < 180;
  const center = Math.min(Math.max(rect.left + rect.width / 2, 136), window.innerWidth - 136);

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-64 rounded-lg bg-foreground p-3 text-xs text-background shadow-xl animate-fade-in"
      style={{
        left: center,
        top: placeBelow ? rect.bottom + 8 : rect.top - 8,
        transform: placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
    >
      <div className="mb-1 font-semibold uppercase tracking-wide opacity-80">
        {highlight.type === "strength" ? "Good" : "Improvement"}
      </div>
      <FeedbackParagraphs text={highlight.comment} className="space-y-2" />
      <div
        className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
          placeBelow
            ? "bottom-full border-b-foreground"
            : "top-full border-t-foreground"
        }`}
      />
    </div>
  );
}

export function MobileHighlightDetails({ highlights }: { highlights: Highlight[] }) {
  if (highlights.length === 0) return null;

  return (
    <div className="mt-5 space-y-3 lg:hidden" aria-label="Highlight details">
      <h5 className="text-sm font-semibold text-foreground">Highlight details</h5>
      {highlights.map((highlight, index) => (
        <div
          key={`${highlight.quote}-${index}`}
          className="rounded-xl border border-border bg-card p-4 text-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-sm ${
                highlight.type === "strength"
                  ? "bg-[var(--color-highlight-strength-border)]"
                  : "bg-[var(--color-highlight-improvement-border)]"
              }`}
            />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {highlight.type === "strength" ? "Strength" : "Area for improvement"}
            </span>
          </div>
          <blockquote className="break-words font-semibold text-foreground">
            “{highlight.quote}”
          </blockquote>
          <FeedbackParagraphs
            text={highlight.comment}
            className="mt-2 space-y-2 leading-relaxed text-muted-foreground"
          />
        </div>
      ))}
    </div>
  );
}
