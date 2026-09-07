/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { createClient } from "@/lib/supabase/server";
import { getMainUserContext } from "@/lib/main-user-context";
import StudentExamsPage from "./page";
import type { Exam } from "@/lib/types";

jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/main-user-context", () => ({ getMainUserContext: jest.fn() }));

const NOW = "2026-09-06T10:00:00.000Z";

function exam(overrides: Partial<Exam> & Pick<Exam, "id" | "title">): Exam {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    description: null,
    time_limit_minutes: 30,
    starts_at: "2026-09-06T09:00:00.000Z",
    ends_at: "2026-09-06T11:00:00.000Z",
    is_published: true,
    results_published: false,
    results_version: 0,
    is_magnus_only: false,
    is_free: false,
    created_by: "admin-1",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...rest,
  };
}

type AttemptSummary = {
  id: string;
  exam_id: string;
  status: "active" | "locked" | "finalized";
  expires_at: string;
};

function mockStudentPage(
  exams: Exam[],
  attempts: AttemptSummary[] = [],
  planType: "plan_1" | "plan_2" | "plan_3" | null = null,
) {
  const from = jest.fn((table: string) => {
    if (table === "exams") {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn().mockResolvedValue({ data: exams, error: null }),
          })),
        })),
      };
    }
    if (table === "exam_attempts") {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ data: attempts, error: null }),
          })),
        })),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  jest.mocked(createClient).mockResolvedValue({ from } as never);
  jest.mocked(getMainUserContext).mockResolvedValue({
    user: { id: "free-user" },
    subscription: planType ? { plan_type: planType } : null,
  } as never);
}

describe("student free exam access", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it("unlocks free exams and published results without unlocking paid exams", async () => {
    const exams = [
      exam({ id: "free-exam", title: "Open Assessment", is_free: true }),
      exam({ id: "paid-exam", title: "Subscriber Assessment" }),
      exam({
        id: "past-exam",
        title: "Published Assessment",
        starts_at: "2026-09-05T09:00:00.000Z",
        ends_at: "2026-09-05T11:00:00.000Z",
        results_published: true,
      }),
    ];

    const from = jest.fn((table: string) => {
      if (table === "exams") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn().mockResolvedValue({ data: exams, error: null }),
            })),
          })),
        };
      }
      if (table === "exam_attempts") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    jest.mocked(createClient).mockResolvedValue({ from } as never);
    jest.mocked(getMainUserContext).mockResolvedValue({
      user: { id: "free-user" },
      subscription: null,
    } as never);

    render(await StudentExamsPage());

    expect(screen.getByText("Paid Exams Locked")).toBeVisible();
    expect(screen.getByText("Open Assessment")).toBeVisible();
    expect(screen.getByText("Free")).toBeVisible();
    expect(screen.getByRole("link", { name: /Enter Exam/ })).toHaveAttribute(
      "href",
      "/exams/free-exam",
    );
    expect(screen.getByText("Subscriber Assessment")).toBeVisible();
    expect(screen.getByText("Locked").closest("a")).toHaveAttribute("href", "#");
    const pastExamLock = screen.getByRole("region", { name: "Past exam practice is locked" });
    expect(within(pastExamLock).getByText(/Complete Prep/)).toBeVisible();
    expect(within(pastExamLock).getByText(/Exams Only/)).toBeVisible();
    expect(within(pastExamLock).getByRole("link", { name: /View Plans/ })).toHaveAttribute("href", "/subscription");
    expect(screen.queryByText("Published Assessment")).not.toBeInTheDocument();
    expect(screen.queryByText(/View Past Exams/)).not.toBeInTheDocument();
  });

  it("uses a half-open live window and moves an exam to past at its exact end", async () => {
    mockStudentPage([
      exam({
        id: "just-ended",
        title: "Just Ended Free Exam",
        is_free: true,
        ends_at: NOW,
      }),
    ]);

    render(await StudentExamsPage());

    expect(screen.queryByText("Live Now")).not.toBeInTheDocument();
    expect(screen.getByText("No weekly exams are currently scheduled.")).toBeVisible();
    expect(screen.getByText("View Past Exams (1)")).toBeVisible();
    fireEvent.click(screen.getByText("View Past Exams (1)"));
    expect(screen.getByText("Just Ended Free Exam")).toBeVisible();
  });

  it("shows past free exams and owned responses without unlocking paid practice", async () => {
    const pastWindow = {
      starts_at: "2026-09-05T09:00:00.000Z",
      ends_at: "2026-09-05T11:00:00.000Z",
      results_published: true,
    };
    mockStudentPage(
      [
        exam({ id: "past-free", title: "Past Free Exam", is_free: true, ...pastWindow }),
        exam({ id: "past-owned", title: "My Previous Paid Exam", ...pastWindow }),
        exam({ id: "past-other", title: "Unowned Paid Exam", ...pastWindow }),
      ],
      [{
        id: "attempt-owned",
        exam_id: "past-owned",
        status: "finalized",
        expires_at: "2026-09-05T10:00:00.000Z",
      }],
    );

    render(await StudentExamsPage());
    fireEvent.click(screen.getByText("View Past Exams (2)"));

    expect(screen.getByText("Past Free Exam")).toBeVisible();
    expect(screen.getByText("My Previous Paid Exam")).toBeVisible();
    expect(screen.queryByText("Unowned Paid Exam")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My Response & Results/i })).toHaveAttribute(
      "href",
      "/exams/past-owned/results#my-response",
    );
    expect(screen.queryByRole("link", { name: /Practice Exam/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Practice requires subscription/i)).toHaveLength(2);
  });

  it("keeps an owned unfinished past attempt available for finalization", async () => {
    mockStudentPage(
      [exam({
        id: "past-owned",
        title: "Unfinished Exam",
        starts_at: "2026-09-05T09:00:00.000Z",
        ends_at: "2026-09-05T11:00:00.000Z",
      })],
      [{
        id: "attempt-active",
        exam_id: "past-owned",
        status: "active",
        expires_at: "2026-09-05T11:00:00.000Z",
      }],
    );

    render(await StudentExamsPage());
    fireEvent.click(screen.getByText("View Past Exams (1)"));

    expect(screen.getByRole("link", { name: /Finalize Exam/i })).toHaveAttribute(
      "href",
      "/exams/past-owned",
    );
  });
});
