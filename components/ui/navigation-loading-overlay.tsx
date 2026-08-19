"use client";

import { useLinkStatus } from "next/link";

export function NavigationLoadingOverlay() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-background/75 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <span className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-brand-100">
        <span className="route-loading-bar block h-full w-1/3 rounded-full bg-brand-500" />
      </span>
      <span className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-lg">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        Loading page…
      </span>
    </span>
  );
}
