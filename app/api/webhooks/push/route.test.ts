import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminMessaging } from "@/lib/firebase-admin";
import { POST } from "./route";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminMessaging: {
    sendEachForMulticast: jest.fn(),
  },
}));

const WEBHOOK_URL = "http://localhost/api/webhooks/push";
const WEBHOOK_SECRET = "test-webhook-secret";
const mockedCreateClient = jest.mocked(createClient);
const mockedSendEachForMulticast = jest.mocked(adminMessaging.sendEachForMulticast);

function makeRequest(options?: { secret?: string; body?: string }) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options?.secret) headers.set("x-supabase-signature", options.secret);

  return new NextRequest(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: options?.body ?? "not-json",
  });
}

describe("push notification webhook authorization", () => {
  const originalWebhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterAll(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env.SUPABASE_WEBHOOK_SECRET;
    } else {
      process.env.SUPABASE_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it("fails closed when the server secret is not configured", async () => {
    delete process.env.SUPABASE_WEBHOOK_SECRET;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(makeRequest({ secret: WEBHOOK_SECRET }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Webhook is not configured" });
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedSendEachForMulticast).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects a missing secret before parsing the request body", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret before parsing the request body", async () => {
    const response = await POST(makeRequest({ secret: "wrong-secret" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("accepts the configured secret and processes a notification payload", async () => {
    const single = jest.fn().mockResolvedValue({ data: { fcm_tokens: [] } });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockedCreateClient.mockReturnValue(
      { from } as unknown as ReturnType<typeof createClient>,
    );

    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "notifications",
        record: {
          user_id: "10000000-0000-4000-8000-000000000001",
          title: "Test notification",
          message: "Webhook authorization works.",
        },
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(mockedSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends exam notifications with their exam start-page target", async () => {
    const single = jest.fn().mockResolvedValue({ data: { fcm_tokens: ["device-token"] } });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockedCreateClient.mockReturnValue(
      { from } as unknown as ReturnType<typeof createClient>,
    );
    mockedSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    const examId = "20000000-0000-4000-8000-000000000002";
    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "notifications",
        record: {
          user_id: "10000000-0000-4000-8000-000000000001",
          exam_id: examId,
          type: "exam_available",
          title: "New Weekly Exam!",
          message: "A new exam is available.",
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mockedSendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ url: `/exams/${examId}` }),
      tokens: ["device-token"],
    }));
    expect(mockedSendEachForMulticast).toHaveBeenCalledWith(expect.not.objectContaining({
      notification: expect.anything(),
    }));
  });

  it("reports transient FCM failures so the webhook delivery can be retried", async () => {
    const single = jest.fn().mockResolvedValue({ data: { fcm_tokens: ["device-token"] }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockedCreateClient.mockReturnValue(
      { from } as unknown as ReturnType<typeof createClient>,
    );
    mockedSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [{
        success: false,
        error: {
          code: "messaging/internal-error",
          message: "temporary",
          name: "FirebaseError",
          hasCode: (code: string) => code === "messaging/internal-error",
          toJSON: () => ({ code: "messaging/internal-error", message: "temporary" }),
        },
      }],
    });

    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "notifications",
        record: {
          id: "30000000-0000-4000-8000-000000000003",
          user_id: "10000000-0000-4000-8000-000000000001",
          type: "practice_reminder",
          title: "Keep your writing momentum",
          message: "Complete one focused practice answer.",
          action_url: "/questions",
        },
      }),
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "FCM temporarily failed",
      transientFailures: 1,
    });
  });

  it("removes only permanently invalid FCM tokens", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { fcm_tokens: ["expired-token", "healthy-token"] },
      error: null,
    });
    const readEq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq: readEq });
    const writeEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: writeEq });
    const from = jest.fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });
    mockedCreateClient.mockReturnValue(
      { from } as unknown as ReturnType<typeof createClient>,
    );
    mockedSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        {
          success: false,
          error: {
            code: "messaging/registration-token-not-registered",
            message: "expired",
            name: "FirebaseError",
            hasCode: (code: string) => code === "messaging/registration-token-not-registered",
            toJSON: () => ({
              code: "messaging/registration-token-not-registered",
              message: "expired",
            }),
          },
        },
        { success: true, messageId: "message-id" },
      ],
    });

    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        table: "notifications",
        record: {
          user_id: "10000000-0000-4000-8000-000000000001",
          type: "subscription_expiring",
          title: "Your plan ends soon",
          message: "Open your personal progress reminder.",
          action_url: "/notifications",
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ fcm_tokens: ["healthy-token"] });
    expect(writeEq).toHaveBeenCalledWith("id", "10000000-0000-4000-8000-000000000001");
  });

  it("rejects an authenticated webhook with an invalid notification record", async () => {
    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        table: "notifications",
        record: { user_id: "not-a-uuid", title: "", message: "message" },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "VALIDATION_ERROR",
    }));
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(mockedSendEachForMulticast).not.toHaveBeenCalled();
  });
});
