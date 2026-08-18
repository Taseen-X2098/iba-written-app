export default function MainLoading() {
  return (
    <div
      className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-brand-100">
        <div className="route-loading-bar h-full w-1/3 rounded-full bg-brand-500" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-brand-100" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-36 animate-pulse rounded-md bg-slate-200" />
            <div className="h-3 w-full max-w-xs animate-pulse rounded bg-slate-100" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className={`rounded-2xl border border-border bg-card p-5 ${
                item > 1 ? "hidden sm:block" : ""
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-brand-50" />
              </div>
              <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground sm:hidden">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
          Loading page…
        </div>
      </div>

      <span className="sr-only">Loading the next page</span>
    </div>
  );
}
