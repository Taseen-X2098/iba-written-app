jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signup } from "./actions";

const baseInput = {
  name: "Ayesha",
  institute: "Magnus Academy",
  phone: "",
  email: "ayesha@example.com",
  password: "secret12",
  confirmPassword: "secret12",
  promoCode: "",
};

describe("server-side signup claims", () => {
  const signUp = jest.fn();
  const claimInsert = jest.fn();
  const claimDeleteEq = jest.fn();

  beforeEach(() => {
    process.env.MAGNUS_PROMO_CODE = "Academy-2026";
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    signUp.mockReset().mockResolvedValue({
      data: { user: { identities: [{ id: "identity" }] } },
      error: null,
    });
    claimInsert.mockReset().mockResolvedValue({ error: null });
    claimDeleteEq.mockReset().mockResolvedValue({ error: null });
    jest.mocked(createClient).mockResolvedValue({
      auth: { signUp },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    jest.mocked(createAdminClient).mockReturnValue({
      from: jest.fn(() => ({
        insert: claimInsert,
        delete: jest.fn(() => ({ eq: claimDeleteEq })),
      })),
    } as unknown as ReturnType<typeof createAdminClient>);
  });

  afterEach(() => {
    delete process.env.MAGNUS_PROMO_CODE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("blocks an invalid nonblank promo before Auth signup", async () => {
    await expect(signup({ ...baseInput, promoCode: "wrong" })).resolves.toEqual({
      success: false,
      error: "Invalid Magnus Academy promocode.",
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(claimInsert).not.toHaveBeenCalled();
  });

  it("creates an email-bound short-lived claim and passes only its token to Auth", async () => {
    await expect(signup({ ...baseInput, promoCode: " academy-2026 " }))
      .resolves.toEqual({ success: true });

    expect(claimInsert).toHaveBeenCalledWith(expect.objectContaining({
      email: "ayesha@example.com",
      token: expect.any(String),
      expires_at: expect.any(String),
    }));
    const claim = claimInsert.mock.calls[0][0];
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "ayesha@example.com",
      options: expect.objectContaining({
        emailRedirectTo: "https://example.com/auth/callback",
        data: expect.objectContaining({ magnus_signup_claim: claim.token }),
      }),
    }));
    expect(JSON.stringify(signUp.mock.calls[0][0])).not.toContain("academy-2026");
  });

  it("keeps blank promo signup normal", async () => {
    await expect(signup(baseInput)).resolves.toEqual({ success: true });
    expect(claimInsert).not.toHaveBeenCalled();
    expect(signUp.mock.calls[0][0].options.data).not.toHaveProperty("magnus_signup_claim");
  });

  it("removes an unused claim when Auth signup fails", async () => {
    signUp.mockResolvedValueOnce({ data: { user: null }, error: { message: "Auth failed" } });
    await expect(signup({ ...baseInput, promoCode: "academy-2026" }))
      .resolves.toEqual({ success: false, error: "Auth failed" });
    expect(claimDeleteEq).toHaveBeenCalledWith("token", claimInsert.mock.calls[0][0].token);
  });
});
