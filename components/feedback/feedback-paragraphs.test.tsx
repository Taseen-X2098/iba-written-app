import { renderToStaticMarkup } from "react-dom/server";
import {
  FeedbackParagraphs,
  splitFeedbackParagraphs,
} from "./feedback-paragraphs";

describe("FeedbackParagraphs", () => {
  it("turns model line breaks into separate HTML paragraphs", () => {
    const text = "Your main point is clear.\n\nYour example needs more detail.\nAdd one exact fact next time.";

    expect(splitFeedbackParagraphs(text)).toEqual([
      "Your main point is clear.",
      "Your example needs more detail.",
      "Add one exact fact next time.",
    ]);

    const html = renderToStaticMarkup(<FeedbackParagraphs text={text} />);
    expect(html.match(/<p/g)).toHaveLength(3);
    expect(html).toContain("</p><p");
  });
});
