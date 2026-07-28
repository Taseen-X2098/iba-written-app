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

  const redis = getRedis();
  const key = CacheKeys.examDraft(examId, user.id, examQuestionId);

  // Save draft for 24 hours
  await redis.set(key, { ocrText, editedText }, { ex: CacheTTL.TEST_DRAFT });

  return NextResponse.json({ success: true });
}
