"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isValidMagnusPromoCode, normalizeMagnusPromoCode } from "@/lib/magnus/promo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MagnusMembershipStatus } from "@/lib/types";

export type MagnusPromoResult =
  | { success: true; status: MagnusMembershipStatus }
  | { success: false; error: string };

export async function submitMagnusPromoCode(rawCode: string): Promise<MagnusPromoResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in again." };

  const code = normalizeMagnusPromoCode(rawCode);
  if (!code) return { success: false, error: "Enter your Magnus Academy promocode." };
  if (code.length > 100 || !isValidMagnusPromoCode(code)) {
    return { success: false, error: "Invalid Magnus Academy promocode." };
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("magnus_memberships")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) return { success: false, error: "Unable to verify your status right now." };
  if (existing?.status === "approved" || existing?.status === "pending") {
    return { success: true, status: existing.status };
  }

  const { error } = await admin.from("magnus_memberships").insert({
    user_id: user.id,
    status: "pending",
    source: "promo",
  });
  if (error && error.code !== "23505") {
    console.error("Unable to create Magnus membership request", error);
    return { success: false, error: "Unable to submit your promocode right now." };
  }

  revalidatePath("/settings");
  return { success: true, status: "pending" };
}
