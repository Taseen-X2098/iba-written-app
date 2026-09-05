import { createAdminClient } from "@/lib/supabase/admin";
import type { TranslationAnswerImagePreview } from "@/lib/types";

export const TRANSLATION_IMAGE_BUCKET = "translation-answer-images";
const SIGNED_URL_LIFETIME_SECONDS = 4 * 60 * 60;

type TranslationAnswerImageRow = {
  id: string;
  exam_question_id: string;
  page_index: number;
  storage_path: string;
};

export async function getTranslationAnswerImagePreviews(attemptId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("translation_answer_images")
    .select("id, exam_question_id, page_index, storage_path")
    .eq("attempt_id", attemptId)
    .order("page_index", { ascending: true });
  if (error) throw error;

  const signedRows = await Promise.all((data ?? []).map(async (row: TranslationAnswerImageRow) => {
    const { data: signed, error: signedError } = await admin.storage
      .from(TRANSLATION_IMAGE_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_LIFETIME_SECONDS);
    if (signedError) throw signedError;
    return {
      examQuestionId: row.exam_question_id,
      image: {
        id: row.id,
        pageIndex: row.page_index,
        url: signed.signedUrl,
      } satisfies TranslationAnswerImagePreview,
    };
  }));

  return signedRows.reduce<Record<string, TranslationAnswerImagePreview[]>>((grouped, row) => {
    (grouped[row.examQuestionId] ??= []).push(row.image);
    return grouped;
  }, {});
}
