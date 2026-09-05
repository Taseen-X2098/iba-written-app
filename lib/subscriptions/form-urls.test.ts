import { getSubscriptionFormUrls } from "./form-urls";

describe("subscription form URLs", () => {
  it("uses the canonical server-side environment variables", () => {
    expect(
      getSubscriptionFormUrls({
        PLAN_PAYMENT_FORM_URL: "https://forms.example/plan",
        SLOTS_PAYMENT_FORM_URL: "https://forms.example/slots",
        MENTORSHIP_FORM_URL: "https://forms.example/mentorship",
      })
    ).toEqual({
      planPaymentFormUrl: "https://forms.example/plan",
      slotsPaymentFormUrl: "https://forms.example/slots",
      mentorshipFormUrl: "https://forms.example/mentorship",
    });
  });

  it("supports the legacy PAYMENT_FORM_URL used by existing deployments", () => {
    expect(
      getSubscriptionFormUrls({
        PAYMENT_FORM_URL: "https://forms.example/legacy-plan",
      }).planPaymentFormUrl
    ).toBe("https://forms.example/legacy-plan");
  });

  it("ignores blank values and trims the selected URL", () => {
    expect(
      getSubscriptionFormUrls({
        PLAN_PAYMENT_FORM_URL: "   ",
        PAYMENT_FORM_URL: "  https://forms.example/legacy-plan  ",
      }).planPaymentFormUrl
    ).toBe("https://forms.example/legacy-plan");
  });
});
