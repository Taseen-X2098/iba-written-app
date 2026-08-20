import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { getPublishedExamResults } from "@/lib/exams/results";
import { parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id: rawId } = await context.params;
    const id = parseRequestValue(uuidSchema, rawId, "A valid exam id is required");
    const { page } = parseRequestValue(
      paginationSchema,
      { page: request.nextUrl.searchParams.get("page") ?? undefined },
      "Invalid leaderboard page",
    );
    return NextResponse.json(await getPublishedExamResults(id, user.id, page));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
