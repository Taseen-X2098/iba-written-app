import "server-only";

import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { MagnusMembershipStatus, Profile, Subscription } from "@/lib/types";

export const getMainUserContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const [{ data: profile }, { data: subscriptions }, { count: unreadCount }, { data: magnusMembership }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    supabase
      .from("magnus_memberships")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!profile) throw new Error("Authenticated user profile is missing");
  return {
    user,
    profile: profile as Profile,
    subscription: (subscriptions?.[0] as Subscription | undefined) ?? null,
    unreadCount: unreadCount ?? 0,
    magnusStatus: (magnusMembership?.status as MagnusMembershipStatus | undefined) ?? null,
  };
});
