import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function DELETE(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requireAdminUser();
    const { jobId: rawJobId } = await context.params;
    const jobId = parseRequestValue(uuidSchema, rawJobId, "A valid grading job id is required");
    const admin = await createAdminClient();
    const { data: job } = await admin
      .from("grading_jobs")
      .select("id, kind, attempt_id")
      .eq("id", jobId)
      .single();
    const { data: cancelledJob, error } = await admin
      .from("grading_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "running"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    await admin.from("grading_job_items").update({ status: "cancelled" }).eq("job_id", jobId).eq("status", "queued");
    if (cancelledJob && job?.kind === "practice_exam" && job.attempt_id) {
      const now = new Date().toISOString();
      const { error: attemptError } = await admin
        .from("exam_attempts")
        .update({ status: "finalized", finalized_at: now, updated_at: now })
        .eq("id", job.attempt_id)
        .eq("status", "grading");
      if (attemptError) throw attemptError;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requireAdminUser();
    const { jobId: rawJobId } = await context.params;
    const jobId = parseRequestValue(uuidSchema, rawJobId, "A valid grading job id is required");
    const admin = await createAdminClient();
    const { data: job } = await admin.from("grading_jobs").select("id, status, kind, attempt_id").eq("id", jobId).single();
    if (!job || !["failed", "cancelled"].includes(job.status)) throw new ApiError("GRADING_INCOMPLETE", "Only failed or cancelled jobs can be resumed", 409);
    if (job.kind === "practice_exam" && job.attempt_id) {
      const { error: attemptError } = await admin
        .from("exam_attempts")
        .update({ status: "grading", finalized_at: null, updated_at: new Date().toISOString() })
        .eq("id", job.attempt_id)
        .eq("status", "finalized");
      if (attemptError) throw attemptError;
    }
    await admin.from("grading_job_items").update({ status: "queued", next_attempt_at: new Date().toISOString(), last_error: null }).eq("job_id", jobId).in("status", ["failed", "cancelled"]);
    await admin.from("grading_jobs").update({ status: "queued", failed_items: 0, completed_at: null, last_error: null }).eq("id", jobId);
    await wakeGradingWorker();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
