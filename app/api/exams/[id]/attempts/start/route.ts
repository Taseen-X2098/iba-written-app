import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { startAttemptSchema } from "@/lib/exams/contracts";
import { startAttempt } from "@/lib/exams/attempts";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id: rawId } = await context.params;
    const id = parseRequestValue(uuidSchema, rawId, "A valid exam id is required");
    const input = await parseJsonRequest(request, startAttemptSchema, {
      maxBytes: 8_000,
      message: "Invalid start request",
    });

    const result = await startAttempt({
      examId: id,
      userId: user.id,
      mode: input.mode,
      attemptId: input.attemptId,
      writerToken: input.writerToken,
    });
    const { writer_token_hash: _secret, ...attempt } = result.attempt;
    return NextResponse.json({ ...result, attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
