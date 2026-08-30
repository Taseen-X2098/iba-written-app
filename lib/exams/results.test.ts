import { createClient } from "@/lib/supabase/server";
import { getOfficialExamResponse } from "./results";

jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const query: Record<string, jest.Mock | ((resolve: (value: QueryResult) => void) => void)> = {};
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.is = jest.fn(() => query);
  query.not = jest.fn(() => query);
  query.then = (resolve: (value: QueryResult) => void) => {
    void Promise.resolve(result).then(resolve);
  };
  return query;
}

describe("getOfficialExamResponse", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns finalized answers in question order without selecting grading data", async () => {
    const attemptQuery = chain({ data: null, error: null });
    attemptQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: { id: "attempt-1", status: "finalized" },
      error: null,
    });
    const responseQuery = chain({
      data: [
        {
          id: "submission-2",
          edited_text: "Second answer",
          exam_questions: { order_index: 2, questions: { prompt: "Second question" } },
        },
        {
          id: "submission-1",
          edited_text: "First answer",
          exam_questions: { order_index: 1, questions: { prompt: "First question" } },
        },
      ],
      error: null,
    });
    const from = jest.fn()
      .mockReturnValueOnce(attemptQuery)
      .mockReturnValueOnce(responseQuery);
    jest.mocked(createClient).mockResolvedValue({ from } as never);

    await expect(getOfficialExamResponse("exam-1", "user-1")).resolves.toEqual([
      { id: "submission-1", orderIndex: 1, prompt: "First question", answer: "First answer" },
      { id: "submission-2", orderIndex: 2, prompt: "Second question", answer: "Second answer" },
    ]);

    expect(responseQuery.select).toHaveBeenCalledWith(
      "id, edited_text, exam_questions(order_index, questions(prompt))",
    );
    expect(responseQuery.eq).toHaveBeenCalledWith("attempt_id", "attempt-1");
  });

  it("never exposes answers from an unfinished attempt", async () => {
    const attemptQuery = chain({ data: null, error: null });
    attemptQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: { id: "attempt-1", status: "active" },
      error: null,
    });
    const from = jest.fn().mockReturnValue(attemptQuery);
    jest.mocked(createClient).mockResolvedValue({ from } as never);

    await expect(getOfficialExamResponse("exam-1", "user-1")).resolves.toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("supports finalized legacy submissions that predate attempt records", async () => {
    const attemptQuery = chain({ data: null, error: null });
    attemptQuery.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const responseQuery = chain({ data: [], error: null });
    const from = jest.fn()
      .mockReturnValueOnce(attemptQuery)
      .mockReturnValueOnce(responseQuery);
    jest.mocked(createClient).mockResolvedValue({ from } as never);

    await getOfficialExamResponse("exam-1", "user-1");

    expect(responseQuery.is).toHaveBeenCalledWith("attempt_id", null);
    expect(responseQuery.not).toHaveBeenCalledWith("submitted_at", "is", null);
  });
});
