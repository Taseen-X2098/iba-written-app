"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Loader2,
  Trophy,
} from "lucide-react";
import type { Notification, NotificationType } from "@/lib/types";

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  exam_available: Trophy,
  exam_reminder: CalendarClock,
  results_published: Trophy,
  subscription_expiring: Crown,
  subscription_lapsed: Crown,
  inactivity_reminder: Clock,
  practice_reminder: BookOpen,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  exam_available: "bg-brand-50 text-brand-600",
  exam_reminder: "bg-purple-50 text-purple-600",
  results_published: "bg-blue-50 text-blue-600",
  subscription_expiring: "bg-orange-50 text-orange-600",
  subscription_lapsed: "bg-amber-50 text-amber-700",
  inactivity_reminder: "bg-muted text-muted-foreground",
  practice_reminder: "bg-emerald-50 text-emerald-600",
};

function safeActionUrl(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    async function loadNotifications() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (data) setNotifications(data);
      }
      setLoading(false);
    }

    void loadNotifications();
  }, []);

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  async function openNotification(notification: Notification) {
    if (!notification.is_read) void markAsRead(notification.id);

    if (notification.details) {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(notification.id)) next.delete(notification.id);
        else next.add(notification.id);
        return next;
      });
      return;
    }

    const actionUrl = safeActionUrl(notification.action_url);
    if (actionUrl) {
      router.push(actionUrl);
      return;
    }

    if ((notification.type === "exam_available" || notification.type === "exam_reminder") && notification.exam_id) {
      router.push(`/exams/${notification.exam_id}`);
    } else if (notification.type === "results_published" && notification.exam_id) {
      router.push(`/exams/${notification.exam_id}/results`);
    }
  }

  async function markAllAsRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true }))
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
            <Bell size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            )}
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <Check size={14} />
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = NOTIFICATION_ICONS[n.type] ?? AlertCircle;
            const colorClass = NOTIFICATION_COLORS[n.type] ?? "bg-muted text-muted-foreground";
            const expanded = expandedIds.has(n.id);
            const actionUrl = safeActionUrl(n.action_url);

            return (
              <div
                key={n.id}
                className={`w-full rounded-xl border transition-all overflow-hidden
                  ${
                    n.is_read
                      ? `border-border bg-card ${expanded ? "" : "opacity-60"}`
                      : "border-brand-100 bg-card hover:bg-muted"
                  }`}
              >
                <button
                  type="button"
                  onClick={() => void openNotification(n)}
                  aria-expanded={n.details ? expanded : undefined}
                  className="w-full text-left flex items-start gap-3 p-4"
                >
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className={`text-xs text-muted-foreground mt-0.5 ${expanded ? "" : "line-clamp-2"}`}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="mt-2 flex shrink-0 items-center gap-2">
                    {!n.is_read && <div className="h-2 w-2 rounded-full bg-brand-500" />}
                    {n.details && (expanded
                      ? <ChevronUp size={16} className="text-muted-foreground" />
                      : <ChevronDown size={16} className="text-muted-foreground" />)}
                  </div>
                </button>

                {n.details && expanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 sm:pl-16">
                    <p className="whitespace-pre-line text-sm leading-6 text-foreground">
                      {n.details}
                    </p>
                    {actionUrl && (
                      <button
                        type="button"
                        onClick={() => router.push(actionUrl)}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                      >
                        Continue my progress <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
