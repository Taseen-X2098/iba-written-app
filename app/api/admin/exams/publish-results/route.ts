import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";

const schema = z.object({ examId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "A valid exam is required", 400);

    const admin = await createAdminClient();
    const { data: version, error } = await admin.rpc("publish_exam_results", {
      p_exam_id: parsed.data.examId,
    });
    if (error) {
      if (error.message.includes("EXAM_NOT_ENDED")) throw new ApiError("EXAM_NOT_AVAILABLE", "Results cannot be published before the exam ends", 409);
      if (error.message.includes("ATTEMPTS_NOT_FINALIZED")) throw new ApiError("GRADING_INCOMPLETE", "Some attempts still need finalization", 409);
      if (error.message.includes("GRADING_INCOMPLETE")) throw new ApiError("GRADING_INCOMPLETE", "Every answer must have a final grade before publication", 409);
      throw error;
    }

    revalidatePath(`/exams/${parsed.data.examId}/results`);
    revalidatePath(`/admin/exams/${parsed.data.examId}/submissions`);
    revalidatePath("/exams");
    return NextResponse.json({ success: true, resultsVersion: version });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
