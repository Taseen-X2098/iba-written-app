import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth callback — handles the redirect after email verification,
 * OAuth, magic link, or password reset.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Keep the redirect relative so reverse-proxy internals (for example,
      // localhost:8080 on Railway) can never leak into the public URL.
      return new NextResponse(null, {
        status: 307,
        headers: { Location: next },
      });
    }
  }

  // If there's an error or no code, redirect to login with error
  return new NextResponse(null, {
    status: 307,
    headers: { Location: "/login?error=auth_callback_failed" },
  });
}
