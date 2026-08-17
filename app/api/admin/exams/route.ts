import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { examDefinitionSchema } from "@/lib/exams/admin-contracts";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    const parsed = examDefinitionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid exam definition", 400, parsed.error.flatten());
    const admin = await createAdminClient();
    const { data: examId, error } = await admin.rpc("create_exam_definition", {
      p_created_by: user.id,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_time_limit_minutes: parsed.data.timeLimitMinutes,
      p_starts_at: parsed.data.startsAt,
      p_ends_at: parsed.data.endsAt,
      p_is_published: parsed.data.isPublished,
      p_questions: parsed.data.questions,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, examId });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

