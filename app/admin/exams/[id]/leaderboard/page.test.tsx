/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import AdminExamLeaderboardPage from "./page";

jest.mock("@/lib/auth", () => ({ requireAdminUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

describe("admin exam leaderboard pagination", () => {
  it("loads only the requested page while keeping global summary values", async () => {
    jest.mocked(requireAdminUser).mockResolvedValue({ id: "admin-1" } as never);

    const examMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: "exam-1", title: "Large exam", results_published: true },
      error: null,
    });
    const examEq = jest.fn().mockReturnValue({ maybeSingle: examMaybeSingle });
    const examSelect = jest.fn().mockReturnValue({ eq: examEq });

    const range = jest.fn().mockResolvedValue({
      data: [{
        user_id: "student-101",
        total_score: 73,
        max_score: 100,
        rank: 101,
        profiles: { name: "Page Two Student", institute: "IBA" },
      }],
      error: null,
      count: 205,
    });
    const userOrder = jest.fn().mockReturnValue({ range });
    const rankOrder = jest.fn().mockReturnValue({ order: userOrder });
    const pageEq = jest.fn().mockReturnValue({ order: rankOrder });
    const pageSelect = jest.fn().mockReturnValue({ eq: pageEq });

    const topMaybeSingle = jest.fn().mockResolvedValue({
      data: { total_score: 98 },
      error: null,
    });
    const topLimit = jest.fn().mockReturnValue({ maybeSingle: topMaybeSingle });
    const topOrder = jest.fn().mockReturnValue({ limit: topLimit });
    const topEq = jest.fn().mockReturnValue({ order: topOrder });
    const topSelect = jest.fn().mockReturnValue({ eq: topEq });

    let resultQuery = 0;
    const from = jest.fn((table: string) => {
      if (table === "exams") return { select: examSelect };
      if (table === "exam_results") {
        resultQuery += 1;
        return { select: resultQuery === 1 ? pageSelect : topSelect };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    jest.mocked(createAdminClient).mockResolvedValue({ from } as never);

    render(await AdminExamLeaderboardPage({
      params: Promise.resolve({ id: "exam-1" }),
      searchParams: Promise.resolve({ page: "2" }),
    }));

    expect(range).toHaveBeenCalledWith(100, 199);
    expect(screen.getByText("205")).toBeVisible();
    expect(screen.getByText("98")).toBeVisible();
    expect(screen.getByText("Page Two Student")).toBeVisible();
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/admin/exams/exam-1/leaderboard?page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/exams/exam-1/leaderboard?page=3",
    );
  });
});
