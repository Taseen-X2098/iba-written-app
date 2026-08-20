import { createAdminClient } from "@/lib/supabase/server";
import { sendPlanActivatedEmail, sendSlotsAddedEmail } from "./brevo";

jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

const originalEnv = { ...process.env };

describe("Brevo account-update emails", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    process.env = {
      ...originalEnv,
      BREVO_API_KEY: "test-api-key",
      BREVO_SENDER_EMAIL: "hello@example.com",
      BREVO_SENDER_NAME: "IBA Written",
      NEXT_PUBLIC_SITE_URL: "https://example.com",
    };
    Object.assign(globalThis, { fetch: fetchMock });
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));

    jest.mocked(createAdminClient).mockResolvedValue({
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: "student@example.com", user_metadata: {} } },
            error: null,
          }),
        },
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: { name: "Ayesha" } }),
          })),
        })),
      })),
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("sends the branded plan activation email through Brevo", async () => {
    await expect(sendPlanActivatedEmail("student-id", "plan_2", "2026-09-20T00:00:00.000Z"))
      .resolves.toEqual({ delivered: true, skipped: false });

    expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "api-key": "test-api-key" }),
    }));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      sender: { email: "hello@example.com", name: "IBA Written" },
      to: [{ email: "student@example.com", name: "Ayesha" }],
      subject: "Your Complete Plan is now active",
    });
    expect(request.htmlContent).toContain("Your plan is active");
    expect(request.htmlContent).toContain("https://example.com/subscription");
  });

  it("sends a slot email with the correct pluralization", async () => {
    await sendSlotsAddedEmail("student-id", 1, "free");

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.subject).toBe("1 free practice test added to your account");
    expect(request.htmlContent).toContain("1 free practice test</strong> has been added");
    expect(request.htmlContent).toContain("https://example.com/test");
  });
});
