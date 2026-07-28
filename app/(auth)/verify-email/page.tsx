"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setResending(true);
    setError(null);
    setResent(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setError("No email found. Please sign up again.");
      setResending(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setResent(true);
    }

    setResending(false);
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Mail className="h-7 w-7 text-brand-600" />
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">
        Check your email
      </h2>

      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        We&apos;ve sent a verification link to your email address.
        <br />
        Click the link to verify your account and start practicing.
      </p>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive mb-4 animate-fade-in">
          {error}
        </div>
      )}

      {resent && (
        <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-sm text-brand-700 mb-4 animate-fade-in flex items-center justify-center gap-2">
          <CheckCircle2 size={14} />
          Verification email resent!
        </div>
      )}

      <button
        onClick={handleResend}
        disabled={resending}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground
                   hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all"
      >
        {resending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <RefreshCw size={16} />
        )}
        {resending ? "Sending…" : "Resend verification email"}
      </button>

      <p className="mt-6 text-xs text-muted-foreground">
        Didn&apos;t receive the email? Check your spam folder or try resending.
      </p>
    </div>
  );
}
