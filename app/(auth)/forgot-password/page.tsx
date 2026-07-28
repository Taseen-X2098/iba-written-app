"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, Loader2, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <CheckCircle2 className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Check your email
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          We&apos;ve sent a password reset link to{" "}
          <span className="font-medium text-foreground">{email}</span>.
          <br />
          Click the link to reset your password.
        </p>
        <Link
          href="/login"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <KeyRound className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Forgot your password?
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive animate-fade-in">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
                     hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98]"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}
