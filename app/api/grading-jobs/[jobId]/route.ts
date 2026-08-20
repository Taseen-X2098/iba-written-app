import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

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
    if (job.requested_by !== user.id && !profile?.is_admin) throw new ApiError("FORBIDDEN", "Forbidden", 403);

    const { data: items, error: itemsError } = await admin
      .from("grading_job_items")
      .select("exam_question_id, status, result, last_error")
      .eq("job_id", jobId)
      .order("created_at");
    if (itemsError) throw itemsError;
    return NextResponse.json({ job, items: items ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
