"use client";

import { useMemo, useState } from "react";
import { splitFeedbackParagraphs } from "@/components/feedback/feedback-paragraphs";

export interface Highlight {
  quote: string;
  comment: string;
  type: "strength" | "improvement";
}

interface HighlightedSubmissionProps {
  submission: string;
  highlights: Highlight[];
}

interface Segment {
  text: string;
  highlight?: Highlight;
}

/**
 * Locates each highlight's quote inside the submission and splits the text
 * into plain + highlighted segments in reading order. Quotes that aren't
 * found (shouldn't happen — grade.ts already drops those server-side, but a
 * frontend should never trust a backend's promises blindly) or that overlap
 * an already-placed highlight are silently skipped rather than crashing.
 */
function buildSegments(submission: string, highlights: Highlight[]): Segment[] {
  const matches: { start: number; end: number; highlight: Highlight }[] = [];

  for (const h of highlights) {
    const idx = submission.indexOf(h.quote);
    if (idx === -1) continue;
    const end = idx + h.quote.length;
    const overlaps = matches.some((m) => idx < m.end && end > m.start);
    if (overlaps) continue;
    matches.push({ start: idx, end, highlight: h });
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ text: submission.slice(cursor, m.start) });
    segments.push({ text: submission.slice(m.start, m.end), highlight: m.highlight });
    cursor = m.end;
  }
  if (cursor < submission.length) segments.push({ text: submission.slice(cursor) });

  return segments;
}

const MARK_STYLES: Record<Highlight["type"], string> = {
  strength: "bg-emerald-100 decoration-emerald-500 hover:bg-emerald-200",
  improvement: "bg-amber-100 decoration-amber-500 hover:bg-amber-200",
};

const BADGE_STYLES: Record<Highlight["type"], string> = {
  strength: "bg-emerald-100 text-emerald-700",
  improvement: "bg-amber-100 text-amber-700",
};

const BADGE_LABEL: Record<Highlight["type"], string> = {
  strength: "Strength",
  improvement: "To improve",
};

/**
 * Renders a student's submission with specific phrases underlined and
 * tinted by type (strength / improvement). Click a highlight to open its
 * comment. Feed it `studentFeedback.highlights` straight from grade() —
 * never `internal`, which still has the full rubric breakdown in it.
 */
export function HighlightedSubmission({ submission, highlights }: HighlightedSubmissionProps) {
  const segments = useMemo(() => buildSegments(submission, highlights), [submission, highlights]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
        {segments.map((seg, i) =>
          seg.highlight ? (
            <span key={i} className="relative inline">
              <mark
                className={`cursor-pointer rounded px-0.5 underline decoration-2 underline-offset-2 transition-colors ${MARK_STYLES[seg.highlight.type]}`}
                onClick={() => setActiveIndex(activeIndex === i ? null : i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveIndex(activeIndex === i ? null : i);
                  }
                }}
              >
                {seg.text}
              </mark>
              {activeIndex === i && (
                <span
                  role="tooltip"
                  className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 shadow-lg"
                >
                  <span
                    className={`mb-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${BADGE_STYLES[seg.highlight.type]}`}
                  >
                    {BADGE_LABEL[seg.highlight.type]}
                  </span>
                  <span className="block space-y-2">
                    {splitFeedbackParagraphs(seg.highlight.comment).map((paragraph, paragraphIndex) => (
                      <span key={paragraphIndex} className="block">{paragraph}</span>
                    ))}
                  </span>
                </span>
              )}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
    </div>
  );
}
