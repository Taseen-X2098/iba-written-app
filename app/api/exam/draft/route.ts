import { NextRequest, NextResponse } from "next/server";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { examId, examQuestionId, ocrText, editedText } = await req.json();

  if (!examId || !examQuestionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // ─── Security: verify the exam session is still valid ─────────────────
  // Check that the student has an active start-time in Redis. This proves
  // they entered the exam legitimately and the timer hasn't expired yet.
  const redis = getRedis();
  const startTimeKey = `exam:start:${examId}:${user.id}`;
  const serverStartTime = await redis.get<number>(startTimeKey);

  if (!serverStartTime) {
    // No active session — either the exam expired from Redis, or the
    // student never started it. Reject the draft silently.
    return NextResponse.json({ error: "No active exam session" }, { status: 403 });
  }

  const key = CacheKeys.examDraft(examId, user.id, examQuestionId);

  // Save draft for 24 hours
  await redis.set(key, { ocrText, editedText }, { ex: CacheTTL.TEST_DRAFT });

  return NextResponse.json({ success: true });
}
