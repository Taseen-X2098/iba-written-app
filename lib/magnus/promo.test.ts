jest.mock("server-only", () => ({}));

import {
  DEFAULT_MAGNUS_PROMO_CODE,
  configuredMagnusPromoCode,
  isValidMagnusPromoCode,
  normalizeMagnusPromoCode,
} from "./promo";

const originalCode = process.env.MAGNUS_PROMO_CODE;

afterEach(() => {
  if (originalCode === undefined) delete process.env.MAGNUS_PROMO_CODE;
  else process.env.MAGNUS_PROMO_CODE = originalCode;
});

describe("Magnus promo codes", () => {
  it("uses the default when no nonblank override exists", () => {
    delete process.env.MAGNUS_PROMO_CODE;
    expect(configuredMagnusPromoCode()).toBe(DEFAULT_MAGNUS_PROMO_CODE);
    process.env.MAGNUS_PROMO_CODE = "   ";
    expect(configuredMagnusPromoCode()).toBe(DEFAULT_MAGNUS_PROMO_CODE);
  });

  it("normalizes whitespace and case", () => {
    process.env.MAGNUS_PROMO_CODE = "  Academy-2026 ";
    expect(normalizeMagnusPromoCode(" academy-2026 ")).toBe("ACADEMY-2026");
    expect(isValidMagnusPromoCode(" ACADEMY-2026 ")).toBe(true);
  });

  it("treats blank input as normal signup and rejects invalid input", () => {
    delete process.env.MAGNUS_PROMO_CODE;
    expect(isValidMagnusPromoCode(" ")).toBe(false);
    expect(isValidMagnusPromoCode("not-the-code")).toBe(false);
  });
});
