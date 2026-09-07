import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth";
import {
  reserveExamOcrOperationSchema,
  uuidSchema,
} from "@/lib/exams/contracts";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { requireOcrAccess } from "@/lib/ocr/access";
import { beginExamOcrOperation } from "@/lib/ocr/exam-operations";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  // This lightweight request reaches the server before any image bytes are
  // transferred. Its database row is the finalizer barrier for the upload.
  const requestStartedAt = Date.now();
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(
      uuidSchema,
      rawAttemptId,
      "A valid attempt id is required",
    );
    const input = await parseJsonRequest(request, reserveExamOcrOperationSchema, {
      maxBytes: 2_000,
      message: "Invalid page-scan reservation",
    });
    const attempt = await requireAttemptWriter(attemptId, user.id, input.writerToken);

    if (attempt.status !== "active") {
      throw new ApiError("ATTEMPT_NOT_ACTIVE", "The exam attempt is locked", 409);
    }
    if (requestStartedAt > new Date(attempt.expires_at).getTime()) {
      throw new ApiError("ATTEMPT_EXPIRED", "The exam time has ended", 409);
    }
    await requireOcrAccess({ userId: user.id, attemptId: attempt.id });

    const operation = await beginExamOcrOperation({
      operationId: randomUUID(),
      attemptId,
      examQuestionId: input.examQuestionId,
      userId: user.id,
      writerToken: input.writerToken,
    });

    return NextResponse.json({
      operationId: operation.id,
      leaseExpiresAt: operation.lease_expires_at,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
