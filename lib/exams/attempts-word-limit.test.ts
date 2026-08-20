import { createAdminClient } from "@/lib/supabase/admin";
import { assertAttemptDraftWordLimits } from "./attempts";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

describe("exam attempt word-limit enforcement", () => {
  it("rejects persisted drafts that exceed their question limit", async () => {
    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: [{ id: "exam-question-1", marks: 5, order_index: 0 }],
              error: null,
            })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(assertAttemptDraftWordLimits("attempt-1", "exam-1", {
      "exam-question-1": {
        ocrText: "",
        editedText: "word ".repeat(91),
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    })).rejects.toEqual(expect.objectContaining({
      code: "VALIDATION_ERROR",
      status: 400,
      details: {
        violations: [{
          examQuestionId: "exam-question-1",
          questionNumber: 1,
          wordCount: 91,
          wordLimit: 90,
        }],
      },
    }));
  });
});
