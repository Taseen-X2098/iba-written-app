/**
 * @jest-environment jsdom
 */

jest.mock("server-only", () => ({}));

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMainUserContext } from "@/lib/main-user-context";
import TakeExamPage from "./page";
import type { Exam, ExamAttemptStatus } from "@/lib/types";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/main-user-context", () => ({ getMainUserContext: jest.fn() }));
jest.mock("@/components/exams/exam-start-gate", () => ({
  __esModule: true,
  default: ({ hasResumableAttempt }: { hasResumableAttempt: boolean }) => (
    <div data-testid="exam-start-gate" data-resumable={String(hasResumableAttempt)} />
  ),
}));
jest.mock("@/components/exams/auto-finalizer", () => ({
  __esModule: true,
  default: ({ attemptId, examId, userId }: { attemptId: string; examId: string; userId: string }) => (
    <div
      data-testid="auto-finalizer"
      data-attempt-id={attemptId}
      data-exam-id={examId}
      data-user-id={userId}
    />
  ),
}));

const NOW = "2026-09-06T10:00:00.000Z";

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
    title: "Free exam",
    description: null,
    time_limit_minutes: 30,
    starts_at: "2026-09-06T09:00:00.000Z",
    ends_at: "2026-09-06T11:00:00.000Z",
    is_published: true,
    results_published: false,
    results_version: 0,
    is_magnus_only: false,
    is_free: true,
    created_by: "admin-1",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockOfficialPage(input: {
  exam?: Exam;
  attempt?: { id: string; status: ExamAttemptStatus; expires_at: string } | null;
}) {
  const selectedExam = input.exam ?? exam();
  const from = jest.fn((table: string) => {
    if (table === "exams") {
      const single = jest.fn().mockResolvedValue({ data: selectedExam, error: null });
      const publishedEq = jest.fn().mockReturnValue({ single });
      const idEq = jest.fn().mockReturnValue({ eq: publishedEq });
      return { select: jest.fn().mockReturnValue({ eq: idEq }) };
    }
    if (table === "exam_attempts") {
      const maybeSingle = jest.fn().mockResolvedValue({ data: input.attempt ?? null, error: null });
      const modeEq = jest.fn().mockReturnValue({ maybeSingle });
      const userEq = jest.fn().mockReturnValue({ eq: modeEq });
      const examEq = jest.fn().mockReturnValue({ eq: userEq });
      return { select: jest.fn().mockReturnValue({ eq: examEq }) };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  jest.mocked(createClient).mockResolvedValue({ from } as never);
  jest.mocked(getMainUserContext).mockResolvedValue({
    user: { id: "student-1" },
    subscription: null,
  } as never);
}

function officialPage() {
  return TakeExamPage({
    params: Promise.resolve({ id: "exam-1" }),
    searchParams: Promise.resolve({}),
  });
}

describe("past exam practice page access", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([null, "plan_1"] as const)(
    "redirects a user with %s before loading the exam title",
    async (planType) => {
      jest.mocked(getMainUserContext).mockResolvedValue({
        user: { id: "student-1" },
        subscription: planType ? { plan_type: planType } : null,
      } as never);

      await expect(TakeExamPage({
        params: Promise.resolve({ id: "past-exam" }),
        searchParams: Promise.resolve({ practice: "true" }),
      })).rejects.toThrow("REDIRECT:/exams");

      expect(redirect).toHaveBeenCalledWith("/exams");
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});

describe("official exam page state", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it("redirects a finalized attempt directly to its response", async () => {
    mockOfficialPage({
      attempt: { id: "attempt-1", status: "finalized", expires_at: NOW },
    });

    await expect(officialPage()).rejects.toThrow(
      "REDIRECT:/exams/exam-1/results#my-response",
    );
  });

  it("keeps an ongoing attempt resumable at the inclusive grace boundary", async () => {
    mockOfficialPage({
      attempt: {
        id: "attempt-1",
        status: "active",
        expires_at: "2026-09-06T09:57:00.000Z",
      },
    });

    render(await officialPage());

    expect(screen.getByTestId("exam-start-gate")).toHaveAttribute("data-resumable", "true");
    expect(screen.queryByTestId("auto-finalizer")).not.toBeInTheDocument();
  });

  it("finalizes an ongoing attempt after the network grace closes", async () => {
    mockOfficialPage({
      attempt: {
        id: "attempt-1",
        status: "locked",
        expires_at: "2026-09-06T09:56:59.999Z",
      },
    });

    render(await officialPage());

    const finalizer = screen.getByTestId("auto-finalizer");
    expect(finalizer).toHaveAttribute("data-attempt-id", "attempt-1");
    expect(finalizer).toHaveAttribute("data-exam-id", "exam-1");
    expect(finalizer).toHaveAttribute("data-user-id", "student-1");
    expect(screen.queryByTestId("exam-start-gate")).not.toBeInTheDocument();
  });

  it("treats the exact global end as closed when no attempt exists", async () => {
    mockOfficialPage({
      exam: exam({ ends_at: NOW }),
      attempt: null,
    });

    await expect(officialPage()).rejects.toThrow("REDIRECT:/exams");
  });
});
