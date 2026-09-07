import { requireApiUser } from "@/lib/auth";
import { getAvailableTestSlots, persistAttemptDraftUpdates } from "@/lib/exams/attempts";
import { finalizeOfficialAttempt, lockPracticeAttempt } from "@/lib/exams/finalize";
import { resolveOcrContext } from "@/lib/ocr/context";
import {
  beginExamOcrOperation,
  finishExamOcrOperation,
  requirePendingExamOcrOperation,
} from "@/lib/ocr/exam-operations";
import { enforceOcrDailyProviderLimit, enforceOcrRateLimit } from "@/lib/ocr/rate-limit";
import { completeOcrRequest, reserveOcrRequest } from "@/lib/ocr/usage";
import { extractTextWithZai, ZaiOcrError } from "@/lib/ocr/zai";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({
  getAvailableTestSlots: jest.fn(),
  persistAttemptDraftUpdates: jest.fn(),
}));
jest.mock("@/lib/exams/finalize", () => ({
  finalizeOfficialAttempt: jest.fn(),
  lockPracticeAttempt: jest.fn(),
}));
jest.mock("@/lib/ocr/context", () => ({ resolveOcrContext: jest.fn() }));
jest.mock("@/lib/ocr/exam-operations", () => ({
  beginExamOcrOperation: jest.fn(),
  finishExamOcrOperation: jest.fn(),
  requirePendingExamOcrOperation: jest.fn(),
}));
jest.mock("@/lib/ocr/rate-limit", () => ({
  enforceOcrDailyProviderLimit: jest.fn(),
  enforceOcrRateLimit: jest.fn(),
}));
jest.mock("@/lib/ocr/usage", () => ({
  reserveOcrRequest: jest.fn(),
  completeOcrRequest: jest.fn(),
}));
jest.mock("@/lib/ocr/zai", () => {
  const actual = jest.requireActual<typeof import("@/lib/ocr/zai")>("@/lib/ocr/zai");
  return { ...actual, extractTextWithZai: jest.fn() };
});

const USER_ID = "10000000-0000-0000-0000-000000000001";
const QUESTION_ID = "20000000-0000-0000-0000-000000000002";
const ATTEMPT_ID = "40000000-0000-4000-8000-000000000004";
const EXAM_QUESTION_ID = "50000000-0000-4000-8000-000000000005";
const OCR_OPERATION_ID = "60000000-0000-4000-8000-000000000006";
const mockedRequireUser = jest.mocked(requireApiUser);
const mockedGetSlots = jest.mocked(getAvailableTestSlots);
const mockedPersistDrafts = jest.mocked(persistAttemptDraftUpdates);
const mockedFinalize = jest.mocked(finalizeOfficialAttempt);
const mockedLockPractice = jest.mocked(lockPracticeAttempt);
const mockedResolveContext = jest.mocked(resolveOcrContext);
const mockedBeginExamOperation = jest.mocked(beginExamOcrOperation);
const mockedFinishExamOperation = jest.mocked(finishExamOcrOperation);
const mockedRequireExamOperation = jest.mocked(requirePendingExamOcrOperation);
const mockedRateLimit = jest.mocked(enforceOcrRateLimit);
const mockedDailyLimit = jest.mocked(enforceOcrDailyProviderLimit);
const mockedReserve = jest.mocked(reserveOcrRequest);
const mockedComplete = jest.mocked(completeOcrRequest);
const mockedExtract = jest.mocked(extractTextWithZai);

function makeRequest(imageCount = 1) {
  const formData = new FormData();
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let index = 0; index < imageCount; index += 1) {
    formData.append("image", new File([pngHeader, `answer image ${index}`], `answer-${index + 1}.png`, { type: "image/png" }));
  }
  formData.append("questionId", QUESTION_ID);
  return new Request("http://localhost/api/ocr", { method: "POST", body: formData });
}

function makeExamRequest(reserved = true) {
  const formData = new FormData();
  formData.append("image", new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "exam answer",
  ], "exam-answer.png", { type: "image/png" }));
  formData.append("attemptId", ATTEMPT_ID);
  formData.append("examQuestionId", EXAM_QUESTION_ID);
  formData.append("writerToken", "writer-token-that-is-long-enough");
  if (reserved) formData.append("ocrOperationId", OCR_OPERATION_ID);
  return new Request("http://localhost/api/ocr", {
    method: "POST",
    body: formData,
    ...(reserved
      ? { headers: { "x-exam-ocr-operation-id": OCR_OPERATION_ID } }
      : {}),
  });
}

describe("POST /api/ocr", () => {
  const originalMock = process.env.Z_AI_MOCK;
  const originalKey = process.env.Z_AI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireUser.mockResolvedValue({ id: USER_ID } as Awaited<ReturnType<typeof requireApiUser>>);
    mockedGetSlots.mockResolvedValue(1);
    mockedResolveContext.mockResolvedValue({
      contextKey: `standalone:${QUESTION_ID}:0`,
      questionId: QUESTION_ID,
      attemptId: null,
      examQuestionId: null,
      writerToken: null,
      attemptMode: null,
      attemptExpiresAt: null,
      questionMarks: null,
    });
    mockedRateLimit.mockResolvedValue();
    mockedDailyLimit.mockResolvedValue();
    mockedReserve.mockImplementation(async (input) => ({
      id: "30000000-0000-0000-0000-000000000003",
      request_token: input.requestToken,
      status: "pending",
      extracted_text: null,
    }));
    mockedComplete.mockResolvedValue();
    mockedPersistDrafts.mockResolvedValue();
    mockedBeginExamOperation.mockImplementation(async (input) => ({
      id: input.operationId,
      attempt_id: input.attemptId,
      exam_question_id: input.examQuestionId,
      user_id: input.userId,
      status: "pending",
      extracted_text: null,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      completed_at: null,
    }));
    mockedRequireExamOperation.mockImplementation(async (input) => ({
      id: input.operationId,
      attempt_id: input.attemptId,
      exam_question_id: input.examQuestionId,
      user_id: input.userId,
      status: "pending",
      extracted_text: null,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      completed_at: null,
    }));
    mockedFinishExamOperation.mockImplementation(async (input) => ({
      id: "60000000-0000-4000-8000-000000000006",
      attempt_id: ATTEMPT_ID,
      exam_question_id: EXAM_QUESTION_ID,
      user_id: input.userId,
      status: input.success ? "succeeded" : "failed",
      extracted_text: input.extractedText ?? null,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      completed_at: new Date().toISOString(),
    }));
    mockedFinalize.mockResolvedValue({ alreadyFinalized: false, attempt: {} as never });
    mockedLockPractice.mockResolvedValue({} as never);
  });

  afterAll(() => {
    if (originalMock === undefined) delete process.env.Z_AI_MOCK;
    else process.env.Z_AI_MOCK = originalMock;
    if (originalKey === undefined) delete process.env.Z_AI_API_KEY;
    else process.env.Z_AI_API_KEY = originalKey;
  });

  it("blocks OCR without consuming anything when no slot remains", async () => {
    process.env.Z_AI_MOCK = "true";
    mockedGetSlots.mockResolvedValue(0);

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "INSUFFICIENT_SLOTS",
    }));
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedReserve).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("releases an early reservation if eligibility changes before image processing", async () => {
    process.env.Z_AI_MOCK = "true";
    mockedGetSlots.mockResolvedValue(0);

    const response = await POST(makeExamRequest());

    expect(response.status).toBe(403);
    expect(mockedFinishExamOperation).toHaveBeenCalledWith({
      operationId: OCR_OPERATION_ID,
      userId: USER_ID,
      success: false,
    });
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedReserve).not.toHaveBeenCalled();
  });

  it("uses the local OCR path only when Z_AI_MOCK is exactly true", async () => {
    process.env.Z_AI_MOCK = "true";
    delete process.env.Z_AI_API_KEY;

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      text: expect.stringContaining("quick brown fox"),
      cached: false,
    }));
    expect(mockedExtract).not.toHaveBeenCalled();
    expect(mockedReserve).toHaveBeenCalledWith(expect.objectContaining({
      contextKey: `standalone:${QUESTION_ID}:0:processor:mock:v3`,
    }));
    expect(mockedComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("rejects page photos above the server-resolved question limit", async () => {
    process.env.Z_AI_MOCK = "true";

    const response = await POST(makeRequest(3));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "VALIDATION_ERROR",
      details: { imageCount: 3, pageLimit: 2 },
    }));
    expect(mockedReserve).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes do not match its declared image type", async () => {
    process.env.Z_AI_MOCK = "true";
    const formData = new FormData();
    formData.append("image", new File(["not a png"], "answer.png", { type: "image/png" }));
    formData.append("questionId", QUESTION_ID);

    const response = await POST(new Request("http://localhost/api/ocr", { method: "POST", body: formData }));

    expect(response.status).toBe(415);
    expect(mockedReserve).not.toHaveBeenCalled();
  });

  it("processes an allowed multi-page answer in one server-validated batch", async () => {
    process.env.Z_AI_MOCK = "true";
    const response = await POST(makeRequest(2));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: expect.stringMatching(/quick brown fox[\s\S]+quick brown fox/),
      cached: false,
    });
    expect(mockedReserve).toHaveBeenCalledTimes(2);
    expect(mockedComplete).toHaveBeenCalledTimes(2);
  });

  it("returns a duplicate image from cache without using the daily provider allowance", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedReserve.mockResolvedValue({
      id: "30000000-0000-0000-0000-000000000003",
      request_token: "an-existing-token",
      status: "succeeded",
      extracted_text: "Previously extracted answer",
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Previously extracted answer",
      cached: true,
    });
    expect(mockedDailyLimit).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("uses Z.ai when mock mode is false", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedExtract.mockResolvedValue("Real extracted answer");

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Real extracted answer",
      cached: false,
    });
    expect(mockedExtract).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "zai-real-key",
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      providerUserId: expect.stringMatching(/^user_[0-9a-f]{32}$/),
    }));
    expect(mockedReserve).toHaveBeenCalledWith(expect.objectContaining({
      contextKey: `standalone:${QUESTION_ID}:0:processor:zai:glm-ocr:v3`,
    }));
  });

  it("durably saves a last-second exam scan before triggering finalization", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedExtract.mockResolvedValue("Last-second recognized answer");
    mockedResolveContext.mockResolvedValue({
      contextKey: `exam:${ATTEMPT_ID}:${EXAM_QUESTION_ID}`,
      questionId: null,
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
      writerToken: "writer-token-that-is-long-enough",
      attemptMode: "official",
      attemptExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      questionMarks: 10,
    });

    const response = await POST(makeExamRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Last-second recognized answer",
      cached: false,
      draftSaved: true,
      completionTriggered: true,
    });
    expect(mockedRequireExamOperation).toHaveBeenCalledWith(expect.objectContaining({
      operationId: OCR_OPERATION_ID,
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
    }));
    expect(mockedBeginExamOperation).not.toHaveBeenCalled();
    expect(mockedPersistDrafts).toHaveBeenCalledWith(ATTEMPT_ID, {
      [EXAM_QUESTION_ID]: expect.objectContaining({
        ocrText: "Last-second recognized answer",
        editedText: "Last-second recognized answer",
      }),
    });
    expect(mockedFinishExamOperation).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      extractedText: "Last-second recognized answer",
    }));
    expect(mockedFinalize).toHaveBeenCalledWith({ attemptId: ATTEMPT_ID });
    expect(mockedLockPractice).not.toHaveBeenCalled();

    const requireOrder = mockedRequireExamOperation.mock.invocationCallOrder[0];
    const finishOrder = mockedFinishExamOperation.mock.invocationCallOrder[0];
    const finalizeOrder = mockedFinalize.mock.invocationCallOrder[0];
    expect(requireOrder).toBeLessThan(finishOrder);
    expect(finishOrder).toBeLessThan(finalizeOrder);
  });

  it("releases the finalization barrier when an exam scan fails", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedExtract.mockRejectedValue(new ZaiOcrError("Provider unavailable", 502));
    mockedResolveContext.mockResolvedValue({
      contextKey: `exam:${ATTEMPT_ID}:${EXAM_QUESTION_ID}`,
      questionId: null,
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
      writerToken: "writer-token-that-is-long-enough",
      attemptMode: "official",
      attemptExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      questionMarks: 10,
    });

    const response = await POST(makeExamRequest());

    expect(response.status).toBe(502);
    expect(mockedFinishExamOperation).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
    }));
    expect(mockedPersistDrafts).not.toHaveBeenCalled();
    expect(mockedFinalize).not.toHaveBeenCalled();
  });

  it("strips provider HTML again before returning or storing the response", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedExtract.mockResolvedValue("<table><tr><td>Plain answer</td></tr></table>");

    const response = await POST(makeRequest());

    await expect(response.json()).resolves.toEqual({ text: "Plain answer", cached: false });
    expect(mockedComplete).toHaveBeenCalledWith(expect.objectContaining({
      extractedText: "Plain answer",
    }));
  });

  it("fails closed when real OCR has no API key", async () => {
    process.env.Z_AI_MOCK = "false";
    delete process.env.Z_AI_API_KEY;

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(mockedReserve).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });
});
