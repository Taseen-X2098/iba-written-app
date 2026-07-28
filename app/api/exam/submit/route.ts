import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { examId, answers } = await req.json();

  if (!examId || !answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // 1. Validate Exam
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  // Double check if already submitted
  const { data: existing } = await supabase
    .from("exam_results")
    .select("id")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Exam already submitted" }, { status: 400 });
  }

  // 2. Fetch exam questions to get the marks and category
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

  // 3. Grade each answer
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

  // 4. Save to Database
  // Insert individual submissions
  const { error: subError } = await supabase
    .from("exam_submissions")
    .insert(submissionsToInsert);

  if (subError) {
    console.error("Error inserting submissions:", subError);
    return NextResponse.json({ error: "Failed to save submissions" }, { status: 500 });
  }

  // Insert final exam result
  const { error: resultError } = await supabase
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

  return NextResponse.json({ success: true, totalScore, maxScore });
}
