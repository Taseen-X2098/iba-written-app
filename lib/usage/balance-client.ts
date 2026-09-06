export const USAGE_BALANCE_UPDATED_EVENT = "usage_balance_updated";

/** Tell the persistent app shell that a slot reservation or refund committed. */
export function notifyUsageBalanceUpdated() {
  window.dispatchEvent(new Event(USAGE_BALANCE_UPDATED_EVENT));
}
