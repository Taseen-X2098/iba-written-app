export const WORD_LIMIT_BANDS = [
  { maximumMarks: 5, wordLimit: 60 },
  { maximumMarks: 8, wordLimit: 90 },
  { maximumMarks: 10, wordLimit: 120 },
  { maximumMarks: 12, wordLimit: 140 },
  { maximumMarks: 13, wordLimit: 150 },
  { maximumMarks: Number.POSITIVE_INFINITY, wordLimit: 180 },
] as const;

/**
 * Returns the answer cap for a mark value. Seeded questions use 5, 6-8, 10,
 * 12, 13, and 15 marks. Admin-defined in-between values use the next higher
 * band so every valid exam mark has one deterministic server/client limit.
 */
export function wordLimitForMarks(marks: number) {
  return WORD_LIMIT_BANDS.find((band) => marks <= band.maximumMarks)!.wordLimit;
}

export function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function getWordLimitViolation(text: string, marks: number) {
  const wordLimit = wordLimitForMarks(marks);
  const wordCount = countWords(text);
  return wordCount > wordLimit ? { wordCount, wordLimit } : null;
}
