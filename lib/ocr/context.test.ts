import { requireQuestionAccess } from "@/lib/auth";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveOcrContext } from "./context";

jest.mock("@/lib/auth", () => ({ requireQuestionAccess: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({ requireAttemptWriter: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "20000000-0000-4000-8000-000000000002";
const EXAM_ID = "30000000-0000-4000-8000-000000000003";
const EXAM_QUESTION_ID = "40000000-0000-4000-8000-000000000004";

function queryReturning(data: unknown) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("resolveOcrContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireQuestionAccess).mockResolvedValue();
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);
  });

  it("rejects an exam translation before any OCR provider can receive its image", async () => {
    const query = queryReturning({
      id: EXAM_QUESTION_ID,
      questions: { category: "translation" },
    });
    jest.mocked(createAdminClient).mockResolvedValue({
      from: jest.fn(() => query),
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);
    const formData = new FormData();
    formData.set("attemptId", ATTEMPT_ID);
    formData.set("examQuestionId", EXAM_QUESTION_ID);
    formData.set("writerToken", "writer-token-that-is-long-enough");

    await expect(resolveOcrContext(formData, USER_ID)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 409,
      message: expect.stringContaining("never sent to OCR"),
    });
  });
});
