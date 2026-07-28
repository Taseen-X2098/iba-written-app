import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";

// POST /api/grade
// body: { submission: string, taskType: string, marks: number, audience?: "student" | "tutor" }
//
// `audience` defaults to "student" — safe by default. Only pass
// audience: "tutor" from your own admin/tutor-facing views; never from a
// page a student can load, since that's the only way to get the full
// rubric breakdown back.
//
// Set USE_MOCK_GRADER=true in .env.local to hit the mock client instead of
// the real OpenAI API — useful for frontend/integration testing without
// spending anything.
export async function POST(req: NextRequest) {
  const { submission, taskType, marks, audience = "student" } = await req.json();

  if (!submission || !taskType || !marks) {
    return NextResponse.json(
      { error: "submission, taskType, and marks are all required" },
      { status: 400 }
    );
  }

  const client: ResponsesClient =
    process.env.USE_MOCK_GRADER === "true"
      ? createMockClient({ taskType, marks, submission })
      : (new OpenAI() as unknown as ResponsesClient); // reads OPENAI_API_KEY from env

  try {
    const result = await grade(client, submission, taskType, marks);

    if (audience === "tutor") {
      return NextResponse.json(result); // { internal, studentFeedback }
    }

    // default / student path: never include `internal`
    return NextResponse.json({ studentFeedback: result.studentFeedback });
  } catch (err) {
    console.error("Grading failed:", err);
    return NextResponse.json({ error: "Grading failed" }, { status: 500 });
  }
}