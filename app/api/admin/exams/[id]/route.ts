import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { examDefinitionSchema } from "@/lib/exams/admin-contracts";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { uuidSchema } from "@/lib/exams/contracts";
import { deliverExamPublicationNotifications } from "@/lib/notifications/exam-publication";
import { createExamResultsCsv, examResultsFilename } from "@/lib/exams/result-csv";

const deletedExamSnapshotSchema = z.object({
  exam_id: z.string().uuid(),
  exam_title: z.string(),
  storage_paths: z.array(z.string()).default([]),
  results: z.array(z.object({
    user_id: z.string().uuid(),
    student_name: z.string(),
    institute: z.string(),
    total_score: z.coerce.number(),
    max_score: z.coerce.number(),
    rank: z.number().int().nullable(),
    created_at: z.string(),
  })),
});

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

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id: rawId } = await context.params;
    const id = parseRequestValue(uuidSchema, rawId, "A valid exam id is required");
    const admin = await createAdminClient();
    const { data, error } = await admin.rpc("delete_exam_with_results", {
      p_exam_id: id,
    });

    if (error) {
      if (error.message.includes("EXAM_NOT_FOUND")) {
        throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }

    const snapshot = deletedExamSnapshotSchema.safeParse(data);
    if (!snapshot.success) {
      throw new Error("The deleted exam result snapshot was invalid");
    }

    if (snapshot.data.storage_paths.length > 0) {
      const { error: storageError } = await admin.storage
        .from("translation-answer-images")
        .remove(snapshot.data.storage_paths);
      if (storageError) {
        // The relational records are already gone. Keep the CSV response usable
        // and surface orphan cleanup to operations instead of reporting a false
        // deletion failure to the administrator.
        console.error("Unable to remove deleted exam answer images", storageError);
      }
    }

    const csv = createExamResultsCsv(snapshot.data.results.map((result) => ({
      userId: result.user_id,
      studentName: result.student_name,
      institute: result.institute,
      totalScore: result.total_score,
      maxScore: result.max_score,
      rank: result.rank,
      createdAt: result.created_at,
    })));
    const filename = examResultsFilename(snapshot.data.exam_title, snapshot.data.exam_id);

    revalidatePath("/admin/exams");
    revalidatePath("/admin/grading");
    revalidatePath("/exams");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
