import { NextRequest } from "next/server";
import { deliverPushNotification } from "@/lib/notifications/push";
import { POST } from "./route";

jest.mock("@/lib/notifications/push", () => ({
  deliverPushNotification: jest.fn(),
}));

const WEBHOOK_URL = "http://localhost/api/webhooks/push";
const WEBHOOK_SECRET = "test-webhook-secret";
const mockedDeliverPush = jest.mocked(deliverPushNotification);

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
    mockedDeliverPush.mockResolvedValue({
      tokens: 0,
      delivered: 0,
      failed: 0,
      transientFailures: 0,
      skipped: false,
    });
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
    expect(mockedDeliverPush).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects a missing secret before parsing the request body", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedDeliverPush).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret before parsing the request body", async () => {
    const response = await POST(makeRequest({ secret: "wrong-secret" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockedDeliverPush).not.toHaveBeenCalled();
  });

  it("accepts the configured secret and delivers a notification payload", async () => {
    const record = {
      id: "30000000-0000-4000-8000-000000000003",
      user_id: "10000000-0000-4000-8000-000000000001",
      exam_id: "20000000-0000-4000-8000-000000000002",
      type: "exam_available",
      title: "New Weekly Exam!",
      message: "A new exam is available.",
      action_url: "/exams/20000000-0000-4000-8000-000000000002",
    };
    mockedDeliverPush.mockResolvedValue({
      tokens: 1,
      delivered: 1,
      failed: 0,
      transientFailures: 0,
      skipped: false,
    });

    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "notifications",
        record,
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockedDeliverPush).toHaveBeenCalledWith(record);
  });

  it("delegates result pushes to the result-publication route to prevent duplicates", async () => {
    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "notifications",
        record: {
          id: "30000000-0000-4000-8000-000000000003",
          user_id: "10000000-0000-4000-8000-000000000001",
          exam_id: "20000000-0000-4000-8000-000000000002",
          type: "results_published",
          title: "Exam Results Published",
          message: "Your results are ready.",
        },
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, delegated: true });
    expect(mockedDeliverPush).not.toHaveBeenCalled();
  });

  it("reports transient FCM failures so the webhook delivery can be retried", async () => {
    mockedDeliverPush.mockResolvedValue({
      tokens: 1,
      delivered: 0,
      failed: 1,
      transientFailures: 1,
      skipped: false,
    });

    const response = await POST(makeRequest({
      secret: WEBHOOK_SECRET,
      body: JSON.stringify({
        type: "INSERT",
        table: "notifications",
        record: {
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
    expect(mockedDeliverPush).not.toHaveBeenCalled();
  });
});
