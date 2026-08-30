import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendExamPublishedEmails,
  sendExamResultsPublishedEmails,
  sendMagnusApprovedEmail,
  sendPlanActivatedEmail,
  sendSlotsAddedEmail,
  sendSubscriptionRetentionEmail,
} from "./brevo";

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

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

    jest.mocked(createAdminClient).mockReturnValue({
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
    } as unknown as ReturnType<typeof createAdminClient>);
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

  it("filters Magnus exam publication email to approved members", async () => {
    const listUsers = jest.fn().mockResolvedValue({
      data: {
        users: [
          { id: "approved", email: "approved@example.com" },
          { id: "pending", email: "pending@example.com" },
        ],
      },
      error: null,
    });
    const from = jest.fn((table: string) => {
      if (table === "subscriptions") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn(() => ({
                gt: jest.fn().mockResolvedValue({
                  data: [
                    { user_id: "approved", profiles: { name: "Approved" } },
                    { user_id: "pending", profiles: { name: "Pending" } },
                  ],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            in: jest.fn().mockResolvedValue({ data: [{ user_id: "approved" }], error: null }),
          })),
        })),
      };
    });
    jest.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { listUsers } },
      from,
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(sendExamPublishedEmails({
      id: "10000000-0000-4000-8000-000000000002",
      title: "Magnus Standard Exam",
      instructions: "Answer every question.",
      totalMarks: 30,
      deadline: "2026-09-20T12:30:00.000Z",
      durationMinutes: 90,
      isMagnusOnly: true,
    })).resolves.toEqual({ recipients: 1, delivered: 1, failed: 0, skipped: false });

    expect(from).toHaveBeenCalledWith("magnus_memberships");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual([
      { email: "approved@example.com", name: "Approved" },
    ]);
  });

  it("sends escaped, personalized subscription-retention content", async () => {
    await expect(sendSubscriptionRetentionEmail("student-id", {
      subject: "Your progress is waiting",
      title: "Your personal plan",
      message: "Ayesha, your plan ended five days ago.",
      details: "What still needs work\nUse <clear> topic sentences.\n\nYour next step\nComplete one timed answer.",
    })).resolves.toEqual({ delivered: true, skipped: false });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.subject).toBe("Your progress is waiting");
    expect(request.htmlContent).toContain("What still needs work<br>Use &lt;clear&gt; topic sentences.");
    expect(request.htmlContent).toContain("Continue my progress");
    expect(request.htmlContent).toContain("https://example.com/subscription");
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
    jest.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { listUsers } },
      from: jest.fn().mockReturnValue({ select }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(sendExamPublishedEmails({
      id: "10000000-0000-4000-8000-000000000001",
      title: "Weekly Assessment 1",
      instructions: "Answer every question.",
      totalMarks: 25,
      deadline: "2026-09-20T12:30:00.000Z",
      durationMinutes: 90,
      isMagnusOnly: false,
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

  it("emails published results only to the participating users supplied by publication", async () => {
    const inIds = jest.fn().mockResolvedValue({
      data: [
        { id: "participant", name: "Ayesha" },
        { id: "participant-without-email", name: "Nadia" },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ in: inIds });
    const listUsers = jest.fn().mockResolvedValue({
      data: {
        users: [
          { id: "participant", email: "ayesha@example.com", user_metadata: {} },
          { id: "participant-without-email", email: null, user_metadata: {} },
          { id: "not-a-participant", email: "outsider@example.com", user_metadata: {} },
        ],
      },
      error: null,
    });
    jest.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { listUsers } },
      from: jest.fn().mockReturnValue({ select }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(sendExamResultsPublishedEmails({
      id: "10000000-0000-4000-8000-000000000001",
      title: "Weekly Assessment 1",
    }, ["participant", "participant-without-email"]))
      .resolves.toEqual({ recipients: 1, delivered: 1, failed: 0, skipped: false });

    expect(inIds).toHaveBeenCalledWith("id", ["participant", "participant-without-email"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      to: [{ email: "ayesha@example.com", name: "Ayesha" }],
      subject: "Results published: Weekly Assessment 1",
    });
    expect(request.htmlContent).toContain("Your exam results are ready");
    expect(request.htmlContent).toContain("https://example.com/exams/10000000-0000-4000-8000-000000000001/results");
    expect(request.htmlContent).not.toContain("outsider@example.com");
  });

  it("sends the supplied Magnus welcome copy without a CTA", async () => {
    await expect(sendMagnusApprovedEmail("student-id"))
      .resolves.toEqual({ delivered: true, skipped: false });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.subject).toBe("Welcome to IBA Written");
    expect(request.htmlContent).toContain("Welcome to IBA Written,");
    expect(request.htmlContent).toContain("You have been approved as magnus student with our Full Preparation plan. For Magnus students specifically, we have prepared 3 IBA Standard Written Exams each month in addition to 600+ written questions, 300 graded written tests for practice and 4 IBA Standard Weekly Exams. We hope to provide you with practice tests, feedback and overall guidance to help you develop the skills and aptitude to ace the written part in main exam.");
    expect(request.htmlContent).toContain("Regards,<br>IBA Written");
    expect(request.htmlContent).not.toContain('href="https://example.com');
  });
});
