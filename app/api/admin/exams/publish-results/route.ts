import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest } from "@/lib/api/request";
import { deliverResultPublicationNotifications } from "@/lib/notifications/result-publication";

const schema = z.object({ examId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const input = await parseJsonRequest(request, schema, {
      maxBytes: 8_000,
      message: "A valid exam is required",
    });

    const admin = await createAdminClient();
    const { data: version, error } = await admin.rpc("publish_exam_results_once", {
      p_exam_id: input.examId,
    });
    if (error) {
      if (error.message.includes("EXAM_NOT_ENDED")) throw new ApiError("EXAM_NOT_AVAILABLE", "Results cannot be published before the exam ends", 409);
      if (error.message.includes("RESULTS_ALREADY_PUBLISHED")) throw new ApiError("CONFLICT", "Results have already been published. Extend the deadline to reopen publication.", 409);
      if (error.message.includes("ATTEMPTS_NOT_FINALIZED")) throw new ApiError("GRADING_INCOMPLETE", "Some attempts still need finalization", 409);
      if (error.message.includes("GRADING_INCOMPLETE")) throw new ApiError("GRADING_INCOMPLETE", "Every answer must have a final grade before publication", 409);
      if (error.message.includes("NO_PARTICIPANTS")) throw new ApiError("GRADING_INCOMPLETE", "Results cannot be published because no students participated", 409);
      throw error;
    }

    revalidatePath(`/exams/${input.examId}/results`);
    revalidatePath(`/admin/exams/${input.examId}/submissions`);
    revalidatePath("/exams");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/grading");
    const delivery = await deliverResultPublicationNotifications({
      examId: input.examId,
      resultsVersion: version,
    });
    return NextResponse.json({ success: true, resultsVersion: version, delivery });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
