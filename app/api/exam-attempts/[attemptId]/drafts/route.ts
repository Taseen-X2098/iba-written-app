import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { saveDraftsSchema } from "@/lib/exams/contracts";
import { saveAttemptDrafts } from "@/lib/exams/attempts";

export async function PATCH(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId } = await context.params;
    const parsed = saveDraftsSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid draft payload", 400, parsed.error.flatten());
    const result = await saveAttemptDrafts({ attemptId, userId: user.id, ...parsed.data });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

