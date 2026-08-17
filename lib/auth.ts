import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHORIZED", "Unauthorized", 401);
  return user;
}

export async function requireAdminUser() {
  const user = await requireApiUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new ApiError("FORBIDDEN", "Forbidden", 403);
  return user;
}

