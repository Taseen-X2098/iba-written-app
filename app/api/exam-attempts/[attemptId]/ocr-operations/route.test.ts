import { NextRequest } from "next/server";

import { ApiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { requireOcrAccess } from "@/lib/ocr/access";
import { beginExamOcrOperation } from "@/lib/ocr/exam-operations";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({
  requireAttemptWriter: jest.fn(),
}));
jest.mock("@/lib/ocr/access", () => ({ requireOcrAccess: jest.fn() }));
jest.mock("@/lib/ocr/exam-operations", () => ({
  beginExamOcrOperation: jest.fn(),
}));

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "20000000-0000-4000-8000-000000000002";
const EXAM_ID = "30000000-0000-4000-8000-000000000003";
const EXAM_QUESTION_ID = "40000000-0000-4000-8000-000000000004";
const OCR_OPERATION_ID = "50000000-0000-4000-8000-000000000005";
const WRITER_TOKEN = "12345678901234567890123456789012";

function makeRequest() {
  return new NextRequest(
    `http://localhost/api/exam-attempts/${ATTEMPT_ID}/ocr-operations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        writerToken: WRITER_TOKEN,
        examQuestionId: EXAM_QUESTION_ID,
      }),
    },
  );
}

describe("POST exam OCR operation reservation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireApiUser).mockResolvedValue({ id: USER_ID } as never);
    jest.mocked(requireOcrAccess).mockResolvedValue();
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);
    jest.mocked(beginExamOcrOperation).mockImplementation(async (input) => ({
      id: OCR_OPERATION_ID,
      attempt_id: input.attemptId,
      exam_question_id: input.examQuestionId,
      user_id: input.userId,
      status: "pending",
      extracted_text: null,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      completed_at: null,
    }));
  });

  it("creates the durable finalization barrier before the image upload", async () => {
    const response = await POST(makeRequest(), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      operationId: OCR_OPERATION_ID,
      leaseExpiresAt: expect.any(String),
    });
    expect(beginExamOcrOperation).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
      userId: USER_ID,
      writerToken: WRITER_TOKEN,
    }));
    expect(requireOcrAccess).toHaveBeenCalledWith({
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
    });
  });

  it("does not create a scan barrier when the verified attempt lacks OCR entitlement", async () => {
    jest.mocked(requireOcrAccess).mockRejectedValue(new ApiError(
      "INSUFFICIENT_SLOTS",
      "OCR is available only while you have at least one test slot remaining.",
      403,
    ));

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "INSUFFICIENT_SLOTS",
    }));
    expect(beginExamOcrOperation).not.toHaveBeenCalled();
  });

  it("does not let a new scan be reserved after the exam deadline", async () => {
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "ATTEMPT_EXPIRED",
    }));
    expect(beginExamOcrOperation).not.toHaveBeenCalled();
  });
});
