import { createAdminClient } from "@/lib/supabase/server";
import { sendExamPublishedEmails, sendPlanActivatedEmail, sendSlotsAddedEmail } from "./brevo";

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

  it("sends exam-start emails only to students with an active, unexpired eligible plan", async () => {
    const gt = jest.fn().mockResolvedValue({
      data: [
        { user_id: "eligible-student", profiles: { name: "Ayesha" } },
        { user_id: "eligible-student", profiles: { name: "Ayesha" } },
      ],
      error: null,
    });
    const inPlan = jest.fn().mockReturnValue({ gt });
    const active = jest.fn().mockReturnValue({ in: inPlan });
    const select = jest.fn().mockReturnValue({ eq: active });
    const listUsers = jest.fn().mockResolvedValue({
      data: {
        users: [
          { id: "eligible-student", email: "ayesha@example.com" },
          { id: "plan-one-student", email: "other@example.com" },
        ],
      },
      error: null,
    });
    jest.mocked(createAdminClient).mockResolvedValue({
      auth: { admin: { listUsers } },
      from: jest.fn().mockReturnValue({ select }),
    } as unknown as Awaited<ReturnType<typeof createAdminClient>>);

    await expect(sendExamPublishedEmails({
      id: "10000000-0000-4000-8000-000000000001",
      title: "Weekly Assessment 1",
      instructions: "Answer every question.",
      totalMarks: 25,
      deadline: "2026-09-20T12:30:00.000Z",
      durationMinutes: 90,
    })).resolves.toEqual({ recipients: 1, delivered: 1, failed: 0, skipped: false });

    expect(active).toHaveBeenCalledWith("is_active", true);
    expect(inPlan).toHaveBeenCalledWith("plan_type", ["plan_2", "plan_3"]);
    expect(gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      to: [{ email: "ayesha@example.com", name: "Ayesha" }],
      subject: "Exam started: Weekly Assessment 1",
    });
    expect(request.htmlContent).toContain("Total marks:</strong> 25");
    expect(request.htmlContent).toContain("Deadline:</strong>");
    expect(request.htmlContent).toContain("Duration:</strong> 1 hour 30 minutes");
    expect(request.htmlContent).not.toContain("Question 1");
  });
});
