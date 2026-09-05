/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { createClient } from "@/lib/supabase/server";
import { getMainUserContext } from "@/lib/main-user-context";
import DashboardPage from "./page";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/main-user-context", () => ({
  getMainUserContext: jest.fn(),
}));

jest.mock("@/components/dashboard/dashboard-client", () => ({
  __esModule: true,
  default: ({ tip }: { tip: { content: string } | null }) => (
    <div>{tip?.content ?? "No daily tip"}</div>
  ),
}));

describe("DashboardPage tips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the daily tip to a free user even when a legacy profile flag is disabled", async () => {
    const tip = {
      id: "10000000-0000-4000-8000-000000000001",
      content: "Outline the answer before you start writing.",
      is_active: true,
      created_at: "2026-09-05T10:00:00.000Z",
    };
    const rpc = jest.fn().mockResolvedValue({
      data: { evaluations: 0, submissions: [], tip },
      error: null,
    });

    jest.mocked(createClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createClient>>);
    jest.mocked(getMainUserContext).mockResolvedValue({
      user: { id: "free-user" },
      profile: {
        id: "free-user",
        name: "Free Student",
        institute: "IBA",
        phone: null,
        free_tests_remaining: 3,
        tips_enabled: false,
        is_admin: false,
        last_active_at: "2026-09-05T10:00:00.000Z",
        created_at: "2026-09-05T10:00:00.000Z",
        updated_at: "2026-09-05T10:00:00.000Z",
      },
      subscription: null,
      unreadCount: 0,
      magnusStatus: null,
    } as never);

    render(await DashboardPage());

    expect(screen.getByText("Outline the answer before you start writing.")).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("get_dashboard_data");
  });
});
