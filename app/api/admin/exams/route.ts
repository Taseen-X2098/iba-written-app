import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { examDefinitionSchema } from "@/lib/exams/admin-contracts";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest } from "@/lib/api/request";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    const input = await parseJsonRequest(request, examDefinitionSchema, {
      maxBytes: 250_000,
      message: "Invalid exam definition",
    });
    const admin = await createAdminClient();
    const { data: examId, error } = await admin.rpc("create_exam_definition", {
      p_created_by: user.id,
      p_title: input.title,
      p_description: input.description,
      p_time_limit_minutes: input.timeLimitMinutes,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_is_published: input.isPublished,
      p_questions: input.questions,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, examId });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
