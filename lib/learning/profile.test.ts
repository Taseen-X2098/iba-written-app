import { createAdminClient } from "@/lib/supabase/admin";
import type { GradingResult, ResponsesClient } from "@/lib/grading/grade";
import {
  prepareLearnerProfilePlan,
  prepareManualLearnerProfilePlan,
  recordLearnerProfileUpdate,
} from "./profile";

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

function queryResult(data: unknown) {
  const result = { data, error: null };
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(async () => result);
  chain.maybeSingle = jest.fn(async () => result);
  return chain;
}

const baseResult: GradingResult = {
  internal: {
    total: 5.5,
    max: 10,
    criteria: [{
      criterion: "Grammar accuracy",
      marksAwarded: 2,
      marksPossible: 5,
      reasoning: "Several sentence-level errors reduce clarity.",
    }],
  },
  studentFeedback: {
    score: "5.5/10",
    summary: "The central idea is relevant but needs clearer expression.",
    highlights: [{ quote: "clear idea", comment: "Relevant point.", type: "strength" }],
  },
};

describe("structured learner profiles", () => {
  const rpc = jest.fn(async () => ({ error: null }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "student_profile_summaries") return queryResult(null);
        return queryResult([]);
      }),
      rpc,
    } as never);
  });

  it("personalizes mock feedback without changing the fixed score", async () => {
    const client: ResponsesClient = {
      responses: { create: jest.fn() },
    };
    const plan = await prepareLearnerProfilePlan({
      client,
      useMock: true,
      userId: "00000000-0000-0000-0000-000000000001",
      category: "essay",
      submission: "A clear idea appears here.",
      result: baseResult,
    });

    expect(client.responses.create).not.toHaveBeenCalled();
    expect(plan.result.internal.total).toBe(5.5);
    expect(plan.result.studentFeedback.score).toBe("5.5/10");
    expect(plan.result.studentFeedback.summary).toContain("grammar accuracy");
    expect(plan.observations[0].skillKey).toBe("grammar_accuracy");
  });

  it("preserves an administrator's summary while preparing profile evidence", async () => {
    const plan = await prepareManualLearnerProfilePlan({
      userId: "00000000-0000-0000-0000-000000000001",
      category: "essay",
      submission: "A clear idea appears here.",
      result: baseResult,
    });

    expect(plan.result.studentFeedback.summary).toBe(baseResult.studentFeedback.summary);
    expect(plan.observations).toHaveLength(1);
  });

  it("records the normalized mark and structured observations", async () => {
    const plan = await prepareManualLearnerProfilePlan({
      userId: "00000000-0000-0000-0000-000000000001",
      category: "essay",
      submission: "A clear idea appears here.",
      result: baseResult,
    });
    await recordLearnerProfileUpdate({
      userId: "00000000-0000-0000-0000-000000000001",
      sourceKind: "standalone",
      sourceId: "00000000-0000-0000-0000-000000000002",
      category: "essay",
      plan,
    });

    expect(rpc).toHaveBeenCalledWith("record_student_learning_profile_update", expect.objectContaining({
      p_final_score: 5.5,
      p_max_score: 10,
      p_observations: expect.arrayContaining([
        expect.objectContaining({ skillKey: "grammar_accuracy" }),
      ]),
    }));
  });
});
