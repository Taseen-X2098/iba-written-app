import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createOfficialGradingJob } from "@/lib/grading/jobs";
import { parseJsonRequest } from "@/lib/api/request";

const schema = z.object({
  submissionId: z.string().uuid(),
  allowRegrade: z.literal(false).optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    const input = await parseJsonRequest(request, schema, {
      maxBytes: 8_000,
      message: "Invalid AI grading request",
    });
    const job = await createOfficialGradingJob({
      examId: await examIdForSubmission(input.submissionId),
      requestedBy: user.id,
      submissionIds: [input.submissionId],
      scope: "selected",
      allowRegrade: input.allowRegrade,
    });
    return NextResponse.json({ success: true, jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function examIdForSubmission(submissionId: string) {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const admin = await createAdminClient();
  const { data, error } = await admin.from("exam_submissions").select("exam_id").eq("id", submissionId).single();
  if (error || !data) throw new ApiError("VALIDATION_ERROR", "Submission not found", 404);
  return data.exam_id;
}
