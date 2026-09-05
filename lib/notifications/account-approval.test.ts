import { sendPlanActivatedEmail } from "@/lib/email/brevo";
import { deliverPushNotification } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverAccountApprovalNotifications } from "./account-approval";

jest.mock("@/lib/email/brevo", () => ({ sendPlanActivatedEmail: jest.fn() }));
jest.mock("@/lib/notifications/push", () => ({ deliverPushNotification: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

describe("account approval notifications", () => {
  it("creates one durable notification and sends both push and email", async () => {
    const notification = {
      id: "30000000-0000-4000-8000-000000000003",
      user_id: "10000000-0000-4000-8000-000000000001",
      exam_id: null,
      type: "account_approved",
      title: "Your plan is active",
      message: "Your Complete Plan has been approved and activated. You can start using it now.",
      action_url: "/subscription",
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: notification, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const upsert = jest.fn().mockReturnValue({ select });
    const admin = { from: jest.fn().mockReturnValue({ upsert }) };
    jest.mocked(createAdminClient).mockReturnValue(admin as never);
    jest.mocked(deliverPushNotification).mockResolvedValue({
      tokens: 1,
      delivered: 1,
      failed: 0,
      transientFailures: 0,
      skipped: false,
    });
    jest.mocked(sendPlanActivatedEmail).mockResolvedValue({ delivered: true, skipped: false });

    await expect(deliverAccountApprovalNotifications({
      userId: notification.user_id,
      planType: "plan_2",
      expiresAt: "2026-10-05T00:00:00.000Z",
      subscriptionId: "20000000-0000-4000-8000-000000000002",
    })).resolves.toMatchObject({
      push: { delivered: 1 },
      email: { delivered: true },
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      type: "account_approved",
      dedupe_key: "account-approved:20000000-0000-4000-8000-000000000002",
    }), expect.objectContaining({ ignoreDuplicates: true }));
    expect(deliverPushNotification).toHaveBeenCalledWith(notification, admin);
    expect(sendPlanActivatedEmail).toHaveBeenCalledTimes(1);
  });
});
