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

  const { prompt, category, difficulty, marks, source, spaceHint } = await req.json();

  if (!prompt || !category || !difficulty || !marks) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("questions")
    .insert({
      prompt,
      category,
      difficulty,
      marks,
      source: source || null,
      space_hint: spaceHint || null,
      is_active: true,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create question:", error);
    return NextResponse.json({ error: "Failed to save question" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
