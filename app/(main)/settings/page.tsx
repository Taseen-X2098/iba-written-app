"use client";

import { useCallback, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { BadgeCheck, KeyRound, Settings, User, Lock, Loader2 } from "lucide-react";
import type { MagnusMembershipStatus, Profile } from "@/lib/types";
import { profileFieldsSchema } from "@/lib/validation/profile";
import { submitMagnusPromoCode } from "./actions";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", institute: "", phone: "" });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [magnusStatus, setMagnusStatus] = useState<MagnusMembershipStatus | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [submittingPromo, setSubmittingPromo] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [{ data }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("magnus_memberships")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (data) {
      setProfile(data);
      setForm({ name: data.name, institute: data.institute, phone: data.phone ?? "" });
    }
    setMagnusStatus((membership?.status as MagnusMembershipStatus | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSubmitPromo(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingPromo(true);
    setPromoMessage(null);
    const result = await submitMagnusPromoCode(promoCode);
    if (result.success) {
      setMagnusStatus(result.status);
      setPromoCode("");
      setPromoMessage({
        type: "success",
        text: result.status === "approved"
          ? "Your Magnus student status is already approved."
          : "Promocode accepted. Your status is awaiting admin approval.",
      });
    } else {
      setPromoMessage({ type: "error", text: result.error });
    }
    setSubmittingPromo(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const parsed = profileFieldsSchema.safeParse(form);
    if (!parsed.success) {
      setMessage({ type: "error", text: parsed.error.issues[0]?.message || "Check the information you entered" });
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        name: parsed.data.name,
        institute: parsed.data.institute,
        phone: parsed.data.phone || null,
      })
      .eq("id", profile!.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Profile updated!" });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-xl mx-auto animate-fade-in space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <Settings size={20} className="text-brand-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
      </div>

      {/* Profile Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Profile</h3>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label htmlFor="settings-name" className="block text-sm font-medium mb-1.5">
              Full Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              maxLength={200}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="settings-institute" className="block text-sm font-medium mb-1.5">
              Institute
            </label>
            <input
              id="settings-institute"
              type="text"
              value={form.institute}
              onChange={(e) => setForm((p) => ({ ...p, institute: e.target.value }))}
              required
              maxLength={300}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="settings-phone" className="block text-sm font-medium mb-1.5">
              Phone <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="settings-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              maxLength={50}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>



          {message && (
            <div
              className={`rounded-lg px-3 py-2 text-sm animate-fade-in ${
                message.type === "success"
                  ? "bg-brand-50 text-brand-700 border border-brand-200"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white
                       hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      <section className="border-t border-border pt-8">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Magnus Academy</h3>
        </div>

        {magnusStatus === "approved" ? (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
            <BadgeCheck size={21} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Approved Magnus student</p>
              <p className="mt-1 text-sm">Your Magnus-only exams and benefits are enabled.</p>
            </div>
          </div>
        ) : magnusStatus === "pending" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-semibold">Awaiting approval</p>
            <p className="mt-1 text-sm">Your promocode was accepted. An admin still needs to approve your Magnus student status.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmitPromo} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Magnus Academy students can submit their promocode for verification.
            </p>
            <label htmlFor="settings-magnus-promo" className="sr-only">Magnus Academy promocode</label>
            <input
              id="settings-magnus-promo"
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value)}
              maxLength={100}
              autoComplete="off"
              placeholder="Enter your promocode"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <button
              type="submit"
              disabled={submittingPromo}
              className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submittingPromo && <Loader2 size={16} className="animate-spin" />}
              {submittingPromo ? "Submitting…" : "Submit promocode"}
            </button>
          </form>
        )}

        {promoMessage && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            promoMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}>
            {promoMessage.text}
          </div>
        )}
      </section>

      {/* Change Password */}
      <section className="border-t border-border pt-8">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Password</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          To change your password, we&apos;ll send a reset link to your email.
        </p>
        <ChangePasswordButton />
      </section>
    </div>
  );
}

function ChangePasswordButton() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://iba-written.netlify.app";
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${SITE_URL}/auth/callback?next=/reset-password`,
    });

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <p className="text-sm text-brand-600 font-medium">
        ✓ Reset link sent to your email!
      </p>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium
                 hover:bg-muted disabled:opacity-50 transition-all"
    >
      {loading ? "Sending…" : "Send password reset link"}
    </button>
  );
}
