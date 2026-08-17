import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const startAttemptSchema = z.object({
  mode: z.enum(["official", "practice"]).default("official"),
  attemptId: uuidSchema.optional(),
  writerToken: z.string().min(32).max(256).optional(),
});

export const takeoverAttemptSchema = z.object({
  attemptId: uuidSchema,
});

export const attemptAnswerSchema = z.object({
  examQuestionId: uuidSchema,
  ocrText: z.string().max(100_000).default(""),
  editedText: z.string().max(100_000).default(""),
});

export const saveDraftsSchema = z.object({
  writerToken: z.string().min(32).max(256),
  answers: z.array(attemptAnswerSchema).min(1).max(100),
});

export const completeAttemptSchema = z.object({
  writerToken: z.string().min(32).max(256),
});

export const practiceSelectionSchema = z.object({
  writerToken: z.string().min(32).max(256),
  examQuestionIds: z.array(uuidSchema).max(100),
});

export const adminGradingJobSchema = z.object({
  examId: uuidSchema,
  submissionIds: z.array(uuidSchema).max(5_000).optional(),
  scope: z.enum(["selected", "missing"]).default("selected"),
  allowRegrade: z.boolean().default(false),
});

export const manualGradeSchema = z.object({
  submissionId: uuidSchema,
  score: z.number().min(0),
  summary: z.string().trim().min(1).max(10_000),
  highlights: z
    .array(
      z.object({
        quote: z.string().max(2_000),
        comment: z.string().max(5_000),
        type: z.enum(["strength", "improvement"]),
      }),
    )
    .max(100)
    .default([]),
});

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(message || "Invalid request body");
  }
  return result.data;
}

