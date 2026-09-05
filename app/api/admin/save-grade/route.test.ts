import OpenAI from "openai";
import { NextRequest } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { createMockClient } from "@/lib/grading/mockClient";
import {
  prepareManualLearnerProfilePlan,
  recordLearnerProfileUpdate,
} from "@/lib/learning/profile";
import { createAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

jest.mock("openai", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireAdminUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/grading/mockClient", () => ({ createMockClient: jest.fn() }));
jest.mock("@/lib/learning/profile", () => ({
  prepareManualLearnerProfilePlan: jest.fn(),
  recordLearnerProfileUpdate: jest.fn(),
}));
jest.mock("@/lib/grading/jobs", () => ({ wakeGradingWorker: jest.fn() }));
jest.mock("@/lib/learning/report-jobs", () => ({ drainProgressionReportQueue: jest.fn() }));

const SUBMISSION_ID = "10000000-0000-4000-8000-000000000001";

describe("POST /api/admin/save-grade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireAdminUser).mockResolvedValue({ id: "admin-id" } as never);
  });

  it("saves a translation grade without constructing or calling any AI client", async () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn().mockResolvedValue({
        data: {
          user_id: "student-id",
          edited_text: "",
          grading_result: null,
          exam_questions: {
            marks: 10,
            questions: { category: "translation" },
          },
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(createAdminClient).mockResolvedValue({
      from: jest.fn(() => query),
      rpc,
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);

    const request = new NextRequest("http://localhost/api/admin/save-grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: SUBMISSION_ID,
        score: 7.5,
        remarks: "Accurate meaning and natural Bangla phrasing.",
        waysToImprove: "Preserve the tone more consistently.",
        highlights: [],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(OpenAI).not.toHaveBeenCalled();
    expect(createMockClient).not.toHaveBeenCalled();
    expect(prepareManualLearnerProfilePlan).not.toHaveBeenCalled();
    expect(recordLearnerProfileUpdate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("save_manual_exam_grade", expect.objectContaining({
      p_submission_id: SUBMISSION_ID,
      p_grading_result: expect.objectContaining({
        internal: expect.objectContaining({ total: 7.5, max: 10 }),
      }),
    }));
  });
});
