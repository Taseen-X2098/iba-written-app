import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis } from "@/lib/redis";
import {
  assertAttemptDraftWordLimits,
  getAttempt,
  getAttemptDrafts,
  getAvailableTestSlots,
  requireAttemptWriter,
} from "@/lib/exams/attempts";
import { finalizeExpiredOfficialAttempt, finalizeOfficialAttempt } from "./finalize";

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

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(rpc).toHaveBeenCalledWith("finalize_exam_attempt_durable", {
      p_attempt_id: "attempt-1",
      p_user_id: null,
      p_writer_token_hash: null,
      p_cached_drafts: {},
    });
  });

  it("finalizes an expired owner's attempt from server-held drafts only", async () => {
    const drafts = {
      "question-1": {
        ocrText: "acknowledged",
        editedText: "acknowledged",
        updatedAt: new Date().toISOString(),
      },
    };
    jest.mocked(assertAttemptDraftWordLimits).mockResolvedValue(drafts);
    const finalized = { id: "attempt-1", status: "finalized" };
    const rpc = jest.fn().mockResolvedValue({ data: finalized, error: null });
    const del = jest.fn();
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    jest.mocked(getRedis).mockReturnValue({ del } as never);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).resolves.toEqual({ alreadyFinalized: false, attempt: finalized });

    expect(getAttempt).toHaveBeenCalledWith("attempt-1", "student-1");
    expect(rpc).toHaveBeenCalledWith("finalize_expired_exam_attempt", {
      p_attempt_id: "attempt-1",
      p_user_id: "student-1",
      p_drafts: drafts,
    });
    expect(del).toHaveBeenCalledWith("attempt:attempt-1:drafts");
  });

  it("does not invoke the privileged RPC before the timer has ended", async () => {
    jest.mocked(getAttempt).mockResolvedValue({
      id: "attempt-1",
      exam_id: "exam-1",
      user_id: "student-1",
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() + 1_000).toISOString(),
    } as Awaited<ReturnType<typeof getAttempt>>);
    const rpc = jest.fn();
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).rejects.toMatchObject({
      code: "ATTEMPT_NOT_EXPIRED",
      status: 409,
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(assertAttemptDraftWordLimits).not.toHaveBeenCalled();
  });

  it("never treats a practice attempt as an expired official attempt", async () => {
    jest.mocked(getAttempt).mockResolvedValue({
      id: "attempt-1",
      exam_id: "exam-1",
      user_id: "student-1",
      mode: "practice",
      status: "active",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof getAttempt>>);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(assertAttemptDraftWordLimits).not.toHaveBeenCalled();
  });

  it("is idempotent without reading or deleting drafts after finalization", async () => {
    const finalized = {
      id: "attempt-1",
      exam_id: "exam-1",
      user_id: "student-1",
      mode: "official",
      status: "finalized",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof getAttempt>>;
    jest.mocked(getAttempt).mockResolvedValue(finalized);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).resolves.toEqual({ alreadyFinalized: true, attempt: finalized });

    expect(assertAttemptDraftWordLimits).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps a live OCR operation retryable on expired owner reconciliation", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "OCR_PENDING" },
    });
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).rejects.toMatchObject({ code: "OCR_PENDING", status: 409 });
  });

  it("finalizes from durable storage when the Redis resume cache is unavailable", async () => {
    const cacheError = new Error("Redis unavailable");
    jest.mocked(getAttemptDrafts).mockRejectedValue(cacheError);
    const rpc = jest.fn().mockResolvedValue({
      data: { id: "attempt-1", status: "finalized" },
      error: null,
    });
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).resolves.toMatchObject({ alreadyFinalized: false });

    expect(assertAttemptDraftWordLimits).toHaveBeenCalledWith(
      "attempt-1",
      "exam-1",
      {},
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("resume cache"),
      cacheError,
    );
  });

  it("does not report failure after finalization if cache cleanup fails", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: "attempt-1", status: "finalized" },
      error: null,
    });
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    const cleanupError = new Error("Redis unavailable");
    jest.mocked(getRedis).mockReturnValue({
      del: jest.fn().mockRejectedValue(cleanupError),
    } as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(finalizeExpiredOfficialAttempt({
      attemptId: "attempt-1",
      userId: "student-1",
    })).resolves.toMatchObject({ alreadyFinalized: false });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("clear the finalized exam draft cache"),
      cleanupError,
    );
  });
});
