import rubrics from "./rubrics.json";

type RubricRow = { criterion: string; marks: number; guidance: string };
type RubricTier = { total: number; criteria: RubricRow[] };
type RubricData = Record<string, Record<string, RubricTier>>;

const RUBRICS = rubrics as unknown as RubricData;

export const TASK_TYPES = [
  "argumentative_essay",
  "quote_analysis",
  "creative_writing",
  "personal_reflection",
  "basic_paragraph",
  "story_completion",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

// This is the function/tool definition sent to the model. Keeping it tiny
// and constant is the whole point — the actual rubric tables never sit in
// the prompt, only this ~150-token schema does.
export const TOOLS = [
  {
    type: "function",
    name: "get_rubric",
    description:
      "Fetch the exact mark-scheme rubric (criteria, mark allocations, guidance) " +
      "for a given writing task type and total marks. Always call this before " +
      "grading anything — never grade from memory.",
    parameters: {
      type: "object",
      properties: {
        task_type: {
          type: "string",
          enum: TASK_TYPES,
          description: "Which kind of writing task is being graded.",
        },
        marks: {
          type: "integer",
          description: "Total marks the piece is being graded out of, e.g. 10.",
        },
      },
      required: ["task_type", "marks"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

/** Looks up one rubric tier. Returns it as compact JSON, or an error string. */
export function getRubric(taskType: string, marks: number): string {
  const tier = RUBRICS[taskType]?.[String(marks)];
  if (!tier) {
    const available = RUBRICS[taskType]
      ? Object.keys(RUBRICS[taskType]).sort((a, b) => Number(a) - Number(b))
      : [];
    return JSON.stringify({
      error: `No rubric for task_type='${taskType}' at ${marks} marks.`,
      available_marks_for_this_task_type: available,
    });
  }
  return JSON.stringify(tier);
}

export function callFunction(name: string, args: Record<string, unknown>): string {
  if (name === "get_rubric") {
    return getRubric(args.task_type as string, args.marks as number);
  }
  throw new Error(`Unknown function: ${name}`);
}
