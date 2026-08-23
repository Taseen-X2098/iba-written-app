/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import NotificationsPage from "./page";
import type { Notification } from "@/lib/types";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

const notifications: Notification[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    user_id: "20000000-0000-4000-8000-000000000002",
    exam_id: null,
    type: "subscription_expiring",
    title: "Your plan ends in 5 days",
    message: "Your writing history shows one clear next focus.",
    details: "What still needs work\nUse exact examples.\n\nYour next best step\nComplete one timed answer.",
    action_url: "/subscription",
    dedupe_key: "subscription-expiring:one",
    is_read: false,
    created_at: "2026-08-24T12:00:00.000Z",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    user_id: "20000000-0000-4000-8000-000000000002",
    exam_id: "40000000-0000-4000-8000-000000000004",
    type: "exam_reminder",
    title: "Exam reminder",
    message: "Your exam starts soon.",
    details: null,
    action_url: "/exams/40000000-0000-4000-8000-000000000004",
    dedupe_key: "exam-reminder:one",
    is_read: true,
    created_at: "2026-08-24T11:00:00.000Z",
  },
];

describe("NotificationsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const limit = jest.fn().mockResolvedValue({ data: notifications });
    const order = jest.fn().mockReturnValue({ limit });
    const readEq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq: readEq });
    const updateChain: { eq: jest.Mock } = { eq: jest.fn() };
    updateChain.eq.mockReturnValue(updateChain);
    const update = jest.fn().mockReturnValue(updateChain);
    jest.mocked(createClient).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "20000000-0000-4000-8000-000000000002" } },
        }),
      },
      from: jest.fn().mockReturnValue({ select, update }),
    } as unknown as ReturnType<typeof createClient>);
  });

  it("expands detailed personal feedback and keeps its action available", async () => {
    render(<NotificationsPage />);

    const reminder = await screen.findByRole("button", { name: /Your plan ends in 5 days/i });
    expect(screen.queryByText("Use exact examples.")).not.toBeInTheDocument();

    fireEvent.click(reminder);

    expect(await screen.findByText(/Use exact examples/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Continue my progress/i }));
    expect(mockPush).toHaveBeenCalledWith("/subscription");
  });

  it("opens a non-detailed notification's safe action URL", async () => {
    render(<NotificationsPage />);
    const examReminder = await screen.findByRole("button", { name: /Exam reminder/i });

    fireEvent.click(examReminder);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(
      "/exams/40000000-0000-4000-8000-000000000004",
    ));
  });
});
