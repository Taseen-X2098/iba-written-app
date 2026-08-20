import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { takeOverAttempt } from "@/lib/exams/attempts";
import { parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function POST(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(uuidSchema, rawAttemptId, "A valid attempt id is required");
    const result = await takeOverAttempt(attemptId, user.id);
    const { writer_token_hash: _secret, ...attempt } = result.attempt;
    return NextResponse.json({ attempt, writerToken: result.writerToken });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
