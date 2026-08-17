import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { getPublishedExamResults } from "@/lib/exams/results";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const rawPage = request.nextUrl.searchParams.get("page") ?? "1";
    const page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1) throw new ApiError("VALIDATION_ERROR", "Invalid page", 400);
    return NextResponse.json(await getPublishedExamResults(id, user.id, page));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

