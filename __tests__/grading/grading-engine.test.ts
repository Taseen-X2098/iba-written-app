/**
 * Comprehensive test suite for the grading engine.
 * Tests: mock client, rubric lookup, highlight validation, structured output parsing,
 * prompt injection defense, edge cases.
 */
import {
  grade,
  type ResponsesClient,
  type ResponsesCreateParams,
} from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { getRubric, callFunction, TASK_TYPES } from "@/lib/grading/tools";
import { SYSTEM_PROMPT } from "@/lib/grading/systemPrompt";

// ─── Rubric Lookup Tests ─────────────────────────────────────────────────────

describe("getRubric", () => {
  it("returns valid JSON for known task type and marks", () => {
    const result = getRubric("argumentative_essay", 15);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("total", 15);
    expect(parsed).toHaveProperty("criteria");
    expect(parsed.criteria.length).toBeGreaterThan(0);
  });

  it("returns valid JSON for argumentative_essay at 10 marks", () => {
    const result = getRubric("argumentative_essay", 10);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(10);
  });

  it("returns valid JSON for quote_analysis at 5 marks", () => {
    const result = getRubric("quote_analysis", 5);
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(5);
  });

  it("returns the approved Story Completion rubric at 9 marks", () => {
    const parsed = JSON.parse(getRubric("story_completion", 9));
    expect(parsed.total).toBe(9);
    expect(parsed.criteria[0].criterion).toBe(
      "Continuity with the opening and prompt adherence",
    );
  });

  it("returns error for unknown task type", () => {
    const result = getRubric("nonexistent_type", 10);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("error");
  });

  it("returns error with available marks for unknown marks value", () => {
    const result = getRubric("argumentative_essay", 999);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("error");
    expect(parsed).toHaveProperty("available_marks_for_this_task_type");
    expect(Array.isArray(parsed.available_marks_for_this_task_type)).toBe(true);
  });

  it("lists all task types in TASK_TYPES constant", () => {
    expect(TASK_TYPES).toContain("argumentative_essay");
    expect(TASK_TYPES).toContain("quote_analysis");
    expect(TASK_TYPES).toContain("creative_writing");
    expect(TASK_TYPES).toContain("personal_reflection");
    expect(TASK_TYPES).toContain("basic_paragraph");
    expect(TASK_TYPES).toContain("story_completion");
    expect(TASK_TYPES.length).toBe(6);
  });
});

describe("callFunction", () => {
  it("dispatches get_rubric correctly", () => {
    const result = callFunction("get_rubric", { task_type: "argumentative_essay", marks: 15 });
    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(15);
  });

  it("throws for unknown function name", () => {
    expect(() => callFunction("unknown_fn", {})).toThrow("Unknown function");
  });
});

// ─── Mock Client Tests ───────────────────────────────────────────────────────

describe("createMockClient", () => {
  it("produces a valid ResponsesClient interface", () => {
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 10,
      submission: "This is a test submission for grading purposes.",
    });
    expect(client).toHaveProperty("responses");
    expect(client.responses).toHaveProperty("create");
  });

  it("first call returns a function_call for get_rubric", async () => {
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 10,
      submission: "Some text here for testing purposes.",
    });
    const result = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions: "",
      tools: [],
      input: [],
    });
    expect(result.output.length).toBe(1);
    expect(result.output[0].type).toBe("function_call");
    const call = result.output[0] as any;
    expect(call.name).toBe("get_rubric");
    const args = JSON.parse(call.arguments);
    expect(args.task_type).toBe("argumentative_essay");
    expect(args.marks).toBe(10);
  });

  it("second call returns structured grading output", async () => {
    const client = createMockClient({
      taskType: "creative_writing",
      marks: 8,
      submission: "The waves crashed against the ancient lighthouse, each one telling a story.",
    });
    // First call triggers tool call
    await client.responses.create({ model: "gpt-5.2", instructions: "", tools: [], input: [] });
    // Second call returns grading
    const result = await client.responses.create({ model: "gpt-5.2", instructions: "", tools: [], input: [] });
    expect(result.output_text).toBeTruthy();
    const parsed = JSON.parse(result.output_text);
    expect(parsed).toHaveProperty("internal");
    expect(parsed).toHaveProperty("student_feedback");
    expect(parsed.internal.max).toBe(8);
    expect(parsed.student_feedback.score).toMatch(/\d+\/8/);
  });

  it("skipToolCall option makes first call return final result directly", async () => {
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 10,
      submission: "Test submission for direct grading skip.",
      skipToolCall: true,
    });
    const result = await client.responses.create({ model: "gpt-5.2", instructions: "", tools: [], input: [] });
    expect(result.output_text).toBeTruthy();
    const parsed = JSON.parse(result.output_text);
    expect(parsed.internal.max).toBe(10);
  });

  it("mock highlight is a real substring of the submission", async () => {
    const submission = "Innovation requires persistence and willingness to fail";
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 10,
      submission,
    });
    // Skip tool call
    await client.responses.create({ model: "gpt-5.2", instructions: "", tools: [], input: [] });
    const result = await client.responses.create({ model: "gpt-5.2", instructions: "", tools: [], input: [] });
    const parsed = JSON.parse(result.output_text);
    if (parsed.student_feedback.highlights.length > 0) {
      const quote = parsed.student_feedback.highlights[0].quote;
      expect(submission).toContain(quote);
    }
  });
});

// ─── Full Grading Pipeline Tests ─────────────────────────────────────────────

describe("grade() with mock client", () => {
  it("forces file_search against the configured vector store for real grading", async () => {
    let capturedParams: ResponsesCreateParams | undefined;
    const fileSearchClient: ResponsesClient = {
      responses: {
        create: async (params) => {
          capturedParams = params;
          return {
            output: [{ type: "file_search_call", id: "fs_test", status: "completed" }],
            output_text: JSON.stringify({
              internal: { total: 4, max: 5, criteria: [] },
              student_feedback: { score: "4/5", summary: "Good work.", highlights: [] },
            }),
          };
        },
      },
    };

    await grade(fileSearchClient, "A relevant response.", "basic_paragraph", 5, {
      rubricSource: { type: "file_search", vectorStoreId: "vs_test123" },
      questionPrompt: "A reference question prompt.",
    });

    expect(capturedParams?.tools).toEqual([
      {
        type: "file_search",
        vector_store_ids: ["vs_test123"],
        max_num_results: 5,
      },
    ]);
    expect(capturedParams?.tool_choice).toEqual({ type: "file_search" });
    expect(capturedParams?.instructions).toContain("call file_search");
    expect(capturedParams?.instructions).not.toContain("call get_rubric");
    expect(JSON.stringify(capturedParams?.input)).toContain("<question-prompt-");
    expect(JSON.stringify(capturedParams?.input)).toContain("A reference question prompt.");
  });

  it("rejects a real grading response that skipped file search", async () => {
    const noSearchClient: ResponsesClient = {
      responses: {
        create: async () => ({
          output: [],
          output_text: JSON.stringify({
            internal: { total: 4, max: 5, criteria: [] },
            student_feedback: { score: "4/5", summary: "Good work.", highlights: [] },
          }),
        }),
      },
    };

    await expect(
      grade(noSearchClient, "A relevant response.", "basic_paragraph", 5, {
        rubricSource: { type: "file_search", vectorStoreId: "vs_test123" },
      })
    ).rejects.toThrow("did not use the required rubric file search");
  });

  it("returns a properly shaped GradingResult", async () => {
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 10,
      submission: "The government should prioritize renewable energy over fossil fuels due to environmental concerns.",
    });
    const result = await grade(
      client,
      "The government should prioritize renewable energy over fossil fuels due to environmental concerns.",
      "argumentative_essay",
      10
    );
    expect(result).toHaveProperty("internal");
    expect(result).toHaveProperty("studentFeedback");
    expect(result.internal.max).toBe(10);
    expect(result.internal.total).toBeGreaterThanOrEqual(0);
    expect(result.internal.total).toBeLessThanOrEqual(10);
    expect(result.studentFeedback.score).toMatch(/\d+(\.\d+)?\/10/);
    expect(typeof result.studentFeedback.summary).toBe("string");
    expect(Array.isArray(result.studentFeedback.highlights)).toBe(true);
  });

  it("converts snake_case to camelCase in output", async () => {
    const sub = "Education is the key to national development and progress.";
    const client = createMockClient({ taskType: "basic_paragraph", marks: 5, submission: sub });
    const result = await grade(client, sub, "basic_paragraph", 5);
    // Should be camelCase, not snake_case
    expect(result).toHaveProperty("studentFeedback");
    expect(result.studentFeedback).toHaveProperty("score");
    expect(result.studentFeedback).toHaveProperty("summary");
    expect(result.studentFeedback).toHaveProperty("highlights");
    expect(result.internal).toHaveProperty("criteria");
    if (result.internal.criteria.length > 0) {
      expect(result.internal.criteria[0]).toHaveProperty("marksAwarded");
      expect(result.internal.criteria[0]).toHaveProperty("marksPossible");
    }
  });

  it("drops highlights that aren't real substrings (validateHighlights)", async () => {
    // Create a mock client that returns a fake highlight
    const fakeClient: ResponsesClient = {
      responses: {
        create: async () => ({
          output: [],
          output_text: JSON.stringify({
            internal: { total: 7, max: 10, criteria: [] },
            student_feedback: {
              score: "7/10",
              summary: "Good effort.",
              highlights: [
                { quote: "this is definitely not in the submission", comment: "Fake", type: "strength" },
                { quote: "real quote from submission", comment: "Real", type: "improvement" },
              ],
            },
          }),
        }),
      },
    };
    const result = await grade(fakeClient, "This has a real quote from submission in it.", "argumentative_essay", 10);
    // The fake highlight should be dropped
    expect(result.studentFeedback.highlights.length).toBe(1);
    expect(result.studentFeedback.highlights[0].quote).toBe("real quote from submission");
  });

  it("handles empty submission gracefully with mock", async () => {
    const client = createMockClient({
      taskType: "argumentative_essay",
      marks: 15,
      submission: "",
    });
    const result = await grade(client, "", "argumentative_essay", 15);
    expect(result.internal.max).toBe(15);
  });
});

// ─── System Prompt Tests ─────────────────────────────────────────────────────

describe("SYSTEM_PROMPT", () => {
  it("exists and is non-empty", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("mentions get_rubric requirement", () => {
    expect(SYSTEM_PROMPT).toContain("get_rubric");
  });

  it("mentions prompt injection defense", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("injection");
  });

  it("mentions translation exclusion", () => {
    expect(SYSTEM_PROMPT).toContain("Translation");
  });

  it("defines Story Completion continuity and copying rules", () => {
    expect(SYSTEM_PROMPT).toContain("Story completion");
    expect(SYSTEM_PROMPT).toContain("copy the supplied opening");
    expect(SYSTEM_PROMPT).toContain("must not exceed 50%");
  });

  it("instructs never to grade from memory", () => {
    expect(SYSTEM_PROMPT).toContain("Never grade from memory");
  });

  it("requires simple English without losing feedback quality", () => {
    expect(SYSTEM_PROMPT).toContain("very simple, direct English");
    expect(SYSTEM_PROMPT).toContain("must not remove important reasoning");
    expect(SYSTEM_PROMPT).toContain("exactly two short paragraphs");
    expect(SYSTEM_PROMPT).toContain("add one empty line");
  });
});
