import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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

  const { submissionId, score, maxMarks, feedback, highlights } = await req.json();

  if (!submissionId || score === undefined || score === null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const numScore = parseFloat(score);
  const numMax = parseFloat(maxMarks);
  
  if (isNaN(numScore) || numScore < 0 || (numMax > 0 && numScore > numMax)) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  const gradingResult = {
    internal: { total: 0, max: maxMarks, criteria: [] },
    studentFeedback: {
      score: `${score}/${maxMarks}`,
      summary: feedback || "",
      highlights: highlights || []
    }
  };

  const { error } = await adminClient
    .from("exam_submissions")
    .update({
      grading_result: gradingResult,
      graded_by: "human"
    })
    .eq("id", submissionId);

  if (error) {
    console.error("Error saving grade:", error);
    return NextResponse.json({ error: "Failed to save grade" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
