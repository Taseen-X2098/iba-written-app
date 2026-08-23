export function splitFeedbackParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n(?:[\t ]*\n)*/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function FeedbackParagraphs({
  text,
  className = "",
  paragraphClassName = "",
}: {
  text: string;
  className?: string;
  paragraphClassName?: string;
}) {
  return (
    <div className={className}>
      {splitFeedbackParagraphs(text).map((paragraph, index) => (
        <p key={index} className={paragraphClassName}>{paragraph}</p>
      ))}
    </div>
  );
}
