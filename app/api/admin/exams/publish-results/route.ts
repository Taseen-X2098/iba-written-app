import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys } from "@/lib/redis";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { examId } = await req.json();

  if (!examId) {
    return NextResponse.json({ error: "Missing examId" }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  // 1. Fetch all submissions for this exam to calculate total scores
  const { data: submissions, error: subError } = await adminClient
    .from("exam_submissions")
    .select("user_id, grading_result, exam_questions(marks)")
    .eq("exam_id", examId);

  if (subError) {
    console.error("Error fetching submissions:", subError);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }

  // Calculate total max_score for the exam from exam_questions
  const { data: eqData } = await adminClient
    .from("exam_questions")
    .select("marks")
    .eq("exam_id", examId);
  const maxScore = eqData?.reduce((sum, eq) => sum + eq.marks, 0) || 0;

  // Aggregate scores by user
  const userScores: Record<string, number> = {};
  
  for (const sub of (submissions || [])) {
    if (!userScores[sub.user_id]) userScores[sub.user_id] = 0;
    
    if (sub.grading_result && sub.grading_result.studentFeedback?.score) {
      const earned = parseFloat(sub.grading_result.studentFeedback.score.split("/")[0]) || 0;
      userScores[sub.user_id] += earned;
    }
  }

  // 2. Prepare exam_results
  const resultsToInsert = Object.entries(userScores).map(([userId, totalScore]) => ({
    exam_id: examId,
    user_id: userId,
    total_score: totalScore,
    max_score: maxScore,
  }));

  // 3. Upsert exam_results
  if (resultsToInsert.length > 0) {
    const { error: resultError } = await adminClient
      .from("exam_results")
      .upsert(resultsToInsert, { onConflict: "exam_id, user_id" });

    if (resultError) {
      console.error("Error inserting exam results:", resultError);
      return NextResponse.json({ error: "Failed to publish results" }, { status: 500 });
    }
  }

  // 4. Mark exam as published
  const { error: examError } = await adminClient
    .from("exams")
    .update({ results_published: true })
    .eq("id", examId);

  if (examError) {
    console.error("Error updating exam status:", examError);
    return NextResponse.json({ error: "Failed to update exam status" }, { status: 500 });
  }

  // Invalidate cache
  const redis = getRedis();
  await redis.del(CacheKeys.leaderboard(examId));
  
  revalidatePath(`/exams/${examId}/results`);
  revalidatePath(`/admin/exams/${examId}/submissions`);
  revalidatePath("/exams");

  return NextResponse.json({ success: true });
}
