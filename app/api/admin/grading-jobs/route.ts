import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { adminGradingJobSchema } from "@/lib/exams/contracts";
import { createOfficialGradingJob } from "@/lib/grading/jobs";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod";

const listJobsSchema = z.object({ examId: z.string().uuid().optional() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    const input = await parseJsonRequest(request, adminGradingJobSchema, {
      maxBytes: 250_000,
      message: "Invalid grading job",
    });
    if (input.scope === "selected" && !input.submissionIds?.length) {
      throw new ApiError("VALIDATION_ERROR", "Select at least one answer", 400);
    }
    await enforceRateLimit({ key: `admin-grading:${user.id}`, limit: 20, windowSeconds: 60 });
    const job = await createOfficialGradingJob({ ...input, requestedBy: user.id });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser();
    const { examId } = parseRequestValue(
      listJobsSchema,
      { examId: request.nextUrl.searchParams.get("examId") ?? undefined },
      "Invalid grading-job filters",
    );
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
