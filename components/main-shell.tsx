"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
  Play,
  AlertTriangle,
} from "lucide-react";
import type { Profile, Subscription } from "@/lib/types";
import { messaging } from "@/lib/firebase";
import { getToken } from "firebase/messaging";

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
  { href: "/history", label: "History", icon: BookOpen },
  { href: "/subscription", label: "Subscription", icon: Crown },
  { href: "/tips", label: "Tips", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidenavOpen, setSidenavOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [hasActiveTimer, setHasActiveTimer] = useState(false);
  const [activeTestState, setActiveTestState] = useState<{ type: "test" | "exam", id: string, title: string, isPractice?: boolean } | null>(null);
  const [showReminderPopup, setShowReminderPopup] = useState(false);
  const popupCheckedRef = React.useRef(false);

  useEffect(() => {
    loadUserData();
    // Poll for notifications every 60s
    const interval = setInterval(loadNotifications, 60000);
    
    // Check for active timer
    const checkTimer = () => {
      let active = false;
      let testId = "";
      try {
        const savedExam = localStorage.getItem("in_progress_exam");
        if (savedExam) {
          const parsed = JSON.parse(savedExam);
          if (parsed && parsed.lastUpdatedAt && Date.now() - parsed.lastUpdatedAt <= 3600000) {
            setActiveTestState({
              type: "exam",
              id: parsed.examId,
              title: parsed.title,
              isPractice: parsed.isPractice
            });
            testId = parsed.examId;
            active = true;
          }
        }

        if (!active) {
          const saved = localStorage.getItem("in_progress_test");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.lastUpdatedAt && Date.now() - parsed.lastUpdatedAt <= 3600000) {
              setActiveTestState({
                type: "test",
                id: parsed.questionId,
                title: parsed.prompt
              });
              testId = parsed.questionId;
              active = true;
            }
          }
        }
      } catch (e) {
        // ignore
      }
      
      if (active && !popupCheckedRef.current) {
        popupCheckedRef.current = true;
        // Only show popup if they are not already on the active test page
        const isAlreadyOnPage = window.location.pathname.startsWith(`/test/${testId}`) || window.location.pathname.startsWith(`/exams/${testId}`);
        if (!isAlreadyOnPage) {
          setShowReminderPopup(true);
        }
      }
      
      if (!active) {
        setActiveTestState(null);
      }
      setHasActiveTimer(active);
    };
    
    checkTimer();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "in_progress_test" || e.key === "in_progress_exam") checkTimer();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("in_progress_test_updated", checkTimer);
    window.addEventListener("in_progress_exam_updated", checkTimer);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("in_progress_test_updated", checkTimer);
      window.removeEventListener("in_progress_exam_updated", checkTimer);
    };
  }, []);

  async function loadUserData() {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
      
    if (profileError) {
      console.error("Failed to load profile:", profileError);
    }
    
    if (profileData) setProfile(profileData);

    // Load active subscription
    const { data: subData } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (subData) setSubscription(subData);

    // Update last_active_at
    await supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id);

    await loadNotifications();
  }

  async function loadNotifications() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
  }

  async function registerFCMToken() {
    try {
      if (!messaging) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, { 
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, // User must provide this in .env.local
          serviceWorkerRegistration: registration
        });
        
        if (token) {
          const supabase = createClient();
          
          // Get current tokens to prevent duplicates
          const { data } = await supabase
            .from('profiles')
            .select('fcm_tokens')
            .eq('id', profile?.id || "")
            .single();
            
          const currentTokens = data?.fcm_tokens || [];
          
          if (!currentTokens.includes(token)) {
            await supabase
              .from('profiles')
              .update({ fcm_tokens: [...currentTokens, token] })
              .eq('id', profile?.id || "");
          }
        }
        
        // Hide the banner if permission was just granted
        setNotificationPermission(permission);
      } else {
        setNotificationPermission(permission);
      }
    } catch (error) {
      console.error('Error registering FCM token:', error);
    }
  }

  // State to track if we should show the notification banner
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  async function handleLogout() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActiveTab(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Calculate usage percentage for the plan bar
  const usageInfo = getUsageInfo(profile, subscription);

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
              Enable notifications to know when new exams or results are available.
            </p>
            <button
              onClick={registerFCMToken}
              className="w-full bg-brand-600 text-white rounded text-xs py-1.5 font-medium hover:bg-brand-700 transition-colors"
            >
              Enable Notifications
            </button>
          </div>
        )}

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {SIDENAV_LINKS.map((link) => {
            const active = isActiveTab(link.href);
            const showPin = link.href === "/history" && hasActiveTimer;
            
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative
                  ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
              >
                <div className="relative">
                  <link.icon size={18} />
                  {showPin && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
                    </span>
                  )}
                </div>
                {link.label}
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
                )}
              </Link>
            );
          })}
          
          {/* Active Test Sidenav Link */}
          {activeTestState && (
            <div className="pt-2">
              <Link
                href={activeTestState.type === "exam" 
                  ? `/exams/${activeTestState.id}${activeTestState.isPractice ? "?practice=true" : ""}` 
                  : `/test/${activeTestState.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold bg-brand-600 text-white shadow-md shadow-brand-200 hover:bg-brand-700 transition-colors relative overflow-hidden group"
              >
                <span className="absolute inset-0 w-1/4 bg-white/20 skew-x-[45deg] -translate-x-full group-hover:animate-shine"></span>
                <Play size={18} className="shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[10px] uppercase tracking-wider opacity-80 leading-none mb-0.5">
                    Active {activeTestState.type === "exam" ? "Exam" : "Test"}
                  </span>
                  <span className="truncate w-full">{activeTestState.title}</span>
                </div>
              </Link>
            </div>
          )}
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
              Enable notifications to know when new exams or results are available.
            </p>
            <button
              onClick={registerFCMToken}
              className="w-full bg-brand-600 text-white rounded text-xs py-1.5 font-medium hover:bg-brand-700 transition-colors"
            >
              Enable Notifications
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {SIDENAV_LINKS.map((link) => {
            const active = isActiveTab(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
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
                <ChevronRight size={14} className="ml-auto opacity-40" />
              </Link>
            );
          })}
          
          {/* Active Test Sidenav Link Mobile */}
          {activeTestState && (
            <div className="pt-2">
              <Link
                onClick={() => setSidenavOpen(false)}
                href={activeTestState.type === "exam" 
                  ? `/exams/${activeTestState.id}${activeTestState.isPractice ? "?practice=true" : ""}` 
                  : `/test/${activeTestState.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold bg-brand-600 text-white shadow-md shadow-brand-200 hover:bg-brand-700 transition-colors relative overflow-hidden group"
              >
                <span className="absolute inset-0 w-1/4 bg-white/20 skew-x-[45deg] -translate-x-full group-hover:animate-shine"></span>
                <Play size={18} className="shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[10px] uppercase tracking-wider opacity-80 leading-none mb-0.5">
                    Active {activeTestState.type === "exam" ? "Exam" : "Test"}
                  </span>
                  <span className="truncate w-full">{activeTestState.title}</span>
                </div>
              </Link>
            </div>
          )}
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

        {/* Active Test Banner */}
        {activeTestState && 
         !pathname.startsWith(`/test/${activeTestState.id}`) && 
         !pathname.startsWith(`/exams/${activeTestState.id}`) && (
          <div className="bg-brand-600 text-white px-4 py-2 flex items-center justify-between sticky top-14 lg:top-14 z-10 shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium flex-1 min-w-0">
              <span className="animate-pulse h-2 w-2 bg-white rounded-full shrink-0" />
              <span className="truncate">
                Active {activeTestState.type === "exam" ? "Exam" : "Test"}: {activeTestState.title}
              </span>
            </div>
            <Link
              href={activeTestState.type === "exam" 
                ? `/exams/${activeTestState.id}${activeTestState.isPractice ? "?practice=true" : ""}` 
                : `/test/${activeTestState.id}`}
              className="ml-4 shrink-0 bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded text-xs font-bold whitespace-nowrap flex items-center gap-1"
            >
              Return <ChevronRight size={14} />
            </Link>
          </div>
        )}

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
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Reminder Popup */}
      {showReminderPopup && activeTestState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-2xl p-6 shadow-2xl scale-in-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 mb-4">
              <Play size={24} className="ml-1" />
            </div>
            <h2 className="text-xl font-bold text-center text-foreground mb-2">Ongoing Session Found</h2>
            <p className="text-center text-sm text-muted-foreground mb-6">
              You left a session for <strong className="text-foreground">{activeTestState.title}</strong> running. Would you like to resume it?
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href={activeTestState.type === "exam" 
                  ? `/exams/${activeTestState.id}${activeTestState.isPractice ? "?practice=true" : ""}` 
                  : `/test/${activeTestState.id}`}
                onClick={() => setShowReminderPopup(false)}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white text-center hover:bg-brand-700 shadow-md shadow-brand-200 transition-all flex items-center justify-center gap-2"
              >
                Resume {activeTestState.type === "exam" ? "Exam" : "Test"} <ChevronRight size={16} />
              </Link>
              <button
                onClick={() => setShowReminderPopup(false)}
                className="w-full rounded-xl bg-muted px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Usage Bar Component ──────────────────────────────────────────────────

interface UsageInfo {
  label: string;
  remaining: number;
  total: number;
  percentage: number;
  color: string;
  showUpgrade: boolean;
  expiresAt?: string;
}

function getUsageInfo(
  profile: Profile | null,
  subscription: Subscription | null
): UsageInfo {
  // Free tier
  if (!subscription) {
    const remaining = profile?.free_tests_remaining ?? 3;
    const total = 3;
    const pct = (remaining / total) * 100;
    return {
      label: "Free Tests",
      remaining,
      total,
      percentage: pct,
      color: getUsageColor(pct),
      showUpgrade: remaining <= 1,
    };
  }

  // Plan with tests
  if (subscription.plan_type === "plan_1" || subscription.plan_type === "plan_2") {
    const remaining = subscription.tests_remaining + subscription.extra_tests_purchased;
    const total = 300 + subscription.extra_tests_purchased;
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    return {
      label:
        subscription.plan_type === "plan_1" ? "Practice Plan" : "Complete Plan",
      remaining,
      total,
      percentage: pct,
      color: getUsageColor(pct),
      showUpgrade: pct <= 40,
      expiresAt: subscription.expires_at,
    };
  }

  // Plan 3 (exam only)
  return {
    label: "Exam Plan",
    remaining: 0,
    total: 0,
    percentage: 100,
    color: "bg-brand-500",
    showUpgrade: false,
    expiresAt: subscription.expires_at,
  };
}

function getUsageColor(pct: number): string {
  if (pct > 60) return "bg-usage-green";
  if (pct > 40) return "bg-usage-yellow";
  if (pct > 20) return "bg-usage-orange";
  return "bg-usage-red";
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
