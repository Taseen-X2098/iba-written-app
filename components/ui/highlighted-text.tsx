"use client";

import { useState } from "react";

export function HighlightedText({ text, highlights }: { text: string; highlights: any[] }) {
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);

  // Simple string search implementation. 
  // For a robust implementation, we'd need to find all overlapping indices.
  // Assuming non-overlapping highlights for this MVP.
  
  let result: React.ReactNode[] = [];
  let currentIndex = 0;

  // Sort highlights by their position in text
  const sortedHighlights = [...highlights]
    .map((h, i) => {
      const index = text.indexOf(h.quote);
      return { ...h, originalIndex: i, startIndex: index, endIndex: index + h.quote.length };
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
        <span key={`highlight-wrapper-${i}`} className="relative inline-block group">
          <mark 
            data-type={h.type}
            onMouseEnter={() => setActiveHighlight(i)}
            onMouseLeave={() => setActiveHighlight(null)}
          >
            {text.slice(h.startIndex, h.endIndex)}
          </mark>
          
          {/* Tooltip */}
          {activeHighlight === i && (
            <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-foreground text-background text-xs rounded-lg shadow-xl animate-fade-in pointer-events-none">
              <div className="font-semibold mb-1 uppercase tracking-wide opacity-80">
                {h.type === "strength" ? "Good" : "Improvement"}
              </div>
              {h.comment}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
            </div>
          )}
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

  return <>{result}</>;
}
