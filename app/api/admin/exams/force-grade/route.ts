import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { finalizeOfficialAttempt } from "@/lib/exams/finalize";
import { parseJsonRequest } from "@/lib/api/request";

const schema = z.object({
  examId: z.string().uuid(),
  targetUserId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const input = await parseJsonRequest(request, schema, {
      maxBytes: 8_000,
      message: "Invalid finalization request",
    });
    const admin = await createAdminClient();
    let query = admin
      .from("exam_attempts")
      .select("id, user_id, expires_at")
      .eq("exam_id", input.examId)
      .eq("mode", "official")
      .in("status", ["active", "locked"])
      .lte("expires_at", new Date().toISOString());
    if (input.targetUserId) query = query.eq("user_id", input.targetUserId);
    const { data: attempts, error } = await query.limit(5_000);
    if (error) throw error;

    let processed = 0;
    const failures: Array<{ attemptId: string; error: string }> = [];
    for (const attempt of attempts ?? []) {
      try {
        await finalizeOfficialAttempt({ attemptId: attempt.id, requireExpired: true });
        processed += 1;
      } catch (cause) {
        failures.push({ attemptId: attempt.id, error: cause instanceof Error ? cause.message : "Unknown failure" });
      }
    }
    return NextResponse.json({ processed, failures });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
