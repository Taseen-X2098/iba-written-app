import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";

export async function GET(req: NextRequest) {
  try {
    const adminSupabase = await createAdminClient();
    
    // get a user
    const { data: user } = await adminSupabase.from("profiles").select("id").limit(1).single();
    const { data: q } = await adminSupabase.from("questions").select("id, marks, category").limit(1).single();
    
    if (!user || !q) return NextResponse.json({ error: "missing user or q" });
    
    const client: ResponsesClient = createMockClient({ taskType: q.category, marks: q.marks || 10, submission: "test text" });
    const result = await grade(client, "test text", q.category, q.marks || 10);
    
    const { data, error } = await adminSupabase
      .from("submissions")
      .insert({
        user_id: user.id,
        question_id: q.id,
        ocr_text: "",
        edited_text: "test text",
        time_taken_seconds: 60,
        grading_result: result,
      })
      .select();
      
    return NextResponse.json({ data, error });
  } catch (err: any) {
    return NextResponse.json({ catchError: err.message });
  }
}
