import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { OfflineRetryButton } from "@/components/pwa/offline-retry-button";

export const metadata: Metadata = {
  title: "You’re offline",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl shadow-brand-100/60">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <WifiOff size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
          You’re offline
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your saved answers and active exam progress remain on this device. Reconnect to load fresh questions, submit answers, or sync notifications.
        </p>
        <OfflineRetryButton />
      </section>
    </main>
  );
}
