import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { practiceSelectionSchema } from "@/lib/exams/contracts";
import { createPracticeGradingJob } from "@/lib/grading/jobs";

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId } = await context.params;
    const parsed = practiceSelectionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid answer selection", 400, parsed.error.flatten());
    const result = await createPracticeGradingJob({
      attemptId,
      userId: user.id,
      writerToken: parsed.data.writerToken,
      examQuestionIds: parsed.data.examQuestionIds,
    });
    return NextResponse.json(result, { status: result.jobId ? 202 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

