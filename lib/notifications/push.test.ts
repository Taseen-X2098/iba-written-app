import { getAdminMessaging } from "@/lib/firebase-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPushNotification } from "./push";

jest.mock("@/lib/firebase-admin", () => ({ getAdminMessaging: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

describe("push notification delivery", () => {
  const sendEachForMulticast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAdminMessaging).mockReturnValue({ sendEachForMulticast } as never);
  });

  it("sends result pushes to the result page and removes only permanently invalid tokens", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { fcm_tokens: ["expired-token", "healthy-token"] },
      error: null,
    });
    const readEq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq: readEq });
    const writeEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: writeEq });
    const from = jest.fn().mockReturnValue({ select, update });
    const admin = { from };
    jest.mocked(createAdminClient).mockReturnValue(admin as never);

    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
        { success: true, messageId: "message-id" },
      ],
    });

    await expect(deliverPushNotification({
      id: "30000000-0000-4000-8000-000000000003",
      user_id: "10000000-0000-4000-8000-000000000001",
      exam_id: "20000000-0000-4000-8000-000000000002",
      type: "results_published",
      title: "Exam Results Published",
      message: "Your results are ready.",
    }, admin as never)).resolves.toEqual({
      tokens: 2,
      delivered: 1,
      failed: 1,
      transientFailures: 0,
      skipped: false,
      errorCodes: ["messaging/registration-token-not-registered"],
    });

    expect(sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        url: "/exams/20000000-0000-4000-8000-000000000002/results",
        tag: "notification:30000000-0000-4000-8000-000000000003",
      }),
      tokens: ["expired-token", "healthy-token"],
    }));
    expect(update).toHaveBeenCalledWith({ fcm_tokens: ["healthy-token"] });
    expect(writeEq).toHaveBeenCalledWith("id", "10000000-0000-4000-8000-000000000001");
  });

  it("reports transient failures without removing healthy tokens", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { fcm_tokens: ["healthy-token"] },
      error: null,
    });
    const select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ single }),
    });
    const update = jest.fn();
    const admin = { from: jest.fn().mockReturnValue({ select, update }) };
    sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [{
        success: false,
        error: { code: "messaging/internal-error" },
      }],
    });

    await expect(deliverPushNotification({
      user_id: "10000000-0000-4000-8000-000000000001",
      type: "practice_reminder",
      title: "Keep practicing",
      message: "Complete one answer.",
      action_url: "/questions",
    }, admin as never)).resolves.toMatchObject({
      failed: 1,
      transientFailures: 1,
      errorCodes: ["messaging/internal-error"],
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("reports Firebase credential failures with the provider error code", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { fcm_tokens: ["registered-token"] },
      error: null,
    });
    const admin = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ single }),
        }),
        update: jest.fn(),
      }),
    };
    sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [{
        success: false,
        error: { code: "app/invalid-credential" },
      }],
    });

    await expect(deliverPushNotification({
      user_id: "10000000-0000-4000-8000-000000000001",
      title: "Magnus approved",
      message: "Your Magnus status is approved.",
    }, admin as never)).resolves.toMatchObject({
      delivered: 0,
      transientFailures: 1,
      errorCodes: ["app/invalid-credential"],
    });
  });

  it("skips cleanly when Firebase server credentials are unavailable", async () => {
    jest.mocked(getAdminMessaging).mockReturnValue(null);
    const admin = { from: jest.fn() };

    await expect(deliverPushNotification({
      user_id: "10000000-0000-4000-8000-000000000001",
      title: "Notification",
      message: "Message",
    }, admin as never)).resolves.toEqual({
      tokens: 0,
      delivered: 0,
      failed: 0,
      transientFailures: 0,
      skipped: true,
    });
    expect(admin.from).not.toHaveBeenCalled();
  });
});
