export const DEFAULT_IMPROVEMENT_ACTIONS = [
  "Revise the highest-impact weakness identified in the remarks before making smaller edits.",
  "Connect each supporting point directly to the main idea so the reasoning is easy to follow.",
  "Proofread the revised answer once more for grammar, punctuation, and clarity.",
] as const;

const LIST_SEPARATOR = /\n\s*\n|\n(?=\s*(?:[-*•]\s+|\d+[.)]\s*[A-Za-z]))|(?<=\S)\s+(?=\d+[.)]\s*[A-Za-z])/;
const LIST_PREFIX = /^(?:[-*•]\s+|\d+[.)]\s*)/;

/**
 * Accepts both the current array contract and legacy string feedback.
 * Number prefixes are removed because the UI owns list numbering.
 */
export function parseImprovementActions(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/\r\n/g, "\n").split(LIST_SEPARATOR)
      : [];

  return candidates
    .map((action) => String(action).trim().replace(LIST_PREFIX, ""))
    .filter(Boolean);
}

/** Stores a canonical numbered representation for summaries and persistence. */
export function formatNumberedImprovementList(value: unknown): string {
  const parsed = parseImprovementActions(value);
  const actions = parsed.length > 0 ? parsed : [...DEFAULT_IMPROVEMENT_ACTIONS];

  return actions.map((action, index) => `${index + 1}. ${action}`).join("\n");
}
