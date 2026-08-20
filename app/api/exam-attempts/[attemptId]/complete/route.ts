import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { completeAttemptSchema } from "@/lib/exams/contracts";
import { getAttempt } from "@/lib/exams/attempts";
import { finalizeOfficialAttempt, lockPracticeAttempt } from "@/lib/exams/finalize";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(uuidSchema, rawAttemptId, "A valid attempt id is required");
    const input = await parseJsonRequest(request, completeAttemptSchema, {
      maxBytes: 2_000,
      message: "Invalid completion request",
    });
    const attempt = await getAttempt(attemptId, user.id);

    if (attempt.mode === "practice") {
      return NextResponse.json(await lockPracticeAttempt({
        attemptId,
        userId: user.id,
        writerToken: input.writerToken,
      }));
    }

    const result = await finalizeOfficialAttempt({
      attemptId,
      userId: user.id,
      writerToken: input.writerToken,
    });
    return NextResponse.json({ success: true, alreadyCompleted: result.alreadyFinalized });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
