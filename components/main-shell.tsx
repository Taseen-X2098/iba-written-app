"use client";

import React, { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  BookOpen,
  Trophy,
  BarChart3,
  Menu,
  X,
  Crown,
  Bell,
  LogOut,
  Settings,
  Lightbulb,
  ChevronRight,
  ExternalLink,
  Lock,
  TrendingUp,
} from "lucide-react";
import type { MagnusMembershipStatus, Profile, Subscription } from "@/lib/types";
import { messaging } from "@/lib/firebase";
import { getToken, onMessage } from "firebase/messaging";
import { getUsageInfo, type UsageInfo } from "@/lib/utils/subscription";
import { USAGE_BALANCE_UPDATED_EVENT } from "@/lib/usage/balance-client";
import { registerAppServiceWorker } from "@/lib/pwa";
import { NavigationLoadingOverlay } from "@/components/ui/navigation-loading-overlay";
import { ActiveSessionSidenavLinks } from "@/components/navigation/active-session-links";
import {
  clearStandaloneSessions,
  STANDALONE_SESSION_UPDATED_EVENT,
} from "@/lib/exams/standalone-session";
import {
  IN_PROGRESS_EXAM_UPDATED_EVENT,
  clearExamBrowserStateOnSignOut,
  removeInProgressExam,
} from "@/lib/exams/in-progress-exam";
import {
  isActiveSessionStorageKey,
  listActiveSessionLinks,
  type ActiveSessionLink,
} from "@/lib/exams/active-sessions";

// ─── Tab Configuration ────────────────────────────────────────────────────

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/questions", label: "Practice", icon: BookOpen },
  { href: "/exams", label: "Exams", icon: Trophy },
  { href: "/progress", label: "Progress", icon: BarChart3 },
] as const;

// ─── Sidenav Links ─────────────────────────────────────────────────────────

const SIDENAV_LINKS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/questions", label: "Question Bank", icon: BookOpen },
  { href: "/exams", label: "Weekly Exams", icon: Trophy },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/personal-report", label: "Personal Report", icon: TrendingUp },
  { href: "/history", label: "History", icon: BookOpen },
  { href: "/subscription", label: "Subscription", icon: Crown },
  { href: "/tips", label: "Tips", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default function MainShell({
  children,
  initialProfile,
  initialSubscription,
  initialUnreadCount,
  initialMagnusStatus,
}: {
  children: React.ReactNode;
  initialProfile: Profile;
  initialSubscription: Subscription | null;
  initialUnreadCount: number;
  initialMagnusStatus: MagnusMembershipStatus | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidenavOpen, setSidenavOpen] = useState(false);
  const profile = initialProfile;
  const [usageBalance, setUsageBalance] = useState<{
    profile: Pick<Profile, "free_tests_remaining">;
    subscription: Subscription | null;
  } | null>(null);
  const isApprovedMagnusStudent = initialMagnusStatus === "approved";
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const [activeSessions, setActiveSessions] = useState<ActiveSessionLink[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadCount(data.count ?? 0);
    } catch {
      // Keep the last known count while offline.
    }
  }, []);

  const loadUsageBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/usage-balance", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setUsageBalance({
        profile: data.profile,
        subscription: data.subscription ?? null,
      });
    } catch {
      // Keep the last confirmed balance while offline.
    }
  }, []);

  useEffect(() => {
    const refreshUsage = () => void loadUsageBalance();
    window.addEventListener(USAGE_BALANCE_UPDATED_EVENT, refreshUsage);
    window.addEventListener("focus", refreshUsage);
    return () => {
      window.removeEventListener(USAGE_BALANCE_UPDATED_EVENT, refreshUsage);
      window.removeEventListener("focus", refreshUsage);
    };
  }, [loadUsageBalance]);

  useEffect(() => {
    let disposed = false;
    const refreshNotifications = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    // Refresh on focus and at most every five minutes while visible.
    const interval = setInterval(refreshNotifications, 300000);
    window.addEventListener("focus", refreshNotifications);
    
    // Keep every active test and exam visible. Session metadata is stored per
    // question/attempt so opening another session cannot replace this list.
    const reconcileFinishedPracticeGrading = async (sessions: ActiveSessionLink[]) => {
      const gradingSessions = sessions.filter((session) => session.phase === "grading" && session.gradingJobId);
      if (!gradingSessions.length) return;
      const statuses = await Promise.all(gradingSessions.map(async (session) => {
        try {
          const response = await fetch(`/api/grading-jobs/${session.gradingJobId}`, { cache: "no-store" });
          if (!response.ok) return null;
          const data = await response.json();
          return { session, status: String(data.job?.status ?? "") };
        } catch {
          return null;
        }
      }));
      let changed = false;
      for (const result of statuses) {
        if (result && ["completed", "cancelled"].includes(result.status)) {
          removeInProgressExam(localStorage, { attemptId: result.session.key.slice("exam:".length) });
          changed = true;
        }
      }
      if (changed && !disposed) {
        setActiveSessions(listActiveSessionLinks(localStorage, profile.id));
        void loadUsageBalance();
      }
    };

    const checkTimer = () => {
      try {
        const sessions = listActiveSessionLinks(localStorage, profile.id);
        setActiveSessions(sessions);
        void reconcileFinishedPracticeGrading(sessions);
      } catch {
        setActiveSessions([]);
      }
    };
    
    checkTimer();
    const timerCheckpoint = setInterval(checkTimer, 15_000);
    const handleStorage = (e: StorageEvent) => {
      if (isActiveSessionStorageKey(e.key)) checkTimer();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(STANDALONE_SESSION_UPDATED_EVENT, checkTimer);
    window.addEventListener(IN_PROGRESS_EXAM_UPDATED_EVENT, checkTimer);
    
    return () => {
      disposed = true;
      clearInterval(interval);
      clearInterval(timerCheckpoint);
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(STANDALONE_SESSION_UPDATED_EVENT, checkTimer);
      window.removeEventListener(IN_PROGRESS_EXAM_UPDATED_EVENT, checkTimer);
    };
  }, [loadNotifications, loadUsageBalance, profile.id]);

  // State to track if we should show the notification banner
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  const syncFCMToken = useCallback(async (requestPermission: boolean) => {
    try {
      if (
        typeof window === "undefined"
        || !("Notification" in window)
        || !("serviceWorker" in navigator)
      ) return;

      const permission = requestPermission && Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      // Reflect the browser's decision immediately. Token registration can take
      // longer or fail independently, but the permission banner is no longer relevant.
      setNotificationPermission(permission);

      if (permission !== "granted" || !messaging) return;

      const registration = await registerAppServiceWorker();
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, // User must provide this in .env.local
        serviceWorkerRegistration: registration
      });

      if (token) {
        const supabase = createClient();
        const { error } = await supabase.rpc("register_fcm_token", { p_token: token });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error registering FCM token:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const timer = window.setTimeout(() => {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "granted") void syncFCMToken(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncFCMToken]);

  useEffect(() => {
    if (!messaging) return;
    return onMessage(messaging, (payload) => {
      void loadNotifications();
      if (Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.ready.then((registration) => {
        const title = payload.data?.title || payload.notification?.title || "IBA Written";
        const tag = payload.data?.tag;
        return registration.showNotification(title, {
          body: payload.data?.body || payload.notification?.body || "",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag,
          data: { url: payload.data?.url || "/notifications" },
        });
      }).catch((error) => console.error("Unable to show foreground notification", error));
    });
  }, [loadNotifications]);

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    const supabase = createClient();
    if (
      messaging
      && Notification.permission === "granted"
      && "serviceWorker" in navigator
    ) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        if (token) await supabase.rpc("unregister_fcm_token", { p_token: token });
      } catch (error) {
        console.error("Unable to unregister this browser from push notifications", error);
      }
    }
    clearStandaloneSessions(localStorage);
    clearExamBrowserStateOnSignOut(localStorage, sessionStorage);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActiveTab(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Calculate usage percentage for the plan bar
  const currentSubscription = usageBalance ? usageBalance.subscription : initialSubscription;
  const usageInfo = getUsageInfo(usageBalance?.profile ?? profile, currentSubscription);
  const personalReportLocked = !currentSubscription && !profile.is_admin;

  return (
    <div className="flex min-h-dvh">
      {/* ─── Desktop Sidenav ────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 border-r border-border bg-card fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 h-16 border-b border-border shrink-0">
          <h1 className="text-xl font-bold tracking-tight">
            IBA Wr<span className="text-brand-500">!</span>tten
          </h1>
        </div>

        {/* Notification Banner */}
        {notificationPermission === "default" && (
          <div className="m-3 p-3 bg-brand-50 border border-brand-200 rounded-lg shrink-0">
            <h3 className="text-xs font-semibold text-brand-800 mb-1">Stay Updated!</h3>
            <p className="text-[10px] text-brand-600 mb-2 leading-tight">
              Enable notifications for practice, exams, results, and plan reminders.
            </p>
            <button
              onClick={() => void syncFCMToken(true)}
              className="w-full bg-brand-600 text-white rounded text-xs py-1.5 font-medium hover:bg-brand-700 transition-colors"
            >
              Enable Notifications
            </button>
          </div>
        )}

        <CurrentPlanIndicator planName={usageInfo.label} isApprovedMagnusStudent={isApprovedMagnusStudent} />

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {SIDENAV_LINKS.map((link) => {
            const active = isActiveTab(link.href);
            
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative
                  ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
              >
                <link.icon size={18} />
                {link.label}
                {link.href === "/personal-report" && personalReportLocked && (
                  <Lock size={13} className="ml-auto text-amber-600" aria-label="Subscriber feature" />
                )}
                {active && (
                  <div className={`${link.href === "/personal-report" && personalReportLocked ? "" : "ml-auto"} w-1.5 h-1.5 rounded-full bg-brand-500`} />
                )}
                <NavigationLoadingOverlay />
              </Link>
            );
          })}
          
          <ActiveSessionSidenavLinks sessions={activeSessions} />
        </nav>

        {/* Usage Bar */}
        <div className="px-4 pb-3">
          <UsageBar info={usageInfo} />
        </div>

        {/* Social Links */}
        <div className="px-4 pb-3 space-y-1">
          {process.env.NEXT_PUBLIC_FB_PAGE_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_FB_PAGE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
              Facebook Page
            </a>
          )}
          {process.env.NEXT_PUBLIC_FB_GROUP_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_FB_GROUP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
              Facebook Group
            </a>
          )}
        </div>

        {/* User & Logout */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700 shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {profile?.name ?? "Loading…"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.institute}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Sidenav Overlay ─────────────────────────────────── */}
      {sidenavOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidenavOpen(false)}
        />
      )}

      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border
                     transform transition-transform duration-300 ease-out
                     ${sidenavOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Close */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <h1 className="text-lg font-bold tracking-tight">
            IBA Wr<span className="text-brand-500">!</span>tten
          </h1>
          <button
            onClick={() => setSidenavOpen(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Notification Banner */}
        {notificationPermission === "default" && (
          <div className="m-3 p-3 bg-brand-50 border border-brand-200 rounded-lg shrink-0">
            <h3 className="text-xs font-semibold text-brand-800 mb-1">Stay Updated!</h3>
            <p className="text-[10px] text-brand-600 mb-2 leading-tight">
              Enable notifications for practice, exams, results, and plan reminders.
            </p>
            <button
              onClick={() => void syncFCMToken(true)}
              className="w-full bg-brand-600 text-white rounded text-xs py-1.5 font-medium hover:bg-brand-700 transition-colors"
            >
              Enable Notifications
            </button>
          </div>
        )}

        <CurrentPlanIndicator
          planName={usageInfo.label}
          isApprovedMagnusStudent={isApprovedMagnusStudent}
          onClick={() => setSidenavOpen(false)}
        />

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {SIDENAV_LINKS.map((link) => {
            const active = isActiveTab(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                onClick={() => setSidenavOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
              >
                <link.icon size={18} />
                {link.label}
                {link.href === "/personal-report" && personalReportLocked && (
                  <Lock size={13} className="ml-auto text-amber-600" aria-label="Subscriber feature" />
                )}
                <ChevronRight size={14} className={`${link.href === "/personal-report" && personalReportLocked ? "" : "ml-auto"} opacity-40`} />
                <NavigationLoadingOverlay />
              </Link>
            );
          })}
          
          <ActiveSessionSidenavLinks
            sessions={activeSessions}
            onNavigate={() => setSidenavOpen(false)}
          />
        </nav>

        {/* Usage Bar */}
        <div className="px-4 pb-3">
          <UsageBar info={usageInfo} />
        </div>

        {/* Social */}
        <div className="px-4 pb-3 space-y-1">
          {process.env.NEXT_PUBLIC_FB_PAGE_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_FB_PAGE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
              Facebook Page
            </a>
          )}
          {process.env.NEXT_PUBLIC_FB_GROUP_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_FB_GROUP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink size={14} />
              Facebook Group
            </a>
          )}
        </div>

        {/* User */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700 shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.institute}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:ml-72 w-full max-w-[100vw] overflow-x-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 bg-card/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <button
              onClick={() => setSidenavOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Menu size={20} />
            </button>

            <h1 className="text-lg font-bold tracking-tight">
              IBA Wr<span className="text-brand-500">!</span>tten
            </h1>

            <div className="flex items-center gap-1">
              <Link
                href="/subscription"
                prefetch={false}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-brand-600"
              >
                <Crown size={18} />
              </Link>
              <button
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative"
                onClick={() => router.push("/notifications")}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-card/80 backdrop-blur-md border-b border-border items-center justify-between px-6 h-14">
          <div />
          <div className="flex items-center gap-2">
            <Link
              href="/subscription"
              prefetch={false}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-brand-600"
              title="Subscription"
            >
              <Crown size={18} />
            </Link>
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative"
              onClick={() => router.push("/notifications")}
              title="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 pb-20 lg:pb-6">{children}</main>

        {/* ─── Mobile Bottom Tab Bar ─────────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-card/95 backdrop-blur-md border-t border-border bottom-tab-bar">
          <div className="flex items-center justify-around h-16 px-2">
            {TABS.map((tab) => {
              const active = isActiveTab(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={false}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all min-w-0
                    ${
                      active
                        ? "text-brand-600"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <div
                    className={`p-1.5 rounded-lg transition-all ${
                      active ? "bg-brand-50" : ""
                    }`}
                  >
                    <tab.icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                  </div>
                  <span
                    className={`text-[10px] font-medium leading-none text-center ${
                      active ? "text-brand-600" : ""
                    }`}
                  >
                    {tab.label}
                  </span>
                  {active && (
                    <div className="h-0.5 w-5 rounded-full bg-brand-500 -mt-0.5" />
                  )}
                  <NavigationLoadingOverlay />
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

    </div>
  );
}

function CurrentPlanIndicator({
  planName,
  isApprovedMagnusStudent,
  onClick,
}: {
  planName: string;
  isApprovedMagnusStudent: boolean;
  onClick?: () => void;
}) {
  const magnus = isApprovedMagnusStudent;
  return (
    <Link
      href="/subscription"
      prefetch={false}
      onClick={onClick}
      className={`mx-3 mt-3 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        magnus
          ? "border-[#900304]/30 bg-[#900304]/5 text-[#900304] hover:bg-[#900304]/10"
          : "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
      }`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        magnus ? "border border-[#900304]/20 bg-white p-1" : "bg-brand-600 text-white"
      }`}>
        {magnus ? (
          <Image
            src="/magnus/magnus-transparent.png"
            alt="Magnus Academy"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        ) : (
          <Crown size={16} aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${
          magnus ? "text-[#900304]" : "text-brand-600"
        }`}>
          {magnus ? "Plan Magnus" : "Current plan"}
        </p>
        <p className="truncate text-sm font-bold">{planName}</p>
      </div>
      <ChevronRight
        size={16}
        className={`ml-auto shrink-0 ${magnus ? "text-[#900304]" : "text-brand-600"}`}
        aria-hidden="true"
      />
    </Link>
  );
}

function UsageBar({ info }: { info: UsageInfo }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{info.label}</span>
        {info.total > 0 && (
          <span className="text-xs text-muted-foreground">
            {info.remaining}/{info.total} left
          </span>
        )}
      </div>
      
      {info.expiresAt && (
        <div className="text-[10px] text-muted-foreground -mt-1 mb-1">
          Ends: {new Date(info.expiresAt).toLocaleDateString()}
        </div>
      )}

      {info.total > 0 && (
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${info.color}`}
            style={{ width: `${Math.max(info.percentage, 2)}%` }}
          />
        </div>
      )}

      {info.showUpgrade && (
        <Link
          href={info.total <= 3 ? "/subscription" : "/subscription/extra"}
          prefetch={false}
          className="flex items-center justify-center gap-1.5 w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white
                     hover:bg-brand-700 transition-colors"
        >
          <Crown size={12} />
          {info.total <= 3 ? "Upgrade Plan" : "Buy Extra Tests"}
        </Link>
      )}
    </div>
  );
}
