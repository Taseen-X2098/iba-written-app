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
  /** what the "model" says on its second turn, after seeing the rubric */
  finalText?: string;
  /** set true to simulate the model NOT calling any tool (edge case to test) */
  skipToolCall?: boolean;
}

/**
 * Fakes exactly the two-turn shape grade.ts expects:
 *   1st call  -> model "decides" to call get_rubric(taskType, marks)
 *   2nd call  -> model returns a final graded response
 *
 * This tests your plumbing (does get_rubric() get invoked with the right
 * args, does its output flow back into the second request, does the final
 * text come out the other end) without ever hitting the network or OPENAI_API_KEY.
 */
export function createMockClient(options: MockOptions): ResponsesClient {
  let callCount = 0;

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

        return {
          output: [],
          output_text:
            options.finalText ??
            [
              "MOCK GRADE (no real model was called)",
              "",
              "Topic understanding & topic sentence: 0.4/0.5 — on-topic opening.",
              "Development of the main idea: 3/4 — solid but one supporting point is thin.",
              "",
              `Total: 4/${options.marks} (mock)`,
              "",
              "This is canned output from the mock client — swap in a real",
              "OpenAI client to get an actual grade.",
            ].join("\n"),
        };
      },
    },
  };
}
