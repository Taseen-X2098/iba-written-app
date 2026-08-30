import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";
import { getPersonalProgressionCard, hasPersonalProgressionAccess } from "@/lib/learning/progression";
import { assertExamAudienceAccess } from "@/lib/exams/access";

function joinedQuestionCategory(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const joined = (row as Record<string, unknown>).questions;
  const question = Array.isArray(joined) ? joined[0] : joined;
  if (!question || typeof question !== "object") return null;
  const category = (question as Record<string, unknown>).category;
  return typeof category === "string" ? category : null;
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireApiUser();
    const { jobId: rawJobId } = await context.params;
    const jobId = parseRequestValue(uuidSchema, rawJobId, "A valid grading job id is required");
    const admin = await createAdminClient();
    const { data: job, error } = await admin
      .from("grading_jobs")
      .select("id, kind, exam_id, attempt_id, requested_by, status, total_items, completed_items, failed_items, last_error, created_at, updated_at")
      .eq("id", jobId)
      .single();
    if (error || !job) throw new ApiError("GRADING_INCOMPLETE", "Grading job not found", 404);

    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) {
      await assertExamAudienceAccess({ examId: job.exam_id, userId: user.id });
      if (job.requested_by !== user.id) {
        throw new ApiError("GRADING_INCOMPLETE", "Grading job not found", 404);
      }
    }

    const { data: items, error: itemsError } = await admin
      .from("grading_job_items")
      .select("exam_question_id, status, result, last_error")
      .eq("job_id", jobId)
      .order("created_at");
    if (itemsError) throw itemsError;
    const personalProgressionReports: Record<string, Awaited<ReturnType<typeof getPersonalProgressionCard>>> = {};
    if (job.kind === "practice_exam" && job.requested_by === user.id && job.status === "completed") {
      const examQuestionIds = [...new Set((items ?? []).map((item) => item.exam_question_id))];
      const { data: questionRows } = await admin
        .from("exam_questions")
        .select("id, questions(category)")
        .in("id", examQuestionIds.length ? examQuestionIds : ["00000000-0000-0000-0000-000000000000"]);
      const categories = [...new Set((questionRows ?? [])
        .map(joinedQuestionCategory)
        .filter((category): category is string => Boolean(category) && category !== "translation"))];
      const access = await hasPersonalProgressionAccess(user.id);
      await Promise.all(categories.map(async (category) => {
        personalProgressionReports[category] = await getPersonalProgressionCard({
          userId: user.id,
          submissionType: category,
          access,
        });
      }));
    }
    return NextResponse.json({ job, items: items ?? [], personalProgressionReports });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
