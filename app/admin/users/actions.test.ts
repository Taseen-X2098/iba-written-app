jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/brevo", () => ({
  sendPlanActivatedEmail: jest.fn(),
  sendSlotsAddedEmail: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/grading/jobs", () => ({ wakeGradingWorker: jest.fn() }));

import { createClient } from "@/lib/supabase/server";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { approveMagnusStudents } from "./actions";

const USER_1 = "40000000-0000-4000-8000-000000000001";

function signedInClient(options?: { admin?: boolean; rpcData?: unknown[] }) {
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
});
