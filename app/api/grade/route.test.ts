import { requireApiUser, requireQuestionAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({
  requireApiUser: jest.fn(),
  requireQuestionAccess: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

const QUESTION_ID = "20000000-0000-4000-8000-000000000002";

describe("POST /api/grade word-limit enforcement", () => {
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
        submissionText: "word ".repeat(121),
        ocrText: "",
        timeTakenSeconds: 60,
      }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "VALIDATION_ERROR",
      details: { wordCount: 121, wordLimit: 120 },
    }));
    expect(rpc).not.toHaveBeenCalled();
  });
});
