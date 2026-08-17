import { z } from "zod";

export const examDefinitionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5_000).default(""),
  timeLimitMinutes: z.number().int().min(1).max(480),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isPublished: z.boolean(),
  questions: z.array(z.object({
    questionId: z.string().uuid(),
    orderIndex: z.number().int().min(0),
    marks: z.number().int().min(1).max(100),
  })).min(1).max(100),
}).superRefine((value, context) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: "custom", message: "End time must be after start time", path: ["endsAt"] });
  }
  if (new Set(value.questions.map((question) => question.questionId)).size !== value.questions.length) {
    context.addIssue({ code: "custom", message: "An exam cannot contain duplicate questions", path: ["questions"] });
  }
});

