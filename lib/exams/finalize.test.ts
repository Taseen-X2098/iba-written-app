import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis } from "@/lib/redis";
import {
  assertAttemptDraftWordLimits,
  getAttempt,
  getAttemptDrafts,
  getAvailableTestSlots,
  requireAttemptWriter,
} from "@/lib/exams/attempts";
import { finalizeOfficialAttempt } from "./finalize";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/redis", () => ({
  CacheKeys: { attemptDrafts: (attemptId: string) => `attempt:${attemptId}:drafts` },
  getRedis: jest.fn(),
}));
jest.mock("@/lib/exams/attempts", () => ({
  assertAttemptDraftWordLimits: jest.fn(),
  getAttempt: jest.fn(),
  getAttemptDrafts: jest.fn(),
  getAvailableTestSlots: jest.fn(),
  hashWriterToken: jest.fn((token: string) => `hashed:${token}`),
  requireAttemptWriter: jest.fn(),
}));

describe("finalizeOfficialAttempt OCR barrier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAttempt).mockResolvedValue({
      id: "attempt-1",
      exam_id: "exam-1",
      user_id: "student-1",
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof getAttempt>>);
    jest.mocked(assertAttemptDraftWordLimits).mockResolvedValue({});
    jest.mocked(getAttemptDrafts).mockResolvedValue({});
    jest.mocked(getAvailableTestSlots).mockResolvedValue(0);
    jest.mocked(requireAttemptWriter).mockResolvedValue({} as never);
    jest.mocked(getRedis).mockReturnValue({ del: jest.fn() } as never);
  });

  it("returns a retryable domain error instead of finalizing while OCR is pending", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "OCR_PENDING" },
    });
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    await expect(finalizeOfficialAttempt({ attemptId: "attempt-1", requireExpired: true }))
      .rejects.toMatchObject({
        code: "OCR_PENDING",
        status: 409,
        message: expect.stringContaining("still being scanned"),
      });
  });
});
