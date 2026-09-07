import { NextRequest } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import {
  beginTranslationImageOperation,
  getTranslationAnswerImagePreviews,
  replaceTranslationAnswerImages,
} from "@/lib/exams/translation-images";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishExamOcrOperation } from "@/lib/ocr/exam-operations";
import { EXAM_NETWORK_GRACE_MS } from "@/lib/exams/timing";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({ requireAttemptWriter: jest.fn() }));
jest.mock("@/lib/exams/translation-images", () => ({
  TRANSLATION_IMAGE_BUCKET: "translation-answer-images",
  beginTranslationImageOperation: jest.fn(),
  getTranslationAnswerImagePreviews: jest.fn(),
  replaceTranslationAnswerImages: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/ocr/exam-operations", () => ({ finishExamOcrOperation: jest.fn() }));

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "20000000-0000-4000-8000-000000000002";
const EXAM_ID = "30000000-0000-4000-8000-000000000003";
const EXAM_QUESTION_ID = "40000000-0000-4000-8000-000000000004";
const WRITER_TOKEN = "12345678901234567890123456789012";

function formRequest() {
  const formData = new FormData();
  formData.set("writerToken", WRITER_TOKEN);
  formData.set("examQuestionId", EXAM_QUESTION_ID);
  formData.set("image", new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "translation page",
  ], "translation.png", { type: "image/png" }));
  return new NextRequest(`http://localhost/api/exam-attempts/${ATTEMPT_ID}/translation-images`, {
    method: "POST",
    body: formData,
  });
}

describe("POST translation answer images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireApiUser).mockResolvedValue({ id: USER_ID } as never);
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);
    jest.mocked(getTranslationAnswerImagePreviews).mockResolvedValue({
      [EXAM_QUESTION_ID]: [{ id: "image-id", pageIndex: 1, url: "https://example.test/signed" }],
    });
    jest.mocked(beginTranslationImageOperation).mockResolvedValue({ id: "operation-id" } as never);
    jest.mocked(replaceTranslationAnswerImages).mockResolvedValue([]);
    jest.mocked(finishExamOcrOperation).mockResolvedValue({} as never);
  });

  it("stores the original page in the private human-review bucket", async () => {
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() - 30_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const examQuestionQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn().mockResolvedValue({
        data: { id: EXAM_QUESTION_ID, questions: { category: "translation" } },
        error: null,
      }),
    };
    examQuestionQuery.select.mockReturnValue(examQuestionQuery);
    examQuestionQuery.eq.mockReturnValue(examQuestionQuery);

    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn(() => examQuestionQuery),
      storage: { from: jest.fn(() => ({ upload, remove })) },
    } as unknown as ReturnType<typeof createAdminClient>);

    const response = await POST(formRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      manualReviewOnly: true,
      images: [{ id: "image-id", pageIndex: 1, url: "https://example.test/signed" }],
    });
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${USER_ID}/${ATTEMPT_ID}/${EXAM_QUESTION_ID}/1-.*\\.png$`)),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(beginTranslationImageOperation).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
      userId: USER_ID,
      writerToken: WRITER_TOKEN,
    }));
    expect(replaceTranslationAnswerImages).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      examQuestionId: EXAM_QUESTION_ID,
      userId: USER_ID,
      writerToken: WRITER_TOKEN,
      rows: [{ pageIndex: 1, storagePath: expect.stringMatching(/\.png$/) }],
    }));
    expect(jest.mocked(beginTranslationImageOperation).mock.invocationCallOrder[0])
      .toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(upload.mock.invocationCallOrder[0])
      .toBeLessThan(jest.mocked(replaceTranslationAnswerImages).mock.invocationCallOrder[0]);
  });

  it("rejects an image after the final network grace period", async () => {
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() - EXAM_NETWORK_GRACE_MS - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);

    const response = await POST(formRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "ATTEMPT_EXPIRED",
    }));
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
