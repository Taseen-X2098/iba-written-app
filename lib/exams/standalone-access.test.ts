jest.mock("server-only", () => ({}));

import { createAdminClient } from "@/lib/supabase/admin";
import { requireStandaloneQuestionNotEmbargoed } from "./standalone-access";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    limit: jest.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("standalone question embargo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows standalone access when no unreleased exam is withholding the question", async () => {
    const query = queryResult([]);
    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn(() => query),
    } as never);

    await expect(requireStandaloneQuestionNotEmbargoed("question-1"))
      .resolves.toBeUndefined();
  });

  it("blocks standalone OCR and grading for both draft and published unreleased exams", async () => {
    const query = queryResult([{ id: "exam-question-1" }]);
    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn(() => query),
    } as never);

    await expect(requireStandaloneQuestionNotEmbargoed("question-1"))
      .rejects.toMatchObject({ code: "RESULTS_EMBARGOED", status: 403 });
    expect(query.eq).toHaveBeenCalledWith("question_id", "question-1");
    expect(query.eq).toHaveBeenCalledWith("exams.results_published", false);
  });
});
