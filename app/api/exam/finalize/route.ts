import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys } from "@/lib/redis";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import OpenAI from "openai";

// POST /api/exam/finalize
// Can be called by student (auto-trigger when entering expired exam) or Admin.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { examId, targetUserId } = body;

    if (!examId) {
      return NextResponse.json({ error: "examId is required" }, { status: 400 });
    }

    // Determine whose exam we are finalizing
    let studentId = user.id;
    if (targetUserId && targetUserId !== user.id) {
      // Check if caller is admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      
      if (!profile?.is_admin) {
        return NextResponse.json({ error: "Only admins can finalize other users' exams" }, { status: 403 });
      }
      studentId = targetUserId;
    }

    const adminSupabase = await createAdminClient();

    // 1. Verify if the exam is actually finished (or if admin is force-closing)
    const { data: exam, error: examError } = await adminSupabase
      .from("exams")
      .select("time_limit_minutes, ends_at, is_published")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if result already exists
    const { data: existingResult } = await adminSupabase
      .from("exam_results")
      .select("id")
      .eq("exam_id", examId)
      .eq("user_id", studentId)
      .single();

    if (existingResult) {
      return NextResponse.json({ success: true, message: "Exam already finalized", resultId: existingResult.id });
    }

    const redis = getRedis();
    const startTimeKey = `exam:start:${examId}:${studentId}`;
    const serverStartTime = await redis.get<number>(startTimeKey);

    if (!serverStartTime) {
      // If there's no start time, they never started it, or it expired so long ago Redis dropped it.
      // If admin forced it, we just give them a 0.
      if (user.id !== studentId) { // Admin forcing
         // we will proceed to give them a 0
      } else {
        return NextResponse.json({ error: "No active session found to finalize" }, { status: 400 });
      }
    }

    // Check time limit
    const now = Date.now();
    let isExpired = false;

    if (serverStartTime) {
      const allowedMs = (exam.time_limit_minutes * 60 * 1000) + (3 * 60 * 1000); // 3 min grace
      if (now - serverStartTime > allowedMs) {
        isExpired = true;
      }
    }
    
    // Check global deadline
    const globalEndsAt = new Date(exam.ends_at).getTime();
    if (now > globalEndsAt + (2 * 60 * 1000)) { // 2 min grace
      isExpired = true;
    }

    // If caller is admin, they can force finalize even if not strictly expired yet
    const isAdminForcing = (user.id !== studentId);

    if (!isExpired && !isAdminForcing) {
      return NextResponse.json({ error: "Exam timer has not expired yet. Please use standard submit." }, { status: 403 });
    }

    // 2. Fetch all drafts from Redis
    const draftPattern = CacheKeys.examDraftPattern(examId, studentId);
    
    // To scan, we typically need keys. Upstash redis client doesn't expose a clean async iterator for scan by default
    // we'll fetch the exam questions to know the exact keys to look for.
    const { data: examQuestions } = await adminSupabase
      .from("exam_questions")
      .select("id, questions(id, category, marks)")
      .eq("exam_id", examId);

    let totalEarned = 0;
    let totalMax = 0;
    const submissionsToInsert = [];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient;

    if (examQuestions) {
      for (const eq of examQuestions) {
        const q = eq.questions as any;
        if (!q) continue;
        
        totalMax += q.marks;

        const draftKey = CacheKeys.examDraft(examId, studentId, eq.id);
        const draft = await redis.get<{ocrText: string; editedText: string}>(draftKey);

        if (draft && draft.editedText.trim()) {
          // Grade it!
          try {
            const gradingResult = await grade(openai, draft.editedText, q.category, q.marks);
            totalEarned += gradingResult.internal.total;
            submissionsToInsert.push({
              exam_id: examId,
              user_id: studentId,
              exam_question_id: eq.id,
              ocr_text: draft.ocrText,
              edited_text: draft.editedText,
              time_taken_seconds: 0, // Unknown on force finalize
              grading_result: gradingResult
            });
          } catch (err) {
            console.error(`Failed to auto-grade draft for ${studentId} Q${eq.id}:`, err);
            // On failure, insert a 0 for this question to prevent blocking the whole exam
            submissionsToInsert.push({
              exam_id: examId,
              user_id: studentId,
              exam_question_id: eq.id,
              ocr_text: draft.ocrText,
              edited_text: draft.editedText,
              time_taken_seconds: 0,
              grading_result: {
                internal: { total: 0, max: q.marks, criteria: [] },
                studentFeedback: { score: `0/${q.marks}`, summary: "Grading failed.", highlights: [] }
              }
            });
          }
        }
        
        // Clean up draft
        await redis.del(draftKey);
      }
    }

    // Clean up start time
    await redis.del(startTimeKey);

    // 3. Insert submissions
    if (submissionsToInsert.length > 0) {
      const { error: subError } = await adminSupabase
        .from("exam_submissions")
        .insert(submissionsToInsert);
      
      if (subError) {
        console.error("Failed to insert auto-submissions:", subError);
        return NextResponse.json({ error: "Failed to save submissions" }, { status: 500 });
      }
    }

    // 4. Insert final result
    const { data: finalResult, error: resultError } = await adminSupabase
      .from("exam_results")
      .insert({
        exam_id: examId,
        user_id: studentId,
        total_score: totalEarned,
        is_practice: false, // finalized drafts are always official
      })
      .select("id")
      .single();

    if (resultError) {
      console.error("Failed to insert final result:", resultError);
      return NextResponse.json({ error: "Failed to save final result" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Exam auto-finalized", resultId: finalResult.id });

  } catch (error: any) {
    console.error("Finalize error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
