"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Lock, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Listen for the auth state change when user arrives via the reset link
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setSessionReady(true);
        }
      }
    );

    // Also check if we're already in a valid session
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 2000);
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 animate-scale-in">
          <CheckCircle2 className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Password updated!
        </h2>
        <p className="text-sm text-muted-foreground">
          Redirecting you to the app…
        </p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 text-brand-500 animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">
          Verifying your reset link…
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Lock className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Set a new password
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a strong password for your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="reset-password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            New Password
          </label>
          <div className="relative">
            <input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm
                         placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                         transition-shadow"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Confirm New Password
          </label>
          <input
            id="reset-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
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
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}
