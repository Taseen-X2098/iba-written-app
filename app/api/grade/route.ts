import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { createClient } from "@/lib/supabase/server";
import { checkTestLimit, consumeTestSlot } from "@/lib/api/usage";

// POST /api/grade
// body: { questionId: string, submissionText: string, ocrText: string, timeTakenSeconds: number }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionId, submissionText, ocrText, timeTakenSeconds } = await req.json();

  if (!questionId || !submissionText) {
    return NextResponse.json(
      { error: "questionId and submissionText are required" },
      { status: 400 }
    );
  }

  // 1. Fetch Question details
  const { data: question, error: qError } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (qError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  // 2. Check and consume usage limits
  const hasTests = await checkTestLimit(user.id);
  if (!hasTests) {
    return NextResponse.json({ error: "No tests remaining. Please upgrade." }, { status: 403 });
  }

  // 3. Grade using OpenAI / Mock
  const client: ResponsesClient =
    process.env.USE_MOCK_GRADER === "true"
      ? createMockClient({ taskType: question.category, marks: question.marks, submission: submissionText })
      : (new OpenAI() as unknown as ResponsesClient);

  try {
    const result = await grade(client, submissionText, question.category, question.marks);
    
    // 4. Consume test slot
    const consumed = await consumeTestSlot(user.id);
    if (!consumed) {
      throw new Error("Failed to consume test slot");
    }

    // 5. Save to database
    const { error: dbError } = await supabase
      .from("submissions")
      .insert({
        user_id: user.id,
        question_id: question.id,
        exam_id: null, // Weekly exams are null for normal tests
        ocr_text: ocrText,
        final_text: submissionText,
        time_taken_seconds: timeTakenSeconds,
        grading_result: result,
      });

    if (dbError) {
      console.error("Failed to save submission:", dbError);
      // We don't fail the request here, but we log it. 
      // In production, we'd want a retry queue or alerting.
    }

    // Return student feedback
    return NextResponse.json({ gradingResult: result });
  } catch (err: any) {
    console.error("Grading failed:", err);
    return NextResponse.json({ error: err.message || "Grading failed" }, { status: 500 });
  }
}