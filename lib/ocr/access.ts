import "server-only";

import { ApiError } from "@/lib/api/errors";
import { getAvailableTestSlots } from "@/lib/exams/attempts";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_OCR_SLOTS_MESSAGE =
  "OCR is available only while you have at least one test slot remaining.";

async function isActiveFreeOfficialAttempt(input: {
  attemptId: string;
  userId: string;
}) {
  const admin = createAdminClient();
  const { data: attempt, error: attemptError } = await admin
    .from("exam_attempts")
    .select("exam_id, mode, status")
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .eq("mode", "official")
    .eq("status", "active")
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (
    !attempt
    || attempt.mode !== "official"
    || attempt.status !== "active"
  ) {
    return false;
  }

  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("is_free")
    .eq("id", attempt.exam_id)
    .maybeSingle();
  if (examError) throw examError;
  return exam?.is_free === true;
}

/**
 * Authorize OCR without trusting exam metadata supplied by the browser.
 * A slotless exception exists only for the authenticated student's active,
 * official attempt when its immutable exam audience is marked free.
 * This exception is intentionally OCR-only; student-triggered grading keeps
 * using the atomic standalone/practice usage reservations.
 */
export async function requireOcrAccess(input: {
  userId: string;
  attemptId?: string | null;
}) {
  if (await getAvailableTestSlots(input.userId) > 0) return;

  if (
    input.attemptId
    && await isActiveFreeOfficialAttempt({
      attemptId: input.attemptId,
      userId: input.userId,
    })
  ) {
    return;
  }

  throw new ApiError("INSUFFICIENT_SLOTS", NO_OCR_SLOTS_MESSAGE, 403);
}
