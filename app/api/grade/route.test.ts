import { requireApiUser, requireQuestionAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({
  requireApiUser: jest.fn(),
  requireQuestionAccess: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

const QUESTION_ID = "20000000-0000-4000-8000-000000000002";

describe("POST /api/grade safeguards", () => {
  const originalMockGrader = process.env.USE_MOCK_GRADER;

  beforeEach(() => {
    process.env.USE_MOCK_GRADER = "true";
  });

  afterAll(() => {
    if (originalMockGrader === undefined) delete process.env.USE_MOCK_GRADER;
    else process.env.USE_MOCK_GRADER = originalMockGrader;
  });

  it("rejects an oversized answer before reserving a test slot", async () => {
    jest.mocked(requireApiUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof requireApiUser>>);
    jest.mocked(requireQuestionAccess).mockResolvedValue(undefined);
    const rpc = jest.fn();
    jest.mocked(createAdminClient).mockResolvedValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: { id: QUESTION_ID, category: "basic_paragraph", marks: 10, is_active: true },
                error: null,
              })),
            })),
          })),
        })),
      })),
      rpc,
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);

    const response = await POST(new Request("http://localhost/api/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: QUESTION_ID,
        idempotencyKey: "30000000-0000-4000-8000-000000000003",
        submissionText: "word ".repeat(181),
        ocrText: "",
        timeTakenSeconds: 60,
      }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "VALIDATION_ERROR",
      details: { wordCount: 181, wordLimit: 180 },
    }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps standalone grading quota-gated when no test slot remains", async () => {
    jest.mocked(requireApiUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof requireApiUser>>);
    jest.mocked(requireQuestionAccess).mockResolvedValue(undefined);
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "INSUFFICIENT_SLOTS" },
    });
    jest.mocked(createAdminClient).mockResolvedValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: {
                  id: QUESTION_ID,
                  category: "basic_paragraph",
                  marks: 10,
                  prompt: "Write one paragraph.",
                  is_active: true,
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
      rpc,
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);

    const response = await POST(new Request("http://localhost/api/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: QUESTION_ID,
        idempotencyKey: "30000000-0000-4000-8000-000000000003",
        submissionText: "A concise answer that remains within the configured word limit.",
        ocrText: "",
        timeTakenSeconds: 60,
      }),
    }) as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "INSUFFICIENT_SLOTS",
    }));
    expect(rpc).toHaveBeenCalledWith("reserve_standalone_usage", {
      p_user_id: "user-1",
      p_question_id: QUESTION_ID,
      p_idempotency_key: "30000000-0000-4000-8000-000000000003",
    });
  });
});
