"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Mail, RefreshCw, Search, Users } from "lucide-react";
import { approveMagnusStudents, retryMagnusWelcomeEmail } from "@/app/admin/users/actions";
import { UserActions } from "@/components/admin/user-actions";
import type { MagnusMembershipSource, MagnusMembershipStatus } from "@/lib/types";

export type AdminStudentRow = {
  id: string;
  name: string;
  email: string;
  institute: string;
  isAdmin: boolean;
  freeTestsRemaining: number;
  createdAt: string;
  activePlan: string | null;
  magnusStatus: MagnusMembershipStatus | null;
  magnusSource: MagnusMembershipSource | null;
  requestedAt: string | null;
  approvedAt: string | null;
  welcomeEmailStatus: "queued" | "sent" | "failed" | null;
  welcomeEmailError: string | null;
};

export function MagnusUserManagement({ users }: { users: AdminStudentRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const students = useMemo(() => users.filter((user) => !user.isAdmin), [users]);
  const pendingCandidates = useMemo(
    () => students.filter((user) => user.magnusStatus === "pending"),
    [students],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = useMemo(() => {
    const source = tab === "pending" ? pendingCandidates : students;
    if (!normalizedQuery) return source;
    return source.filter((user) => `${user.name} ${user.email} ${user.institute}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, pendingCandidates, students, tab]);

  const visiblePendingIds = visibleUsers
    .filter((user) => user.magnusStatus === "pending")
    .map((user) => user.id);
  const allVisibleSelected = visiblePendingIds.length > 0
    && visiblePendingIds.every((userId) => selected.has(userId));

  function toggleSelection(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visiblePendingIds.forEach((userId) => next.delete(userId));
      else visiblePendingIds.forEach((userId) => next.add(userId));
      return next;
    });
  }

  function approve(userIds: string[]) {
    setMessage(null);
    setBusyUserId(userIds.length === 1 ? userIds[0] : "bulk");
    startTransition(async () => {
      const result = await approveMagnusStudents(userIds);
      if (result.success) {
        const approved = result.newlyApproved.length;
        const already = result.alreadyApproved.length;
        setMessage({
          type: "success",
          text: `${approved} student${approved === 1 ? "" : "s"} approved${already ? `; ${already} already approved` : ""}.`,
        });
        setSelected(new Set());
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
      setBusyUserId(null);
    });
  }

  function retryEmail(userId: string) {
    setMessage(null);
    setBusyUserId(userId);
    startTransition(async () => {
      const result = await retryMagnusWelcomeEmail(userId);
      if (result.success) {
        setMessage({ type: "success", text: "Welcome email requeued." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
      setBusyUserId(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex rounded-lg bg-muted p-1">
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            Pending candidates ({pendingCandidates.length})
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All students ({students.length})
          </TabButton>
        </div>
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or institute"
            className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {tab === "pending" && (
          <button
            type="button"
            disabled={selected.size === 0 || isPending}
            onClick={() => approve([...selected])}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BadgeCheck size={17} /> Approve selected ({selected.size})
          </button>
        )}
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                {tab === "pending" && (
                  <th className="w-12 px-4 py-4">
                    <input aria-label="Select all visible candidates" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  </th>
                )}
                <th className="px-5 py-4 font-semibold">Student</th>
                <th className="px-5 py-4 font-semibold">Institute</th>
                <th className="px-5 py-4 font-semibold">Magnus status</th>
                <th className="px-5 py-4 font-semibold">Plan</th>
                <th className="px-5 py-4 font-semibold">Welcome email</th>
                <th className="px-5 py-4 text-right font-semibold">Joined</th>
                <th className="px-5 py-4 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30">
                  {tab === "pending" && (
                    <td className="px-4 py-4">
                      <input aria-label={`Select ${user.name}`} type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelection(user.id)} />
                    </td>
                  )}
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">{user.name || "Unnamed student"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{user.institute || "—"}</td>
                  <td className="px-5 py-4"><MagnusBadge status={user.magnusStatus} source={user.magnusSource} /></td>
                  <td className="px-5 py-4">
                    {user.activePlan ? <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{user.activePlan}</span> : <span className="text-xs text-muted-foreground">None</span>}
                  </td>
                  <td className="px-5 py-4"><EmailStatus user={user} retry={() => retryEmail(user.id)} busy={busyUserId === user.id || isPending} /></td>
                  <td className="px-5 py-4 text-right text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-2">
                      {user.magnusStatus !== "approved" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => approve([user.id])}
                          className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          <Check size={14} /> {busyUserId === user.id ? "Approving…" : "Approve Magnus"}
                        </button>
                      )}
                      {tab === "all" && <UserActions userId={user.id} userName={user.name} activePlan={user.activePlan} />}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 && (
                <tr><td colSpan={tab === "pending" ? 8 : 7} className="px-6 py-16 text-center text-muted-foreground"><Users className="mx-auto mb-3 opacity-30" size={38} />No matching students.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-sm font-semibold ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}

function MagnusBadge({ status, source }: { status: MagnusMembershipStatus | null; source: MagnusMembershipSource | null }) {
  if (status === "approved") return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700"><BadgeCheck size={13} /> Approved</span>;
  if (status === "pending") return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Pending{source === "promo" ? " · promo" : ""}</span>;
  return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Normal</span>;
}

function EmailStatus({ user, retry, busy }: { user: AdminStudentRow; retry: () => void; busy: boolean }) {
  if (!user.welcomeEmailStatus) return <span className="text-xs text-muted-foreground">Not applicable</span>;
  if (user.welcomeEmailStatus === "sent") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><Mail size={13} /> Sent</span>;
  if (user.welcomeEmailStatus === "queued") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><RefreshCw size={13} /> Queued</span>;
  return (
    <div>
      <span className="text-xs font-semibold text-red-700" title={user.welcomeEmailError ?? undefined}>Failed</span>
      <button type="button" onClick={retry} disabled={busy} className="ml-2 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">Requeue</button>
    </div>
  );
}
