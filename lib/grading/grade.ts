import { randomUUID } from "node:crypto";
import { TOOLS, callFunction } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";
import type { GradingRubricSource } from "./config";
import {
  calibrateAiFinalMark,
  formatScore,
  MARK_NORMALIZATION_VERSION,
} from "./marks";
import { formatNumberedImprovementList, parseImprovementActions } from "./improvements";

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
  tool_choice?: unknown;
  input: unknown[];
  text?: unknown;
}

export interface ResponsesCreateResult {
  output: ResponsesOutputItem[];
  output_text: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface ResponsesClient {
  responses: {
    create: (params: ResponsesCreateParams) => Promise<ResponsesCreateResult>;
  };
}

// Structured Outputs schema — the model MUST return exactly this shape.
// `internal` is the full rubric breakdown, for your eyes only.
// `student_feedback` is the only part safe to ever show a student: a score,
// a detailed plain-language summary, and specific highlights tied to exact
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
          remarks: { type: "string" },
          ways_to_improve: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 3,
          },
          grammar_errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                quote: { type: "string" },
                error_type: { type: "string" },
                explanation: { type: "string" },
                corrections: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 2,
                },
              },
              required: ["quote", "error_type", "explanation", "corrections"],
              additionalProperties: false,
            },
          },
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
        required: ["score", "remarks", "ways_to_improve", "grammar_errors", "highlights"],
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

export interface GrammarError {
  quote: string;
  errorType: string;
  explanation: string;
  corrections: string[];
}

export interface GradingResult {
  internal: {
    total: number;
    max: number;
    /** Prevents the canonical score policy from being applied more than once. */
    normalizationVersion?: number;
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
    remarks?: string;
    personalizedFeedback?: string;
    waysToImprove?: string;
    grammarErrors?: GrammarError[];
    highlights: Highlight[];
  };
}

export function composeStudentFeedbackSummary(input: {
  remarks: string;
  personalizedFeedback: string;
  waysToImprove: string;
}): string {
  return [input.remarks, input.personalizedFeedback, input.waysToImprove]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12_000);
}

function systemPromptFor(rubricSource: GradingRubricSource): string {
  if (rubricSource.type === "local_function") return SYSTEM_PROMPT;

  return SYSTEM_PROMPT
    .replace(
      "call get_rubric with the task's type and total marks to fetch the exact criteria and mark allocations",
      "call file_search to retrieve the exact rubric for the task's type and total marks from the configured rubric vector store"
    )
    .replaceAll("criteria from get_rubric", "criteria retrieved through file_search")
    .replaceAll("call get_rubric", "call file_search")
    .replaceAll("from get_rubric", "from file_search");
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

function validateGrammarErrors(submission: string, value: unknown): GrammarError[] {
  if (!Array.isArray(value)) return [];
  const validated: GrammarError[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const quote = String(row.quote ?? "").trim();
    const errorType = String(row.error_type ?? "").trim().slice(0, 120);
    const explanation = String(row.explanation ?? "").trim().slice(0, 1_000);
    const corrections = Array.isArray(row.corrections)
      ? row.corrections
          .map((correction) => String(correction).trim())
          .filter(Boolean)
          .slice(0, 2)
      : [];
    if (!quote || !submission.includes(quote) || !errorType || !explanation || !corrections.length) {
      continue;
    }
    validated.push({ quote, errorType, explanation, corrections });
  }
  return validated;
}

function taskTypeLabel(taskType: string): string {
  return taskType
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const PARAGRAPH_STRUCTURE_ACTIONS: Readonly<Record<string, string>> = {
  argumentative_essay: "Use separate paragraphs next time: one for the opening and position, one for each developed reason or example, and one for the conclusion. Your submitted answer had no visible paragraph breaks, so its structure was harder to follow.",
  quote_analysis: "Use separate paragraphs next time: explain the quote and your view first, develop the reasons and example in the middle, and end with a short conclusion. Your submitted answer had no visible paragraph breaks.",
  creative_writing: "Use separate paragraphs next time when the scene, time, speaker, or main focus changes. Your submitted story had no visible paragraph breaks, which made the events harder to follow.",
  personal_reflection: "Use separate paragraphs next time for the event, what it taught you, and how you changed or will act later. Your submitted reflection had no visible paragraph breaks.",
  story_completion: "Use separate paragraphs next time when the scene, time, speaker, or main focus changes. Your submitted story had no visible paragraph breaks, which made the continuation harder to follow.",
};

const PARAGRAPH_STRUCTURE_REMARKS: Readonly<Record<string, string>> = {
  argumentative_essay: "No paragraph breaks are visible in the submitted answer. Divide it into an opening that states your position, separate body paragraphs for developed reasons or examples, and a conclusion that brings the argument together.",
  quote_analysis: "No paragraph breaks are visible in the submitted answer. Use an opening paragraph to explain the quote and your view, middle paragraphs to develop reasons and an example, and a final paragraph for the conclusion.",
  creative_writing: "No paragraph breaks are visible in the submitted story. Start a new paragraph when the scene, time, speaker, or main focus changes so the sequence is easier to follow.",
  personal_reflection: "No paragraph breaks are visible in the submitted reflection. Separate the event, what it taught you, and the change or next step into logical paragraphs.",
  story_completion: "No paragraph breaks are visible in the submitted story. Start a new paragraph when the scene, time, speaker, or main focus changes so the continuation is easier to follow.",
};

const PARAGRAPH_STRUCTURE_REMARK_PATTERNS: Readonly<Record<string, RegExp>> = {
  argumentative_essay: /(?:opening|introduction)[\s\S]*(?:body|reason|example)[\s\S]*conclusion/i,
  quote_analysis: /(?:opening|introduction)[\s\S]*(?:reason|example)[\s\S]*conclusion/i,
  creative_writing: /new paragraph[\s\S]*(?:scene|time|speaker|focus)/i,
  personal_reflection: /event[\s\S]*(?:taught|lesson)[\s\S]*(?:change|next step)/i,
  story_completion: /new paragraph[\s\S]*(?:scene|time|speaker|focus)/i,
};

function needsParagraphStructureReminder(submission: string, taskType: string): boolean {
  return Boolean(PARAGRAPH_STRUCTURE_ACTIONS[taskType])
    && !/\r?\n\s*(?:\r?\n)?/.test(submission.trim());
}

function ensureParagraphStructureRemarks(
  submission: string,
  taskType: string,
  remarks: string,
): string {
  const reminder = PARAGRAPH_STRUCTURE_REMARKS[taskType];
  const structurePattern = PARAGRAPH_STRUCTURE_REMARK_PATTERNS[taskType];
  const identifiesOneBlock = /no (?:visible )?paragraph breaks|one uninterrupted block/i.test(remarks);
  const alreadyCovered = identifiesOneBlock && structurePattern?.test(remarks);

  if (!reminder || !needsParagraphStructureReminder(submission, taskType) || alreadyCovered) {
    return remarks;
  }

  const paragraphs = remarks
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return `${paragraphs[0] || remarks}\n\n${reminder}`;
  }

  return `${paragraphs[0]}\n\n${[...paragraphs.slice(1), reminder].join(" ")}`;
}

function ensureParagraphStructureAction(
  submission: string,
  taskType: string,
  value: unknown,
): string {
  const actions = parseImprovementActions(value);
  const reminder = PARAGRAPH_STRUCTURE_ACTIONS[taskType];
  const alreadyCovered = actions.some((action) =>
    /no (?:visible )?paragraph breaks|separate paragraphs|add (?:the missing )?(?:paragraph|line) breaks|start (?:a )?new paragraph/i.test(action),
  );

  if (!reminder || !needsParagraphStructureReminder(submission, taskType) || alreadyCovered) {
    return formatNumberedImprovementList(actions);
  }

  return formatNumberedImprovementList([reminder, ...actions].slice(0, 3));
}

function calibrateCriteria(
  criteria: GradingResult["internal"]["criteria"],
  modelTotal: number,
  finalTotal: number,
): GradingResult["internal"]["criteria"] {
  const factor = modelTotal > 0 ? finalTotal / modelTotal : 0;
  return criteria.map((criterion) => ({
    ...criterion,
    marksAwarded: Math.min(
      criterion.marksPossible,
      Math.max(0, Math.floor((criterion.marksAwarded * factor + Number.EPSILON) * 1_000) / 1_000),
    ),
  }));
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
  marks: number,
  options: {
    rubricSource?: GradingRubricSource;
    questionPrompt?: string;
  } = {}
): Promise<GradingResult> {
  const rubricSource = options.rubricSource ?? { type: "local_function" };
  const usesFileSearch = rubricSource.type === "file_search";
  const tools = usesFileSearch
    ? [{
        type: "file_search",
        vector_store_ids: [rubricSource.vectorStoreId],
        max_num_results: 5,
      }]
    : TOOLS;
  const toolChoice = usesFileSearch ? { type: "file_search" } : undefined;
  // A fixed label like "Submission:" is trivially spoofable — a student
  // can just write their own "Submission:" line inside the essay to try
  // to make the model think the real text ends early. A per-request
  // random nonce isn't guessable in advance, so it can't be pre-embedded
  // in a submission written before this function ever runs.
  const nonce = randomUUID();
  const questionReference = options.questionPrompt?.trim()
    ? `The original question is reference material between the ` +
      `<question-prompt-${nonce}> tags below.\n\n` +
      `<question-prompt-${nonce}>\n${options.questionPrompt.trim()}\n</question-prompt-${nonce}>\n\n`
    : "";
  const userMessage =
    `Task type: ${taskType}\n` +
    `Total marks: ${marks}\n\n` +
    (usesFileSearch
      ? `First retrieve the exact '${taskType}' rubric for ${marks} total marks from the rubric vector store.\n\n`
      : "") +
    questionReference +
    `Everything between the <submission-${nonce}> tags below is the ` +
    `student's raw, unmodified text. See the system instructions for how ` +
    `to treat it.\n\n` +
    `<submission-${nonce}>\n${submission}\n</submission-${nonce}>`;

  let inputList: unknown[] = [{ role: "user", content: userMessage }];

  let response = await client.responses.create({
    model: MODEL,
    instructions: systemPromptFor(rubricSource),
    tools,
    tool_choice: toolChoice,
    text: { format: GRADING_RESULT_FORMAT },
    input: inputList,
  });

  if (usesFileSearch && !response.output.some((item) => item.type === "file_search_call")) {
    throw new Error("OpenAI grading response did not use the required rubric file search.");
  }

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
      instructions: systemPromptFor(rubricSource),
      tools,
      tool_choice: toolChoice,
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
    student_feedback: {
      score: string;
      summary?: string;
      remarks?: string;
      ways_to_improve?: string | string[];
      grammar_errors?: unknown;
      highlights: Highlight[];
    };
  };

  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new Error(
      `Model did not return valid structured output: ${response.output_text}`
    );
  }

  const normalizedTotal = calibrateAiFinalMark(parsed.internal.total, marks);
  const criteria = calibrateCriteria(
    parsed.internal.criteria.map((criterion) => ({
      criterion: criterion.criterion,
      marksAwarded: criterion.marks_awarded,
      marksPossible: criterion.marks_possible,
      reasoning: criterion.reasoning,
    })),
    parsed.internal.total,
    normalizedTotal,
  );
  const legacySummary = String(parsed.student_feedback.summary ?? "").trim();
  const modelRemarks = String(parsed.student_feedback.remarks ?? legacySummary).trim()
    || "Your response addresses the task, but the available feedback could not be expanded further.";
  const remarks = ensureParagraphStructureRemarks(submission, taskType, modelRemarks);
  const personalizedFeedback = `No previous ${taskTypeLabel(taskType)} answers were found.\n\nThis personal feedback is based only on your current answer.`;
  const waysToImprove = ensureParagraphStructureAction(
    submission,
    taskType,
    parsed.student_feedback.ways_to_improve,
  );

  return {
    internal: {
      total: normalizedTotal,
      max: marks,
      normalizationVersion: MARK_NORMALIZATION_VERSION,
      criteria,
    },
    studentFeedback: {
      score: formatScore(normalizedTotal, marks),
      summary: composeStudentFeedbackSummary({ remarks, personalizedFeedback, waysToImprove }),
      remarks,
      personalizedFeedback,
      waysToImprove,
      grammarErrors: validateGrammarErrors(submission, parsed.student_feedback.grammar_errors),
      highlights: validateHighlights(submission, parsed.student_feedback.highlights),
    },
  };
}
