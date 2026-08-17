import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { fetchQuestionsServer } from "@/lib/api/questions-server";

const schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().max(200).optional(),
  category: z.string().max(50).default("all"),
  difficulty: z.string().max(50).default("all"),
  sortBy: z.enum(["newest", "oldest", "difficulty"]).default("newest"),
  status: z.enum(["all", "done", "not_done"]).default("not_done"),
});

export async function GET(request: NextRequest) {
  try {
    await requireApiUser();
    const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid question filters", 400, parsed.error.flatten());
    return NextResponse.json(await fetchQuestionsServer(parsed.data as any));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

