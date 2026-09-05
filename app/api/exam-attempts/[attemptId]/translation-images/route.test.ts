import { NextRequest } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { getTranslationAnswerImagePreviews } from "@/lib/exams/translation-images";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({ requireAttemptWriter: jest.fn() }));
jest.mock("@/lib/exams/translation-images", () => ({
  TRANSLATION_IMAGE_BUCKET: "translation-answer-images",
  getTranslationAnswerImagePreviews: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

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

    const previousRowsResult = { data: [], error: null };
    const imageQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(),
      gt: jest.fn().mockResolvedValue({ error: null }),
      then: (onfulfilled, onrejected) => Promise.resolve(previousRowsResult).then(onfulfilled, onrejected),
    } as {
      select: jest.Mock;
      eq: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      gt: jest.Mock;
    } & PromiseLike<typeof previousRowsResult>;
    imageQuery.select.mockReturnValue(imageQuery);
    imageQuery.eq.mockReturnValue(imageQuery);
    imageQuery.delete.mockReturnValue(imageQuery);

    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn((table: string) => table === "exam_questions" ? examQuestionQuery : imageQuery),
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
  });

  it("rejects an image after the final network grace period", async () => {
    jest.mocked(requireAttemptWriter).mockResolvedValue({
      id: ATTEMPT_ID,
      exam_id: EXAM_ID,
      user_id: USER_ID,
      mode: "official",
      status: "active",
      expires_at: new Date(Date.now() - 3 * 60_000 - 1_000).toISOString(),
    } as Awaited<ReturnType<typeof requireAttemptWriter>>);

    const response = await POST(formRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "ATTEMPT_EXPIRED",
    }));
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
