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

  // Very basic admin check
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { editedText, category, marks } = await req.json();

  if (!editedText || !category || !marks) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const isMock = process.env.USE_MOCK_GRADER === "true";
  const client: ResponsesClient = isMock
    ? createMockClient({ taskType: category, marks, submission: editedText })
    : (new OpenAI() as unknown as ResponsesClient);

  try {
    const result = await grade(client, editedText, category, marks);
    const earned = parseFloat(result.studentFeedback.score.split("/")[0]) || 0;
    
    return NextResponse.json({ 
      success: true, 
      earned,
      result
    });
  } catch (e: any) {
    console.error("AI Grading suggestion failed", e);
    return NextResponse.json({ error: "Failed to grade answer: " + e.message }, { status: 500 });
  }
}
