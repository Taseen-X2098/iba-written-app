import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { startAttemptSchema } from "@/lib/exams/contracts";
import { startAttempt } from "@/lib/exams/attempts";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const parsed = startAttemptSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid start request", 400, parsed.error.flatten());

    const result = await startAttempt({
      examId: id,
      userId: user.id,
      mode: parsed.data.mode,
      attemptId: parsed.data.attemptId,
      writerToken: parsed.data.writerToken,
    });
    const { writer_token_hash: _secret, ...attempt } = result.attempt;
    return NextResponse.json({ ...result, attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

