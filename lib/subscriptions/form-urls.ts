type SubscriptionFormEnvironment = Record<string, string | undefined>;

function firstConfiguredUrl(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

export function getSubscriptionFormUrls(
  environment: SubscriptionFormEnvironment = process.env
) {
  return {
    planPaymentFormUrl: firstConfiguredUrl(
      environment.PLAN_PAYMENT_FORM_URL,
      environment.PAYMENT_FORM_URL,
      environment.NEXT_PUBLIC_PLAN_PAYMENT_FORM_URL,
      environment.NEXT_PUBLIC_PAYMENT_FORM_URL
    ),
    slotsPaymentFormUrl: firstConfiguredUrl(
      environment.SLOTS_PAYMENT_FORM_URL,
      environment.NEXT_PUBLIC_SLOTS_PAYMENT_FORM_URL
    ),
    mentorshipFormUrl: firstConfiguredUrl(
      environment.MENTORSHIP_FORM_URL,
      environment.NEXT_PUBLIC_MENTORSHIP_FORM_URL
    ),
  };
}
