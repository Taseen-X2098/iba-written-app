"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidMagnusPromoCode, normalizeMagnusPromoCode } from "@/lib/magnus/promo";
import { signupSchema } from "@/lib/validation/profile";

export type SignupActionResult =
  | { success: true }
  | { success: false; error: string };

export async function signup(input: unknown): Promise<SignupActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Check the information you entered",
    };
  }

  const promoCode = normalizeMagnusPromoCode(parsed.data.promoCode);
  if (promoCode && !isValidMagnusPromoCode(promoCode)) {
    return { success: false, error: "Invalid Magnus Academy promocode." };
  }

  const admin = createAdminClient();
  const claimToken = promoCode ? randomUUID() : null;
  if (claimToken) {
    const { error: claimError } = await admin.from("magnus_signup_claims").insert({
      token: claimToken,
      email: parsed.data.email.toLowerCase(),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (claimError) {
      console.error("Unable to create Magnus signup claim", claimError);
      return { success: false, error: "Unable to create your account right now. Please try again." };
    }
  }

  const supabase = await createClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://iba-written.netlify.app").replace(/\/$/, "");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        name: parsed.data.name,
        institute: parsed.data.institute,
        phone: parsed.data.phone || null,
        ...(claimToken ? { magnus_signup_claim: claimToken } : {}),
      },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (claimToken && (error || data.user?.identities?.length === 0)) {
    const { error: cleanupError } = await admin
      .from("magnus_signup_claims")
      .delete()
      .eq("token", claimToken);
    if (cleanupError) console.error("Unable to remove unused Magnus signup claim", cleanupError);
  }

  if (error) return { success: false, error: error.message };
  return { success: true };
}
