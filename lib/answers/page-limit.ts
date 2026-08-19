export const ANSWER_PAGE_LIMIT = 2;

export function getPageLimitViolation(imageCount: number) {
  return imageCount > ANSWER_PAGE_LIMIT
    ? { imageCount, pageLimit: ANSWER_PAGE_LIMIT }
    : null;
}

export function answerPageLabel() {
  return `${ANSWER_PAGE_LIMIT} answer pages/${ANSWER_PAGE_LIMIT} photos`;
}
