import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envStr = readFileSync(".env.local", "utf-8");
const env: any = {};
for (const line of envStr.split("\n")) {
  if (line.includes("=")) {
    const [k, ...v] = line.split("=");
    env[k.trim()] = v.join("=").trim().replace(/^"|"$/g, "");
  }
}

const supabase = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["SUPABASE_SERVICE_ROLE_KEY"]
);

async function run() {
  const { data, error } = await supabase
    .from("submissions")
    .select("grading_result, user_id")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) console.error(error);
  
  // just show types and structure to avoid massive output
  const summary = data?.map(d => ({
    user_id: d.user_id,
    typeof_result: typeof d.grading_result,
    has_studentFeedback: typeof d.grading_result === 'object' && d.grading_result !== null && 'studentFeedback' in d.grading_result,
    has_student_feedback: typeof d.grading_result === 'object' && d.grading_result !== null && 'student_feedback' in d.grading_result,
    has_marks: typeof d.grading_result === 'object' && d.grading_result !== null && 'marks' in d.grading_result
  }));
  
  console.log(JSON.stringify(summary, null, 2));
}

run();
