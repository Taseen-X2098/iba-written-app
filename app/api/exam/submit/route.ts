import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { getRedis } from "@/lib/redis";
import { checkTestLimit, consumeTestSlot } from "@/lib/api/usage";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
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

  if (isPractice && !exam.results_published) {
    return NextResponse.json({ error: "Practice mode is only available after official results are published" }, { status: 403 });
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

    if (!serverStartTime) {
      return NextResponse.json(
        { error: "Personal time limit exceeded. Your explicit submission was rejected, but your previously auto-saved drafts have been finalized." },
        { status: 403 }
      );
    }

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

    // 2d. Duplicate submission check
    const { data: existingSubmissions } = await supabase
      .from("exam_submissions")
      .select("id")
      .eq("exam_id", examId)
      .eq("user_id", user.id)
      .not("submitted_at", "is", null)
      .limit(1);

    if (existingSubmissions && existingSubmissions.length > 0) {
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
  let maxScore = 0;

  // Calculate max score
  for (const eq of examQuestions) {
    maxScore += eq.marks;
  }

  // ─── Practice Mode: Grade immediately & return feedback without DB save ──────────────
  if (isPractice) {
    let totalScore = 0;
    
    const gradedResults = await Promise.all(
      answers.map(async (ans) => {
        const eq: any = examQuestions.find(x => x.id === ans.examQuestionId);
        if (!eq) return null;

        if (!ans.editedText) {
          return {
            eqId: eq.id,
            earned: 0,
            result: { studentFeedback: { score: `0/${eq.marks}`, summary: "No answer provided.", highlights: [] } }
          };
        }

        const client: ResponsesClient = isMock
          ? createMockClient({ taskType: eq.questions.category, marks: eq.marks, submission: ans.editedText })
          : (new OpenAI() as unknown as ResponsesClient);

        try {
          let consumed = false;
          const hasTests = await checkTestLimit(user.id);
          if (hasTests) {
            consumed = await consumeTestSlot(user.id);
          }
          
          if (!consumed) {
             return {
               eqId: eq.id,
               earned: 0,
               result: { studentFeedback: { score: `0/${eq.marks}`, summary: "Grading failed: Out of tests.", highlights: [] } },
               editedText: ans.editedText
             };
          }

          const result = await grade(client, ans.editedText, eq.questions.category, eq.marks);
          const earned = parseFloat(result.studentFeedback.score.split("/")[0]) || 0;
          return { eqId: eq.id, earned, result, editedText: ans.editedText };
        } catch (e) {
          console.error("Grading failed", e);
          return {
            eqId: eq.id,
            earned: 0,
            result: { studentFeedback: { score: `0/${eq.marks}`, summary: "Grading failed.", highlights: [] } }
          };
        }
      })
    );

    const sanitizedResults = gradedResults.filter(Boolean).map((item: any) => {
      totalScore += item.earned;
      return {
        eqId: item.eqId,
        editedText: item.editedText,
        earned: item.earned,
        result: { studentFeedback: item.result.studentFeedback },
      };
    });

    return NextResponse.json({ 
      success: true, 
      totalScore, 
      maxScore,
      gradedResults: sanitizedResults,
    });
  }

  // ─── Official Mode: Persist as Pending ───────────────────────────────
  // Use admin client to bypass RLS for these security-critical tables.
  // 4. Official Mode: Save drafts as pending manual grading
  const submissionsToInsert = examQuestions.map((eq: any) => {
    const ans = answers.find((a: any) => a.examQuestionId === eq.id);
    return {
      exam_id: examId,
      user_id: user.id,
      question_id: eq.id,
      ocr_text: ans ? ans.ocrText : "",
      edited_text: ans ? ans.editedText : "",
      submitted_at: new Date().toISOString(),
      grading_result: null, // Pending grading
      graded_by: null,
    };
  });

  const adminSupabase = await createAdminClient();
  const { error: subError } = await adminSupabase
    .from("exam_submissions")
    .insert(submissionsToInsert);

  if (subError) {
    console.error("Error inserting submissions:", subError);
    return NextResponse.json({ error: "Failed to save submissions" }, { status: 500 });
  }

  // Notice: We NO LONGER insert into exam_results here.
  // The results will be published by an Admin later.

  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/exams");

  return NextResponse.json({ success: true, maxScore });
}
