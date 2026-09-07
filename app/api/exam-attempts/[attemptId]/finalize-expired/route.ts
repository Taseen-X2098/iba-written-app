import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/errors";
import { parseRequestValue } from "@/lib/api/request";
import { requireApiUser } from "@/lib/auth";
import { uuidSchema } from "@/lib/exams/contracts";
import { finalizeExpiredOfficialAttempt } from "@/lib/exams/finalize";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(
      uuidSchema,
      rawAttemptId,
      "A valid attempt id is required",
    );
    const result = await finalizeExpiredOfficialAttempt({
      attemptId,
      userId: user.id,
    });
    return NextResponse.json({
      success: true,
      alreadyCompleted: result.alreadyFinalized,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
