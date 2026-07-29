import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRedis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { examId, extraMinutes } = await req.json();

  if (!examId || !extraMinutes || extraMinutes <= 0) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // 1. Fetch current exam
  const { data: exam, error: fetchError } = await supabase
    .from("exams")
    .select("time_limit_minutes, ends_at")
    .eq("id", examId)
    .single();

  if (fetchError || !exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const newTimeLimitMinutes = exam.time_limit_minutes + extraMinutes;
  const newEndsAt = new Date(new Date(exam.ends_at).getTime() + (extraMinutes * 60 * 1000)).toISOString();

  // 2. Update exam in DB
  const { error: updateError } = await supabase
    .from("exams")
    .update({
      time_limit_minutes: newTimeLimitMinutes,
      ends_at: newEndsAt
    })
    .eq("id", examId);

  if (updateError) {
    console.error("Exam extension error:", updateError);
    return NextResponse.json({ error: "Failed to update exam in database" }, { status: 500 });
  }

  // 3. (Redis TTL overhead removed based on architectural improvement)
  // Because the serverStartTime key now has a fixed 48-hour TTL, we don't
  // need to dynamically scan and extend Redis keys. The application naturally
  // relies on elapsed time mathematical checks against the new DB time limit.

  return NextResponse.json({ 
    success: true, 
    newTimeLimitMinutes,
    newEndsAt
  });
}

