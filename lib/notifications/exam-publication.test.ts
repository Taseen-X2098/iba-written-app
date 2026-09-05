import { sendExamPublishedEmails } from "@/lib/email/brevo";
import { deliverPushNotification } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverExamPublicationNotifications } from "./exam-publication";

jest.mock("@/lib/email/brevo", () => ({ sendExamPublishedEmails: jest.fn() }));
jest.mock("@/lib/notifications/push", () => ({ deliverPushNotification: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

describe("exam publication notifications", () => {
  it("loads the trigger-created rows and sends push together with email", async () => {
    const examId = "20000000-0000-4000-8000-000000000002";
    const notifications = [{
      id: "30000000-0000-4000-8000-000000000003",
      user_id: "10000000-0000-4000-8000-000000000001",
      exam_id: examId,
      type: "exam_available",
      title: "New weekly exam",
      message: "The exam is available.",
      action_url: `/exams/${examId}`,
    }];
    const range = jest.fn().mockResolvedValue({ data: notifications, error: null });
    const order = jest.fn().mockReturnValue({ range });
    const dedupeEq = jest.fn().mockReturnValue({ order });
    const examEq = jest.fn().mockReturnValue({ eq: dedupeEq });
    const select = jest.fn().mockReturnValue({ eq: examEq });
    const admin = { from: jest.fn().mockReturnValue({ select }) };
    jest.mocked(createAdminClient).mockReturnValue(admin as never);
    jest.mocked(deliverPushNotification).mockResolvedValue({
      tokens: 1,
      delivered: 1,
      failed: 0,
      transientFailures: 0,
      skipped: false,
    });
    jest.mocked(sendExamPublishedEmails).mockResolvedValue({
      recipients: 1,
      delivered: 1,
      failed: 0,
      skipped: false,
    });

    const exam = {
      id: examId,
      title: "Weekly Assessment",
      instructions: "Answer every question.",
      totalMarks: 30,
      deadline: "2026-09-06T12:00:00.000Z",
      durationMinutes: 90,
      isMagnusOnly: false,
    };
    await expect(deliverExamPublicationNotifications(exam)).resolves.toMatchObject({
      push: { delivered: 1 },
      email: { delivered: 1 },
      preparationFailed: false,
    });

    expect(dedupeEq).toHaveBeenCalledWith("dedupe_key", `exam-published:${examId}`);
    expect(deliverPushNotification).toHaveBeenCalledWith(notifications[0], admin);
    expect(sendExamPublishedEmails).toHaveBeenCalledWith(exam);
  });
});
