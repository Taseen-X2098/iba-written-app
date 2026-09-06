import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { examDefinitionSchema } from "@/lib/exams/admin-contracts";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";
import { deliverExamPublicationNotifications } from "@/lib/notifications/exam-publication";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id: rawId } = await context.params;
    const id = parseRequestValue(uuidSchema, rawId, "A valid exam id is required");
    const input = await parseJsonRequest(request, examDefinitionSchema, {
      maxBytes: 250_000,
      message: "Invalid exam definition",
    });
    const admin = await createAdminClient();
    const { data: existingExam, error: existingExamError } = await admin
      .from("exams")
      .select("is_published, is_magnus_only, is_free")
      .eq("id", id)
      .single();
    if (existingExamError || !existingExam) throw existingExamError ?? new Error("Exam not found");
    const { error } = await admin.rpc("update_exam_definition", {
      p_exam_id: id,
      p_title: input.title,
      p_description: input.description,
      p_time_limit_minutes: input.timeLimitMinutes,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_is_published: input.isPublished,
      p_is_magnus_only: input.isMagnusOnly,
      p_is_free: input.isFree,
      p_questions: input.questions,
    });
    if (error) {
      if (error.message.includes("EXAM_ALREADY_STARTED")) throw new ApiError("ATTEMPT_ACTIVE", "The exam definition is locked after the first official start. Use Extend Timer for deadline changes.", 409);
      if (error.message.includes("EXAM_AUDIENCE_LOCKED")) throw new ApiError("CONFLICT", "The exam audience cannot change after first publication.", 409);
      throw error;
    }
    if (input.isPublished && !existingExam.is_published) {
      await deliverExamPublicationNotifications({
        id,
        title: input.title,
        instructions: input.description,
        totalMarks: input.questions.reduce((total, question) => total + question.marks, 0),
        deadline: input.endsAt,
        durationMinutes: input.timeLimitMinutes,
        isMagnusOnly: input.isMagnusOnly,
      });
    }
    return NextResponse.json({ success: true, examId: id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
