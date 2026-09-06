/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
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

    const pastSection = screen.getByText("Published Assessment").closest("div.rounded-2xl");
    expect(pastSection?.querySelector('a[href="/exams/past-exam/results"]')).not.toBeNull();
  });
});
