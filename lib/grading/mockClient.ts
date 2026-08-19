import type {
  ResponsesClient,
  ResponsesCreateParams,
  ResponsesCreateResult,
} from "./grade";

interface MockOptions {
  /** task_type the "model" will pretend to ask get_rubric for */
  taskType: string;
  /** marks the "model" will pretend to ask get_rubric for */
  marks: number;
  /**
   * The exact submission text this mock will be graded against — needed so
   * the canned highlights can reference real substrings of it (otherwise
   * validateHighlights() in grade.ts would just drop them all).
   */
  submission: string;
  /** override the canned student-facing summary text */
  studentSummary?: string;
  /** set true to simulate the model NOT calling any tool (edge case to test) */
  skipToolCall?: boolean;
}

/**
 * Fakes exactly the two-turn shape grade.ts expects:
 *   1st call  -> model "decides" to call get_rubric(taskType, marks)
 *   2nd call  -> model returns a final structured { internal, student_feedback } result
 *
 * This tests your plumbing (does get_rubric() get invoked with the right
 * args, does its output flow back into the second request, do highlights
 * survive validateHighlights()) without ever hitting the network or
 * OPENAI_API_KEY.
 */
export function createMockClient(options: MockOptions): ResponsesClient {
  let callCount = 0;

  // Pull the first ~6 words out of the real submission so the mock
  // highlight is an actual verbatim substring, same as a real model
  // would be required to produce.
  const firstFewWords = options.submission.trim().split(/\s+/).slice(0, 6).join(" ");

  return {
    responses: {
      create: async (_params: ResponsesCreateParams): Promise<ResponsesCreateResult> => {
        callCount += 1;

        if (callCount === 1 && !options.skipToolCall) {
          return {
            output: [
              {
                type: "function_call",
                name: "get_rubric",
                call_id: "mock_call_1",
                arguments: JSON.stringify({
                  task_type: options.taskType,
                  marks: options.marks,
                }),
              },
            ],
            output_text: "",
          };
        }

        const mockScore = Math.round(options.marks * 0.8 * 10) / 10;

        const mockResult = {
          internal: {
            total: mockScore,
            max: options.marks,
            criteria: [
              {
                criterion: "Mock criterion (no real model was called)",
                marks_awarded: 1,
                marks_possible: 1,
                reasoning: "Canned reasoning from the mock client.",
              },
            ],
          },
          student_feedback: {
            score: `${mockScore}/${options.marks}`,
            summary:
              options.studentSummary ??
              "This is canned mock feedback for testing — no real grading happened. Swap in a real OpenAI client to get an actual response.",
            highlights: firstFewWords
              ? [
                  {
                    quote: firstFewWords,
                    comment:
                      "MOCK: this is a canned comment standing in for a specific, detailed observation about this exact phrase.",
                    type: "strength" as const,
                  },
                ]
              : [],
          },
        };

        return {
          output: [],
          output_text: JSON.stringify(mockResult),
        };
      },
    },
  };
}
