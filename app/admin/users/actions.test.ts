jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/brevo", () => ({
  sendSlotsAddedEmail: jest.fn(),
}));
jest.mock("@/lib/notifications/account-approval", () => ({
  deliverAccountApprovalNotifications: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/grading/jobs", () => ({ wakeGradingWorker: jest.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { deliverAccountApprovalNotifications } from "@/lib/notifications/account-approval";
import {
  adminActivateSubscription,
  approveMagnusStudents,
  disableMagnusStudent,
  reenableMagnusStudent,
} from "./actions";

const USER_1 = "40000000-0000-4000-8000-000000000001";

function signedInClient(options?: { admin?: boolean; rpcData?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({
    data: options?.rpcData ?? [{ approved_user_id: USER_1, notification_queued: true }],
    error: null,
  });
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "admin-id" } } }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { is_admin: options?.admin ?? true } }) })),
      })),
    })),
    rpc,
  };
}

describe("Magnus admin approval action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(wakeGradingWorker).mockResolvedValue(true);
  });

  it("deduplicates UUIDs before the atomic approval RPC", async () => {
    const client = signedInClient();
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
    await expect(approveMagnusStudents([USER_1, USER_1])).resolves.toEqual({
      success: true,
      newlyApproved: [USER_1],
      alreadyApproved: [],
    });
    expect(client.rpc).toHaveBeenCalledWith("approve_magnus_students", {
      p_user_ids: [USER_1],
    });
    expect(wakeGradingWorker).toHaveBeenCalledTimes(1);
  });

  it("does not wake the email worker when every selected student was already approved", async () => {
    const client = signedInClient({ rpcData: [] });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(approveMagnusStudents([USER_1])).resolves.toEqual({
      success: true,
      newlyApproved: [],
      alreadyApproved: [USER_1],
    });
    expect(wakeGradingWorker).not.toHaveBeenCalled();
  });

  it("rejects a non-admin before calling the approval RPC", async () => {
    const client = signedInClient({ admin: false });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
    const result = await approveMagnusStudents([USER_1]);
    expect(result).toEqual({ success: false, error: "Forbidden: Admin access required" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("lets an admin disable an approved Magnus status", async () => {
    const client = signedInClient({ rpcData: true });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(disableMagnusStudent(USER_1)).resolves.toEqual({ success: true });
    expect(client.rpc).toHaveBeenCalledWith("disable_magnus_student", {
      p_user_id: USER_1,
    });
    expect(wakeGradingWorker).not.toHaveBeenCalled();
  });

  it("reports when the selected student is not currently Magnus-approved", async () => {
    const client = signedInClient({ rpcData: false });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(disableMagnusStudent(USER_1)).resolves.toEqual({
      success: false,
      error: "Student does not have an approved Magnus status",
    });
  });

  it("re-enables Magnus through the status-only RPC", async () => {
    const client = signedInClient({ rpcData: true });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(reenableMagnusStudent(USER_1)).resolves.toEqual({ success: true });
    expect(client.rpc).toHaveBeenCalledWith("reenable_magnus_student", {
      p_user_id: USER_1,
    });
    expect(wakeGradingWorker).toHaveBeenCalledTimes(1);
  });

  it("surfaces the database error when Magnus re-enable fails", async () => {
    const client = signedInClient();
    client.rpc.mockResolvedValue({
      data: null,
      error: { message: "Magnus re-enable database failure" },
    });
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(reenableMagnusStudent(USER_1)).resolves.toEqual({
      success: false,
      error: "Magnus re-enable database failure",
    });
  });

  it("uses the atomic transition RPC when an admin switches a plan", async () => {
    const client = signedInClient();
    jest.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        activated_subscription_id: "60000000-0000-4000-8000-000000000001",
        activated_expires_at: "2026-10-06T00:00:00.000Z",
        activated_plan_type: "plan_3",
      }],
      error: null,
    });
    jest.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    jest.mocked(deliverAccountApprovalNotifications).mockResolvedValue({} as never);

    await expect(adminActivateSubscription(USER_1, "plan_3")).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("activate_subscription_plan", {
      p_user_id: USER_1,
      p_plan_type: "plan_3",
      p_transition: "replace",
      p_expected_subscription_id: null,
    });
    expect(deliverAccountApprovalNotifications).toHaveBeenCalledWith({
      userId: USER_1,
      planType: "plan_3",
      expiresAt: "2026-10-06T00:00:00.000Z",
      subscriptionId: "60000000-0000-4000-8000-000000000001",
    });
  });
});
