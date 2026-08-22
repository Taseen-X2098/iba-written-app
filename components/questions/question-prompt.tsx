import type { QuestionCategory } from "@/lib/types";
import { splitStoryCompletionPrompt } from "@/lib/questions/story-completion";

export function QuestionPrompt({
  prompt,
  category,
  className = "",
}: {
  prompt: string;
  category: QuestionCategory | string;
  className?: string;
}) {
  const story = splitStoryCompletionPrompt(prompt, category);

  if (!story) {
    return <p className={`whitespace-pre-wrap ${className}`}>{prompt}</p>;
  }

  return (
    <div className={className}>
      <p>{story.instruction}</p>
      <blockquote className="mt-4 whitespace-pre-line rounded-xl border-l-4 border-brand-500 bg-brand-50/70 px-5 py-4 font-serif font-medium leading-relaxed text-foreground">
        {story.starter}
      </blockquote>
    </div>
  );
}
