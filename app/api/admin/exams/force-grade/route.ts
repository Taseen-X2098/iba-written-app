import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRedis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    // We don't actually need adminClient here since the fetch call is making the real requests.
    // We just needed to authenticate the route.

    const { examId, targetUserId } = await req.json();
    if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

    const { data: exam } = await supabase.from("exams").select("ends_at, time_limit_minutes").eq("id", examId).single();
    if (!exam) return NextResponse.json({ error: "exam not found" }, { status: 404 });

    const redis = getRedis();

    if (targetUserId) {
      // Individual level: check if their individual exam duration is past
      const startTimeKey = `exam:start:${examId}:${targetUserId}`;
      const serverStartTime = await redis.get<number>(startTimeKey);
      if (serverStartTime) {
        const elapsedMs = Date.now() - serverStartTime;
        const allowedMs = (exam.time_limit_minutes * 60 * 1000) + (3 * 60 * 1000);
        if (elapsedMs < allowedMs) {
          return NextResponse.json({ error: "Cannot force grade: Student's exam duration is not yet over." }, { status: 400 });
        }
      }
      // If we got here, they are expired or never started, proceed to force grade
      const keys = [startTimeKey];
      let processed = 0;
      // ... loop logic follows
    }

    // Broad level: don't allow until exam globally ended
    if (!targetUserId && new Date(exam.ends_at).getTime() > Date.now()) {
      return NextResponse.json({ error: "Cannot force grade all students while the exam is still globally active." }, { status: 400 });
    }
    
    // Find all start times for this exam
    // In production Upstash, .keys() is generally available but SCAN is safer for huge datasets.
    // For this app, .keys() is fine.
    const keys = targetUserId ? [`exam:start:${examId}:${targetUserId}`] : await redis.keys(`exam:start:${examId}:*`);
    
    if (keys.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const key of keys) {
      // Extract userId from 'exam:start:examId:userId'
      const parts = key.split(':');
      const userId = parts[3];
      if (!userId) continue;

      // Call the finalize logic directly via a local POST fetch so we reuse the logic
      // Note: In Next.js, calling your own absolute URL API route from within an API route is tricky (need absolute URL).
      // Since this is server-side, it's better to just extract the logic or call it if we have the host.
      // For simplicity, we'll hit the localhost / production domain.
      
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("host");
      const url = `${protocol}://${host}/api/exam/finalize`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
             "Content-Type": "application/json",
             // Pass cookie so it auths as the admin triggering this
             "cookie": req.headers.get("cookie") || ""
          },
          body: JSON.stringify({ examId, targetUserId: userId })
        });
        if (res.ok) processed++;
      } catch (err) {
        console.error("Failed to force grade user", userId, err);
      }
    }

    return NextResponse.json({ processed });

  } catch (error: any) {
    console.error("Force grade error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
