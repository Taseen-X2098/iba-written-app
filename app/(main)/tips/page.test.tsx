/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { createClient } from "@/lib/supabase/server";
import TipsPage from "./page";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

function mockTipsQuery(data: unknown[], error: unknown = null) {
  const order = jest.fn().mockResolvedValue({ data, error });
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  jest.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { from, select, eq, order };
}

describe("TipsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders every active tip without a subscription-tier check", async () => {
    const query = mockTipsQuery([
      {
        id: "10000000-0000-4000-8000-000000000001",
        content: "Start each paragraph with one clear controlling idea.",
        is_active: true,
        created_at: "2026-09-05T10:00:00.000Z",
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        content: "Reserve a few minutes to proofread your answer.",
        is_active: true,
        created_at: "2026-09-04T10:00:00.000Z",
      },
    ]);

    render(await TipsPage());

    expect(screen.getByText("Start each paragraph with one clear controlling idea.")).toBeVisible();
    expect(screen.getByText("Reserve a few minutes to proofread your answer.")).toBeVisible();
    expect(query.from).toHaveBeenCalledWith("tips");
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("shows a useful empty state when no active tips exist", async () => {
    mockTipsQuery([]);

    render(await TipsPage());

    expect(screen.getByText("No tips are available yet. Please check back soon.")).toBeVisible();
  });
});
