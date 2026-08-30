import { sendExamResultsPublishedEmails } from "@/lib/email/brevo";
import { deliverPushNotification } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverResultPublicationNotifications } from "./result-publication";

jest.mock("@/lib/email/brevo", () => ({
  sendExamResultsPublishedEmails: jest.fn(),
}));
jest.mock("@/lib/notifications/push", () => ({
  deliverPushNotification: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

describe("result publication notification delivery", () => {
  it("loads the notification rows created by this results version and sends push plus email", async () => {
    const examId = "20000000-0000-4000-8000-000000000002";
    const notifications = [
      {
        id: "30000000-0000-4000-8000-000000000003",
        user_id: "10000000-0000-4000-8000-000000000001",
        exam_id: examId,
        type: "results_published",
        title: "Exam Results Published",
        message: "Your results are ready.",
        action_url: `/exams/${examId}/results`,
      },
      {
        id: "30000000-0000-4000-8000-000000000004",
        user_id: "10000000-0000-4000-8000-000000000005",
        exam_id: examId,
        type: "results_published",
        title: "Exam Results Published",
        message: "Your results are ready.",
        action_url: `/exams/${examId}/results`,
      },
    ];

    const range = jest.fn().mockResolvedValue({ data: notifications, error: null });
    const order = jest.fn().mockReturnValue({ range });
    const dedupeEq = jest.fn().mockReturnValue({ order });
    const examEq = jest.fn().mockReturnValue({ eq: dedupeEq });
    const notificationSelect = jest.fn().mockReturnValue({ eq: examEq });
    const single = jest.fn().mockResolvedValue({
      data: { id: examId, title: "Weekly Assessment 1" },
      error: null,
    });
    const idEq = jest.fn().mockReturnValue({ single });
    const examSelect = jest.fn().mockReturnValue({ eq: idEq });
    const from = jest.fn((table: string) => (
      table === "exams" ? { select: examSelect } : { select: notificationSelect }
    ));
    const admin = { from };
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    jest.mocked(deliverPushNotification)
      .mockResolvedValueOnce({
        tokens: 1,
        delivered: 1,
        failed: 0,
        transientFailures: 0,
        skipped: false,
      })
      .mockResolvedValueOnce({
        tokens: 0,
        delivered: 0,
        failed: 0,
        transientFailures: 0,
        skipped: false,
      });
    jest.mocked(sendExamResultsPublishedEmails).mockResolvedValue({
      recipients: 2,
      delivered: 2,
      failed: 0,
      skipped: false,
    });

    await expect(deliverResultPublicationNotifications({
      examId,
      resultsVersion: 3,
    })).resolves.toEqual({
      recipients: 2,
      push: {
        delivered: 1,
        failed: 0,
        transientFailures: 0,
        recipientsWithoutTokens: 1,
        skipped: 0,
      },
      email: { recipients: 2, delivered: 2, failed: 0, skipped: false },
      preparationFailed: false,
    });

    expect(examEq).toHaveBeenCalledWith("exam_id", examId);
    expect(dedupeEq).toHaveBeenCalledWith("dedupe_key", `exam-results:${examId}:v3`);
    expect(deliverPushNotification).toHaveBeenCalledTimes(2);
    expect(sendExamResultsPublishedEmails).toHaveBeenCalledWith(
      { id: examId, title: "Weekly Assessment 1" },
      ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000005"],
    );
  });
});
