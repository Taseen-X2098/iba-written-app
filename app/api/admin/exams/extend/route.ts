import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";

const schema = z.object({
  examId: z.string().uuid(),
  extraMinutes: z.number().int().min(1).max(180),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Extension must be between 1 and 180 minutes", 400);
    const admin = await createAdminClient();
    const { data, error } = await admin.rpc("extend_exam_deadline", {
      p_exam_id: parsed.data.examId,
      p_extra_minutes: parsed.data.extraMinutes,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      success: true,
      newTimeLimitMinutes: result?.time_limit_minutes,
      newEndsAt: result?.ends_at,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

