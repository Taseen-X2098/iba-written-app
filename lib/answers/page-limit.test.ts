import {
  ANSWER_PAGE_LIMIT,
  answerPageLabel,
  getPageLimitViolation,
} from "./page-limit";

describe("answer page limits", () => {
  it("uses the same two-page limit for every question", () => {
    expect(ANSWER_PAGE_LIMIT).toBe(2);
    expect(answerPageLabel()).toBe("2 answer pages/2 photos");
  });

  it("allows two photos and rejects a third", () => {
    expect(getPageLimitViolation(2)).toBeNull();
    expect(getPageLimitViolation(3)).toEqual({ imageCount: 3, pageLimit: 2 });
  });
});
