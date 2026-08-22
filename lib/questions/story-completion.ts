import type { QuestionCategory } from "@/lib/types";

export const STORY_COMPLETION_INSTRUCTION =
  "Complete the story beginning below. Copy the opening into your answer, then continue it.";

export const STORY_COMPLETION_MARKS = [8, 9, 10, 12, 13, 15] as const;

export function splitStoryCompletionPrompt(
  prompt: string,
  category: QuestionCategory | string,
): { instruction: string; starter: string } | null {
  if (category !== "story_completion") return null;

  const normalized = prompt.replaceAll("\r\n", "\n").trim();
  const separator = normalized.indexOf("\n\n");
  if (separator === -1) {
    return { instruction: STORY_COMPLETION_INSTRUCTION, starter: normalized };
  }

  return {
    instruction: normalized.slice(0, separator).trim(),
    starter: normalized.slice(separator + 2).trim(),
  };
}

export function questionPromptPreview(
  prompt: string,
  category: QuestionCategory | string,
) {
  return splitStoryCompletionPrompt(prompt, category)?.starter ?? prompt;
}
