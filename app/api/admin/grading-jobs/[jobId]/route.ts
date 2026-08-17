import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { wakeGradingWorker } from "@/lib/grading/jobs";

export async function DELETE(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requireAdminUser();
    const { jobId } = await context.params;
    const admin = await createAdminClient();
    const { error } = await admin.from("grading_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", jobId).in("status", ["queued", "running"]);
    if (error) throw error;
    await admin.from("grading_job_items").update({ status: "cancelled" }).eq("job_id", jobId).eq("status", "queued");
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requireAdminUser();
    const { jobId } = await context.params;
    const admin = await createAdminClient();
    const { data: job } = await admin.from("grading_jobs").select("id, status").eq("id", jobId).single();
    if (!job || !["failed", "cancelled"].includes(job.status)) throw new ApiError("GRADING_INCOMPLETE", "Only failed or cancelled jobs can be resumed", 409);
    await admin.from("grading_job_items").update({ status: "queued", next_attempt_at: new Date().toISOString(), last_error: null }).eq("job_id", jobId).in("status", ["failed", "cancelled"]);
    await admin.from("grading_jobs").update({ status: "queued", failed_items: 0, completed_at: null, last_error: null }).eq("id", jobId);
    await wakeGradingWorker();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

