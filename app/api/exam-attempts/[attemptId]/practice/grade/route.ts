import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { practiceSelectionSchema } from "@/lib/exams/contracts";
import { createPracticeGradingJob } from "@/lib/grading/jobs";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(uuidSchema, rawAttemptId, "A valid attempt id is required");
    const input = await parseJsonRequest(request, practiceSelectionSchema, {
      maxBytes: 16_000,
      message: "Invalid answer selection",
    });
    const result = await createPracticeGradingJob({
      attemptId,
      userId: user.id,
      writerToken: input.writerToken,
      examQuestionIds: input.examQuestionIds,
    });
    return NextResponse.json(result, { status: result.jobId ? 202 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
