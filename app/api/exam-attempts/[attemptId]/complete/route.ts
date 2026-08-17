import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { completeAttemptSchema } from "@/lib/exams/contracts";
import { getAttempt } from "@/lib/exams/attempts";
import { finalizeOfficialAttempt, lockPracticeAttempt } from "@/lib/exams/finalize";

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId } = await context.params;
    const parsed = completeAttemptSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid completion request", 400, parsed.error.flatten());
    const attempt = await getAttempt(attemptId, user.id);

    if (attempt.mode === "practice") {
      return NextResponse.json(await lockPracticeAttempt({
        attemptId,
        userId: user.id,
        writerToken: parsed.data.writerToken,
      }));
    }

    const result = await finalizeOfficialAttempt({
      attemptId,
      userId: user.id,
      writerToken: parsed.data.writerToken,
    });
    return NextResponse.json({ success: true, alreadyCompleted: result.alreadyFinalized });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

