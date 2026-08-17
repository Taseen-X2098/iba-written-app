import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { takeOverAttempt } from "@/lib/exams/attempts";

export async function POST(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId } = await context.params;
    const result = await takeOverAttempt(attemptId, user.id);
    const { writer_token_hash: _secret, ...attempt } = result.attempt;
    return NextResponse.json({ attempt, writerToken: result.writerToken });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

