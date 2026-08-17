import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { adminGradingJobSchema } from "@/lib/exams/contracts";
import { createOfficialGradingJob } from "@/lib/grading/jobs";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    const parsed = adminGradingJobSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid grading job", 400, parsed.error.flatten());
    if (parsed.data.scope === "selected" && !parsed.data.submissionIds?.length) {
      throw new ApiError("VALIDATION_ERROR", "Select at least one answer", 400);
    }
    const job = await createOfficialGradingJob({ ...parsed.data, requestedBy: user.id });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const examId = request.nextUrl.searchParams.get("examId");
    const admin = await createAdminClient();
    let query = admin.from("grading_jobs").select("*").order("created_at", { ascending: false }).limit(20);
    if (examId) query = query.eq("exam_id", examId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

