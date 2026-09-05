import MainShell from "@/components/main-shell";
import SubscriptionClient from "@/components/subscription/subscription-client";
import { getMainUserContext } from "@/lib/main-user-context";
import { getSubscriptionFormUrls } from "@/lib/subscriptions/form-urls";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const context = await getMainUserContext();
  const params = await searchParams;
  const success = params.success === "true";
  const error = typeof params.error === "string" ? params.error : undefined;
  const formUrls = getSubscriptionFormUrls();

  const subscriptionPage = (
    <SubscriptionClient
      activeSubscription={context?.subscription ?? null}
      freeTestsRemaining={context?.profile.free_tests_remaining ?? 0}
      success={success}
      error={error}
      {...formUrls}
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
