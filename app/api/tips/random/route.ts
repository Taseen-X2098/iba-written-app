import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Supabase random ordering hack: using Postgres random() via raw SQL isn't directly supported in RPC without a function,
  // but since Tips are usually < 1000 rows, we can just fetch all IDs, pick one, and fetch it.
  
  const { data: allTips, error } = await supabase
    .from("tips")
    .select("id, content")
    .eq("is_active", true);

  if (error || !allTips || allTips.length === 0) {
    return NextResponse.json({ tip: null });
  }

  const randomTip = allTips[Math.floor(Math.random() * allTips.length)];

  return NextResponse.json({ tip: randomTip });
}
