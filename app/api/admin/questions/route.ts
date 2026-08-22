import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonRequest } from "@/lib/api/request";
import { STORY_COMPLETION_MARKS } from "@/lib/questions/story-completion";
import { z } from "zod";

const questionFieldsSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  category: z.enum([
    "argumentative_essay",
    "basic_paragraph",
    "creative_writing",
    "personal_reflection",
    "quote_analysis",
    "story_completion",
    "translation",
  ]),
  difficulty: z.enum(["easy", "medium", "hard", "very_hard"]),
  marks: z.number().int().min(1).max(100),
  source: z.string().trim().max(500).optional().default(""),
  spaceHint: z.string().trim().max(500).optional().default(""),
}).superRefine((question, context) => {
  if (
    question.category === "story_completion"
    && !(STORY_COMPLETION_MARKS as readonly number[]).includes(question.marks)
  ) {
    context.addIssue({
      code: "custom",
      path: ["marks"],
      message: "Story Completion marks must be 8, 9, 10, 12, 13, or 15",
    });
  }
});

const updateQuestionSchema = z.intersection(
  questionFieldsSchema,
  z.object({ id: z.string().uuid() }),
);
const deleteQuestionSchema = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser();
    const { prompt, category, difficulty, marks, source, spaceHint } = await parseJsonRequest(
      req,
      questionFieldsSchema,
      { maxBytes: 25_000, message: "Invalid question" },
    );

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("questions")
      .insert({
        prompt,
        category,
        difficulty,
        marks,
        source: source || null,
        space_hint: spaceHint || null,
        max_images: 2,
        is_active: true,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error("Question creation returned no data");
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminUser();
    const { id, prompt, category, difficulty, marks, source, spaceHint } = await parseJsonRequest(
      req,
      updateQuestionSchema,
      { maxBytes: 25_000, message: "Invalid question" },
    );

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("questions")
      .update({
        prompt,
        category,
        difficulty,
        marks,
        source: source || null,
        space_hint: spaceHint || null,
        max_images: 2,
      })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUser();
    const { id } = await parseJsonRequest(req, deleteQuestionSchema, {
      maxBytes: 2_000,
      message: "A valid question id is required",
    });

    // Questions can be referenced by existing submissions and exams. Deactivate
    // them instead of removing that historical data and hiding the question from
    // future practice and selection.
    const adminClient = createAdminClient();
    const { error } = await adminClient.from("questions").update({ is_active: false }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
