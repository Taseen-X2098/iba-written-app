import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { getRedis } from "@/lib/redis";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { examId, answers, isPractice } = await req.json();

  if (!examId || !answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // 1. Validate Exam exists
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  // ─── Server-Side Security Checks (skip for practice mode) ─────────────
  if (!isPractice) {
    // 2a. Deadline enforcement: reject if exam window has closed
    const now = Date.now();
    const endsAt = new Date(exam.ends_at).getTime();
    // Allow a 2-minute grace period for network latency on the final submit
    const DEADLINE_GRACE_MS = 2 * 60 * 1000;
    if (now > endsAt + DEADLINE_GRACE_MS) {
      return NextResponse.json(
        { error: "Exam deadline has passed. Your submission cannot be accepted." },
        { status: 403 }
      );
    }

    // 2b. Timer enforcement: reject if student took longer than allowed
    const redis = getRedis();
    const startTimeKey = `exam:start:${examId}:${user.id}`;
    const serverStartTime = await redis.get<number>(startTimeKey);

    if (serverStartTime) {
      const elapsedMs = now - serverStartTime;
      // Admin-set time limit + 3 min grace for upload/OCR processing latency
      const TIMER_GRACE_MS = 3 * 60 * 1000;
      const allowedMs = (exam.time_limit_minutes * 60 * 1000) + TIMER_GRACE_MS;

      if (elapsedMs > allowedMs) {
        return NextResponse.json(
          { error: `Time limit exceeded. You had ${exam.time_limit_minutes} minutes.` },
          { status: 403 }
        );
      }
    }

    // 2c. Duplicate submission check
    const { data: existing } = await supabase
      .from("exam_results")
      .select("id")
      .eq("exam_id", examId)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Exam already submitted" }, { status: 400 });
    }
  }

  // 3. Fetch exam questions to get the marks and category
  const { data: examQuestions } = await supabase
    .from("exam_questions")
    .select("id, marks, questions(id, category)")
    .eq("exam_id", examId);

  if (!examQuestions) {
    return NextResponse.json({ error: "Exam questions not found" }, { status: 404 });
  }

  const isMock = process.env.USE_MOCK_GRADER === "true";
  let totalScore = 0;
  let maxScore = 0;

  // 4. Grade each answer
  const submissionsToInsert: any[] = [];
  
  // Grade in parallel for speed
  const gradedResults = await Promise.all(
    answers.map(async (ans) => {
      const eq: any = examQuestions.find(x => x.id === ans.examQuestionId);
      if (!eq) return null; // invalid question id

      maxScore += eq.marks;

      if (!ans.editedText) {
        // Did not answer
        return {
          eqId: eq.id,
          qId: eq.questions.id,
          ocrText: "",
          editedText: "",
          result: {
            internal: { total: 0, max: eq.marks, criteria: [] },
            studentFeedback: { score: `0/${eq.marks}`, summary: "No answer provided.", highlights: [] }
          },
          earned: 0
        };
      }

      const client: ResponsesClient = isMock
        ? createMockClient({ taskType: eq.questions.category, marks: eq.marks, submission: ans.editedText })
        : (new OpenAI() as unknown as ResponsesClient);

      try {
        const result = await grade(client, ans.editedText, eq.questions.category, eq.marks);
        const earned = parseFloat(result.studentFeedback.score.split("/")[0]) || 0;
        return {
          eqId: eq.id,
          qId: eq.questions.id,
          ocrText: ans.ocrText,
          editedText: ans.editedText,
          result,
          earned
        };
      } catch (e) {
        console.error("Grading failed for question", eq.id, e);
        // Fallback for failed grading
        return {
          eqId: eq.id,
          qId: eq.questions.id,
          ocrText: ans.ocrText,
          editedText: ans.editedText,
          result: {
             internal: { total: 0, max: eq.marks, criteria: [] },
             studentFeedback: { score: `0/${eq.marks}`, summary: "Grading failed.", highlights: [] }
          },
          earned: 0
        };
      }
    })
  );

  // Filter out invalid answers and aggregate
  for (const item of gradedResults) {
    if (!item) continue;
    totalScore += item.earned;
    
    submissionsToInsert.push({
      exam_id: examId,
      user_id: user.id,
      question_id: item.eqId,
      ocr_text: item.ocrText,
      edited_text: item.editedText,
      submitted_at: new Date().toISOString(),
      grading_result: item.result,
      graded_by: "ai",
    });
  }

  // ─── Practice Mode: return feedback without saving to DB ──────────────
  if (isPractice) {
    // SECURITY: Strip internal rubric data — students must never see it
    const sanitizedResults = gradedResults
      .filter(Boolean)
      .map((item: any) => ({
        eqId: item.eqId,
        editedText: item.editedText,
        earned: item.earned,
        result: {
          studentFeedback: item.result.studentFeedback,
        },
      }));

    return NextResponse.json({ 
      success: true, 
      totalScore, 
      maxScore,
      gradedResults: sanitizedResults,
    });
  }

  // ─── Official Mode: persist to database ───────────────────────────────
  // Use admin client to bypass RLS for these security-critical tables.
  // Students are no longer allowed to insert into these tables directly via RLS.
  const adminSupabase = await createAdminClient();

  // 5. Insert individual submissions
  const { error: subError } = await adminSupabase
    .from("exam_submissions")
    .insert(submissionsToInsert);

  if (subError) {
    console.error("Error inserting submissions:", subError);
    return NextResponse.json({ error: "Failed to save submissions" }, { status: 500 });
  }

  // 6. Insert final exam result
  const { error: resultError } = await adminSupabase
    .from("exam_results")
    .insert({
      exam_id: examId,
      user_id: user.id,
      total_score: totalScore,
      max_score: maxScore,
    });

  if (resultError) {
    console.error("Error inserting exam result:", resultError);
    return NextResponse.json({ error: "Failed to save final result" }, { status: 500 });
  }

  // Force cache invalidation so history/progress show the new exam immediately
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/exams");

  return NextResponse.json({ success: true, totalScore, maxScore });
}
