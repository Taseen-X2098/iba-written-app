import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { parseJsonRequest } from "@/lib/api/request";

const schema = z.object({
  examId: z.string().uuid(),
  extraMinutes: z.number().int().min(1).max(180),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const input = await parseJsonRequest(request, schema, {
      maxBytes: 8_000,
      message: "Extension must be between 1 and 180 minutes",
    });
    const admin = await createAdminClient();
    const { data, error } = await admin.rpc("extend_exam_deadline", {
      p_exam_id: input.examId,
      p_extra_minutes: input.extraMinutes,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    revalidatePath(`/exams/${input.examId}/results`);
    revalidatePath(`/admin/exams/${input.examId}/submissions`);
    revalidatePath("/exams");
    revalidatePath("/admin/exams");
    revalidatePath("/admin/grading");
    return NextResponse.json({
      success: true,
      newTimeLimitMinutes: result?.time_limit_minutes,
      newEndsAt: result?.ends_at,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
