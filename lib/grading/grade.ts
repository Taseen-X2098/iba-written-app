import { randomUUID } from "node:crypto";
import { TOOLS, callFunction } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";

const MODEL = "gpt-5.6-luna";

// Minimal shape of what we actually use from the OpenAI Responses API.
// The real `openai` npm package's client satisfies this already —
// `new OpenAI().responses.create(...)` matches this signature — so you can
// pass a real client or a mock one interchangeably.
export type ResponsesOutputItem =
  | { type: "function_call"; name: string; call_id: string; arguments: string }
  | { type: string; [key: string]: unknown };

export interface ResponsesCreateParams {
  model: string;
  instructions: string;
  tools: unknown;
  input: unknown[];
  text?: unknown;
}

export interface ResponsesCreateResult {
  output: ResponsesOutputItem[];
  output_text: string;
}

export interface ResponsesClient {
  responses: {
    create: (params: ResponsesCreateParams) => Promise<ResponsesCreateResult>;
  };
}

// Structured Outputs schema — the model MUST return exactly this shape.
// `internal` is the full rubric breakdown, for your eyes only.
// `student_feedback` is the only part safe to ever show a student: a score,
// a short plain-language summary, and specific highlights tied to exact
// substrings of their own submission (for in-text highlighting in the UI).
const GRADING_RESULT_FORMAT = {
  type: "json_schema",
  name: "grading_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      internal: {
        type: "object",
        properties: {
          total: { type: "number" },
          max: { type: "number" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                criterion: { type: "string" },
                marks_awarded: { type: "number" },
                marks_possible: { type: "number" },
                reasoning: { type: "string" },
              },
              required: ["criterion", "marks_awarded", "marks_possible", "reasoning"],
              additionalProperties: false,
            },
          },
        },
        required: ["total", "max", "criteria"],
        additionalProperties: false,
      },
      student_feedback: {
        type: "object",
        properties: {
          score: { type: "string" }, // e.g. "8/10" — the only number a student sees
          summary: { type: "string" }, // 2-4 plain-language sentences, no rubric jargon
          highlights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                quote: { type: "string" }, // exact verbatim substring of the submission
                comment: { type: "string" }, // specific, detailed observation about that quote
                type: { type: "string", enum: ["strength", "improvement"] },
              },
              required: ["quote", "comment", "type"],
              additionalProperties: false,
            },
          },
        },
        required: ["score", "summary", "highlights"],
        additionalProperties: false,
      },
    },
    required: ["internal", "student_feedback"],
    additionalProperties: false,
  },
} as const;

export interface Highlight {
  quote: string;
  comment: string;
  type: "strength" | "improvement";
}

export interface GradingResult {
  internal: {
    total: number;
    max: number;
    criteria: {
      criterion: string;
      marksAwarded: number;
      marksPossible: number;
      reasoning: string;
    }[];
  };
  studentFeedback: {
    score: string;
    summary: string;
    highlights: Highlight[];
  };
}

/**
 * Structured Outputs enforces the *shape* of each highlight (it has a
 * `quote`, `comment`, `type`) but not whether `quote` is actually a real
 * substring of the submission — the model can still hallucinate or
 * paraphrase one. Drop anything that doesn't match verbatim rather than
 * shipping a highlight the UI can't locate.
 */
function validateHighlights(submission: string, highlights: Highlight[]): Highlight[] {
  const valid: Highlight[] = [];
  for (const h of highlights) {
    if (submission.includes(h.quote)) {
      valid.push(h);
    } else {
      console.warn(
        `Dropping unlocatable highlight — quote not found verbatim in submission: ${JSON.stringify(h.quote)}`
      );
    }
  }
  return valid;
}

/**
 * submission: the student's raw text
 * taskType / marks: pass these in from your app — you already know them,
 * don't make the model guess them.
 */
export async function grade(
  client: ResponsesClient,
  submission: string,
  taskType: string,
  marks: number
): Promise<GradingResult> {
  // A fixed label like "Submission:" is trivially spoofable — a student
  // can just write their own "Submission:" line inside the essay to try
  // to make the model think the real text ends early. A per-request
  // random nonce isn't guessable in advance, so it can't be pre-embedded
  // in a submission written before this function ever runs.
  const nonce = randomUUID();
  const userMessage =
    `Task type: ${taskType}\n` +
    `Total marks: ${marks}\n\n` +
    `Everything between the <submission-${nonce}> tags below is the ` +
    `student's raw, unmodified text. See the system instructions for how ` +
    `to treat it.\n\n` +
    `<submission-${nonce}>\n${submission}\n</submission-${nonce}>`;

  let inputList: unknown[] = [{ role: "user", content: userMessage }];

  let response = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    tools: TOOLS,
    text: { format: GRADING_RESULT_FORMAT },
    input: inputList,
  });

  // feed any tool calls back until the model has what it needs
  inputList = inputList.concat(response.output);

  const functionCalls = response.output.filter(
    (item): item is Extract<ResponsesOutputItem, { type: "function_call" }> =>
      item.type === "function_call"
  );

  for (const item of functionCalls) {
    const args = JSON.parse(item.arguments);
    const result = callFunction(item.name, args);
    inputList.push({
      type: "function_call_output",
      call_id: item.call_id,
      output: result,
    });
  }

  // if the model made tool calls, send the results back for the final answer
  if (functionCalls.length > 0) {
    response = await client.responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      tools: TOOLS,
      text: { format: GRADING_RESULT_FORMAT },
      input: inputList,
    });
  }

  let parsed: {
    internal: {
      total: number;
      max: number;
      criteria: { criterion: string; marks_awarded: number; marks_possible: number; reasoning: string }[];
    };
    student_feedback: { score: string; summary: string; highlights: Highlight[] };
  };

  try {
    parsed = JSON.parse(response.output_text);
  } catch (err) {
    throw new Error(
      `Model did not return valid structured output: ${response.output_text}`
    );
  }

  return {
    internal: {
      total: parsed.internal.total,
      max: parsed.internal.max,
      criteria: parsed.internal.criteria.map((c) => ({
        criterion: c.criterion,
        marksAwarded: c.marks_awarded,
        marksPossible: c.marks_possible,
        reasoning: c.reasoning,
      })),
    },
    studentFeedback: {
      score: parsed.student_feedback.score,
      summary: parsed.student_feedback.summary,
      highlights: validateHighlights(submission, parsed.student_feedback.highlights),
    },
  };
}