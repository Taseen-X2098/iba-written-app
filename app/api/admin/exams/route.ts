import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { title, description, timeLimitMinutes, startsAt, endsAt, isPublished, questions } = await req.json();

  if (!title || !startsAt || !endsAt || !questions || questions.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 1. Create Exam
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .insert({
      title,
      description,
      time_limit_minutes: timeLimitMinutes,
      starts_at: startsAt,
      ends_at: endsAt,
      is_published: isPublished,
      created_by: user.id
    })
    .select("id")
    .single();

  if (examError || !exam) {
    console.error("Exam Creation Error:", examError);
    return NextResponse.json({ error: "Failed to create exam" }, { status: 500 });
  }

  // 2. Insert Questions
  const examQuestionsToInsert = questions.map((q: any) => ({
    exam_id: exam.id,
    question_id: q.questionId,
    order_index: q.orderIndex,
    marks: q.marks
  }));

  const { error: qError } = await supabase
    .from("exam_questions")
    .insert(examQuestionsToInsert);

  if (qError) {
    console.error("Exam Questions Insertion Error:", qError);
    // Ideally we would rollback the exam here, but Supabase doesn't support manual rollbacks over REST.
    // In production we'd use an RPC for atomicity.
    return NextResponse.json({ error: "Exam created but failed to link questions" }, { status: 500 });
  }

  return NextResponse.json({ success: true, examId: exam.id });
}
