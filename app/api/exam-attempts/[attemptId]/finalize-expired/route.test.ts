import { NextRequest } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { finalizeExpiredOfficialAttempt } from "@/lib/exams/finalize";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/finalize", () => ({
  finalizeExpiredOfficialAttempt: jest.fn(),
}));

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "20000000-0000-4000-8000-000000000002";

function request(body?: unknown) {
  return new NextRequest(
    `http://localhost/api/exam-attempts/${ATTEMPT_ID}/finalize-expired`,
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}

describe("POST expired official attempt finalization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireApiUser).mockResolvedValue({ id: USER_ID } as never);
    jest.mocked(finalizeExpiredOfficialAttempt).mockResolvedValue({
      alreadyFinalized: false,
      attempt: { id: ATTEMPT_ID },
    } as never);
  });

  it("binds finalization to the authenticated owner and path attempt", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      alreadyCompleted: false,
    });
    expect(finalizeExpiredOfficialAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      userId: USER_ID,
    });
  });

  it("cannot inject an exam id, writer token, or answer data through the body", async () => {
    const response = await POST(request({
      examId: "30000000-0000-4000-8000-000000000003",
      writerToken: "attacker-controlled",
      answers: [{ examQuestionId: "question", editedText: "late answer" }],
    }), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });

    expect(response.status).toBe(200);
    expect(finalizeExpiredOfficialAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      userId: USER_ID,
    });
  });

  it("rejects a malformed attempt id before finalization", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ attemptId: "not-an-attempt" }),
    });

    expect(response.status).toBe(400);
    expect(finalizeExpiredOfficialAttempt).not.toHaveBeenCalled();
  });
});
