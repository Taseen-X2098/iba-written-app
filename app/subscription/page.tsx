import MainShell from "@/components/main-shell";
import SubscriptionClient from "@/components/subscription/subscription-client";
import { getMainUserContext } from "@/lib/main-user-context";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const context = await getMainUserContext();
  const params = await searchParams;
  const success = params.success === "true";
  const error = typeof params.error === "string" ? params.error : undefined;

  const subscriptionPage = (
    <SubscriptionClient
      activeSubscription={context?.subscription ?? null}
      freeTestsRemaining={context?.profile.free_tests_remaining ?? 0}
      success={success}
      error={error}
      planPaymentFormUrl={process.env.PLAN_PAYMENT_FORM_URL || process.env.NEXT_PUBLIC_PLAN_PAYMENT_FORM_URL || ""}
      slotsPaymentFormUrl={process.env.SLOTS_PAYMENT_FORM_URL || process.env.NEXT_PUBLIC_SLOTS_PAYMENT_FORM_URL || ""}
      mentorshipFormUrl={process.env.MENTORSHIP_FORM_URL || process.env.NEXT_PUBLIC_MENTORSHIP_FORM_URL || ""}
    />
  );

  if (!context) return subscriptionPage;

  return (
    <MainShell
      initialProfile={context.profile}
      initialSubscription={context.subscription}
      initialUnreadCount={context.unreadCount}
      initialMagnusStatus={context.magnusStatus}
    >
      {subscriptionPage}
    </MainShell>
  );
}
