import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { saveDraftsSchema } from "@/lib/exams/contracts";
import { saveAttemptDrafts } from "@/lib/exams/attempts";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";

export async function PATCH(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(uuidSchema, rawAttemptId, "A valid attempt id is required");
    const input = await parseJsonRequest(request, saveDraftsSchema, {
      maxBytes: 21_000_000,
      message: "Invalid draft payload",
    });
    const result = await saveAttemptDrafts({ attemptId, userId: user.id, ...input });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
