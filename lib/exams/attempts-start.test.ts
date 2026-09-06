jest.mock("server-only", () => ({}));

import { createAdminClient } from "@/lib/supabase/admin";
import { isAttemptResumeWindowClosed, startAttempt } from "./attempts";
import type { Exam } from "@/lib/types";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

const NOW = "2026-09-06T10:00:00.000Z";

function freeExam(endsAt: string): Exam {
  return {
    id: "exam-1",
    title: "Free exam",
    description: null,
    time_limit_minutes: 30,
    starts_at: "2026-09-06T09:00:00.000Z",
    ends_at: endsAt,
    is_published: true,
    results_published: false,
    results_version: 0,
    is_magnus_only: false,
    is_free: true,
    created_by: "admin-1",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

function adminClientFor(exam: Exam, subscriptionRows?: Array<{ id: string }>) {
  const from = jest.fn((table: string) => {
    if (table === "subscriptions") {
      if (subscriptionRows === undefined) {
        throw new Error("A free official exam must not query subscriptions");
      }
      const limit = jest.fn().mockResolvedValue({ data: subscriptionRows, error: null });
      const gt = jest.fn().mockReturnValue({ limit });
      const planIn = jest.fn().mockReturnValue({ gt });
      const activeEq = jest.fn().mockReturnValue({ in: planIn });
      const userEq = jest.fn().mockReturnValue({ eq: activeEq });
      return { select: jest.fn().mockReturnValue({ eq: userEq }) };
    }
    if (table === "exams") {
      const single = jest.fn().mockResolvedValue({ data: exam, error: null });
      const publishedEq = jest.fn().mockReturnValue({ single });
      const idEq = jest.fn().mockReturnValue({ eq: publishedEq });
      return { select: jest.fn().mockReturnValue({ eq: idEq }) };
    }
    if (table === "exam_attempts") {
      const limit = jest.fn().mockResolvedValue({ data: [], error: null });
      const order = jest.fn().mockReturnValue({ limit });
      const modeEq = jest.fn().mockReturnValue({ order });
      const userEq = jest.fn().mockReturnValue({ eq: modeEq });
      const examEq = jest.fn().mockReturnValue({ eq: userEq });
      return { select: jest.fn().mockReturnValue({ eq: examEq }) };
    }
    if (table === "exam_questions") {
      const order = jest.fn().mockResolvedValue({ data: [], error: null });
      const eq = jest.fn().mockReturnValue({ order });
      return { select: jest.fn().mockReturnValue({ eq }) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  const rpc = jest.fn(async (name: string, args: Record<string, string>) => {
    if (name !== "start_exam_attempt") throw new Error(`Unexpected RPC: ${name}`);
    return {
      data: {
        id: "attempt-1",
        exam_id: exam.id,
        user_id: args.p_user_id,
        mode: "official",
        status: "active",
        expires_at: args.p_expires_at,
        writer_token_hash: args.p_writer_token_hash,
      },
      error: null,
    };
  });
  return { from, rpc };
}

describe("free official exam starts", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["uses the exam deadline when it arrives first", "2026-09-06T10:20:00.000Z", "2026-09-06T10:20:00.000Z"],
    ["uses the personal time limit when it arrives first", "2026-09-06T11:00:00.000Z", "2026-09-06T10:30:00.000Z"],
  ])("%s without requiring a subscription", async (_label, endsAt, expectedExpiry) => {
    const client = adminClientFor(freeExam(endsAt));
    jest.mocked(createAdminClient).mockReturnValue(client as never);

    const result = await startAttempt({
      examId: "exam-1",
      userId: "student-1",
      mode: "official",
    });

    expect(client.from).not.toHaveBeenCalledWith("subscriptions");
    expect(client.rpc).toHaveBeenCalledWith("start_exam_attempt", expect.objectContaining({
      p_exam_id: "exam-1",
      p_user_id: "student-1",
      p_mode: "official",
      p_expires_at: expectedExpiry,
      p_writer_token_hash: expect.any(String),
    }));
    expect(result.attempt.expires_at).toBe(expectedExpiry);
    expect(result.resumed).toBe(false);
  });
});

describe("attempt resume windows", () => {
  it("keeps an expired practice attempt resumable for grading selection", () => {
    const expiresAt = "2026-09-06T09:00:00.000Z";
    const now = Date.parse("2026-09-06T10:00:00.000Z");

    expect(isAttemptResumeWindowClosed({ mode: "practice", expires_at: expiresAt }, now)).toBe(false);
    expect(isAttemptResumeWindowClosed({ mode: "official", expires_at: expiresAt }, now)).toBe(true);
  });
});

describe("past exam practice access", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects practice mode before loading or creating an attempt when there is no exam plan", async () => {
    const exam = {
      ...freeExam("2026-09-05T11:00:00.000Z"),
      results_published: true,
    };
    const client = adminClientFor(exam, []);
    jest.mocked(createAdminClient).mockReturnValue(client as never);

    await expect(startAttempt({
      examId: exam.id,
      userId: "free-student",
      mode: "practice",
    })).rejects.toMatchObject({
      code: "PLAN_REQUIRED",
      status: 403,
      message: "An active Complete or Exams Only plan is required to practice past exams",
    });

    expect(client.rpc).not.toHaveBeenCalled();
  });
});
