"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, UserPlus, Loader2 } from "lucide-react";
import { signupSchema } from "@/lib/validation/profile";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    institute: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the information you entered");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://iba-written.netlify.app";
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          name: parsed.data.name,
          institute: parsed.data.institute,
          phone: parsed.data.phone || null,
        },
        emailRedirectTo: `${SITE_URL}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Redirect to verify email page
    router.push("/verify-email");
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-foreground mb-1">
        Create your account
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Get 3 free AI-graded tests to start
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label
            htmlFor="signup-name"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Full Name <span className="text-destructive">*</span>
          </label>
          <input
            id="signup-name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Your full name"
            required
            maxLength={200}
            autoComplete="name"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {/* Institute */}
        <div>
          <label
            htmlFor="signup-institute"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Institute <span className="text-destructive">*</span>
          </label>
          <input
            id="signup-institute"
            type="text"
            value={form.institute}
            onChange={(e) => updateField("institute", e.target.value)}
            placeholder="Your school / university"
            required
            maxLength={300}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {/* Phone (optional) */}
        <div>
          <label
            htmlFor="signup-phone"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Phone{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="signup-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="01XXXXXXXXX"
            autoComplete="tel"
            maxLength={50}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="signup-email"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Email <span className="text-destructive">*</span>
          </label>
          <input
            id="signup-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="you@example.com"
            required
            maxLength={320}
            autoComplete="email"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="signup-password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Password <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm
                         placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                         transition-shadow"
              maxLength={128}
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

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="signup-confirm-password"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Confirm Password <span className="text-destructive">*</span>
          </label>
          <input
            id="signup-confirm-password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => updateField("confirmPassword", e.target.value)}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
            maxLength={128}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                       placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                       transition-shadow"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive animate-fade-in">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
                     hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
