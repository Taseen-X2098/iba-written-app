import { createClient } from "@/lib/supabase/server";
import SubscriptionClient from "@/components/subscription/subscription-client";
import { redirect } from "next/navigation";
import type { Subscription } from "@/lib/types";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch active subscription
  const { data: activeSub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  // Fetch free tests from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("free_tests_remaining")
    .eq("id", user.id)
    .single();

  const params = await searchParams;
  const success = params.success === "true";
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <SubscriptionClient
      activeSubscription={activeSub as Subscription | null}
      freeTestsRemaining={profile?.free_tests_remaining || 0}
      success={success}
      error={error}
    />
  );
}
