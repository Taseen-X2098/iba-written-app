import "server-only";

export const DEFAULT_MAGNUS_PROMO_CODE = "MAGNUS-IBAWRITTEN";

export function normalizeMagnusPromoCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

export function configuredMagnusPromoCode() {
  return normalizeMagnusPromoCode(process.env.MAGNUS_PROMO_CODE)
    || DEFAULT_MAGNUS_PROMO_CODE;
}

export function isValidMagnusPromoCode(value: string | null | undefined) {
  const normalized = normalizeMagnusPromoCode(value);
  return normalized.length > 0 && normalized === configuredMagnusPromoCode();
}
