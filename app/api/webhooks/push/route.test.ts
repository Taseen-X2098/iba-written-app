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
          user_id: "10000000-0000-0000-0000-000000000001",
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
});
