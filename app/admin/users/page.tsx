import { Users as UsersIcon } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MagnusUserManagement,
  type AdminStudentRow,
} from "@/components/admin/magnus-user-management";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const profiles: Array<Record<string, any>> = [];
  const profilePageSize = 1_000;
  for (let offset = 0; ; offset += profilePageSize) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, name, institute, is_admin, free_tests_remaining, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + profilePageSize - 1);
    if (error) throw error;
    profiles.push(...(data ?? []));
    if ((data?.length ?? 0) < profilePageSize) break;
  }

  const authUsers = new Map<string, string>();
  const authPageSize = 1_000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: authPageSize });
    if (error) throw error;
    for (const user of data.users) authUsers.set(user.id, user.email ?? "");
    if (data.users.length < authPageSize) break;
  }

  const now = new Date().toISOString();
  const [{ data: subscriptions, error: subscriptionError }, { data: memberships, error: membershipError }, { data: emailJobs, error: jobError }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, plan_type, created_at")
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),
    admin
      .from("magnus_memberships")
      .select("user_id, status, source, requested_at, approved_at"),
    admin
      .from("retention_notification_jobs")
      .select("user_id, status, email_sent_at, push_sent_at, last_error, attempt_count, created_at")
      .eq("kind", "magnus_approved")
      .order("created_at", { ascending: false }),
  ]);
  if (subscriptionError) throw subscriptionError;
  if (membershipError) throw membershipError;
  if (jobError) throw jobError;

  const planByUser = new Map<string, string>();
  for (const subscription of subscriptions ?? []) {
    if (!planByUser.has(subscription.user_id)) {
      planByUser.set(subscription.user_id, subscription.plan_type);
    }
  }
  const membershipByUser = new Map((memberships ?? []).map((membership) => [membership.user_id, membership]));
  const jobByUser = new Map<string, NonNullable<typeof emailJobs>[number]>();
  for (const job of emailJobs ?? []) {
    if (!jobByUser.has(job.user_id)) jobByUser.set(job.user_id, job);
  }

  const users: AdminStudentRow[] = profiles.map((profile) => {
    const membership = membershipByUser.get(profile.id);
    const job = jobByUser.get(profile.id);
    const terminalDelivery = job?.status === "failed" || job?.status === "cancelled" || job?.status === "completed";
    const emailStatus = !membership || membership.status !== "approved"
      ? null
      : !job
        ? "failed"
        : job.email_sent_at
        ? "sent"
        : terminalDelivery
          ? "failed"
          : "queued";
    const pushStatus = !membership || membership.status !== "approved"
      ? null
      : !job
        ? "failed"
        : job.push_sent_at
          ? "sent"
          : terminalDelivery
            ? "failed"
            : "queued";
    return {
      id: profile.id,
      name: profile.name,
      email: authUsers.get(profile.id) || "Email unavailable",
      institute: profile.institute,
      isAdmin: profile.is_admin,
      freeTestsRemaining: profile.free_tests_remaining,
      createdAt: profile.created_at,
      activePlan: planByUser.get(profile.id) ?? null,
      magnusStatus: membership?.status ?? null,
      magnusSource: membership?.source ?? null,
      requestedAt: membership?.requested_at ?? null,
      approvedAt: membership?.approved_at ?? null,
      welcomeEmailStatus: emailStatus,
      welcomePushStatus: pushStatus,
      welcomeEmailError: job?.last_error ?? (membership?.status === "approved" && !job ? "Welcome email job is missing" : null),
    };
  });

  return (
    <div className="animate-fade-in mx-auto max-w-7xl pb-12">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-foreground">
          <UsersIcon className="text-brand-600" size={32} /> User Management
        </h1>
        <p className="mt-1 text-muted-foreground">
          Verify Magnus Academy students while preserving existing plan and slot controls.
        </p>
      </div>
      <MagnusUserManagement users={users} />
    </div>
  );
}
