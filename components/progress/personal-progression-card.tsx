import Link from "next/link";
import { ArrowRight, Crown, Lock, Sparkles, Target, TrendingUp } from "lucide-react";
import type { PersonalProgressionCardDTO, ProgressionStatus } from "@/lib/types";

const STATUS_LABELS: Record<ProgressionStatus, string> = {
  building: "Building your baseline",
  improving: "Improving",
  steady: "Steady",
  needs_attention: "Needs focused attention",
};

const REPORT_SUBMISSIONS_REQUIRED = 3;

export function PersonalProgressionCard({
  report,
}: {
  report: PersonalProgressionCardDTO | null;
}) {
  if (!report) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="font-bold text-foreground">Category Progress Report</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Your category-wide report is temporarily unavailable. Your submission feedback has still been saved.
        </p>
      </section>
    );
  }

  if (report.locked) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:p-6">
        <Crown className="absolute -right-4 -top-4 text-amber-200/70" size={96} aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Lock size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-bold text-amber-950">{report.submissionTypeLabel} Progress Report</h3>
              <p className="text-xs font-semibold text-amber-700">{report.submissionTypeLabel} · Subscriber feature</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-amber-900">
            Unlock a category-wide view of the patterns across your {report.submissionTypeLabel} submissions, including recurring strengths, growth areas, and practice priorities.
          </p>
          <Link
            href="/subscription"
            prefetch={false}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-800"
          >
            View subscription options <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  if (!report.latestReport) {
    const completed = Math.min(report.totalGraded, REPORT_SUBMISSIONS_REQUIRED);
    const remaining = Math.max(REPORT_SUBMISSIONS_REQUIRED - report.totalGraded, 0);
    return (
      <section className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <TrendingUp size={20} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-bold text-foreground">{report.submissionTypeLabel} Progress Report</h3>
              <p className="text-xs font-medium text-muted-foreground">Patterns across this question category</p>
            </div>
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">
            Building your baseline
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {remaining > 0
            ? `A category-wide report needs ${REPORT_SUBMISSIONS_REQUIRED} graded ${report.submissionTypeLabel} responses. You have ${completed}; submit ${remaining} more to reveal reliable patterns across different questions.`
            : `Your ${report.submissionTypeLabel} category report is being prepared from your graded responses.`}
        </p>
      </section>
    );
  }

  const categoryReport = report.latestReport;
  const strength = categoryReport.strengths[0] ?? categoryReport.resolvedWins[0];
  const focus = categoryReport.growthAreas[0];
  const strategy = categoryReport.nextSteps[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50">
      <div className="border-b border-brand-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <TrendingUp size={20} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-bold text-foreground">{report.submissionTypeLabel} Progress Report</h3>
              <p className="text-xs font-medium text-muted-foreground">Patterns across this question category</p>
            </div>
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">
            {STATUS_LABELS[categoryReport.trajectory]}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{categoryReport.overview}</p>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <ProgressItem
          icon={<Sparkles size={16} />}
          label="Category strength"
          value={strength?.insight ?? "More graded responses will make your recurring strengths clearer."}
        />
        <ProgressItem
          icon={<Target size={16} />}
          label="Recurring focus"
          value={focus?.insight ?? "No recurring weakness is established strongly enough to report yet."}
        />
        <ProgressItem
          icon={<ArrowRight size={16} />}
          label="Practice priority"
          value={strategy?.action ?? "Keep applying the category-level strengths identified in this report."}
        />
      </div>

      <div className="border-t border-brand-100 px-5 py-4 text-right sm:px-6">
        <Link
          href={`/personal-report?type=${encodeURIComponent(report.submissionType)}`}
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-900"
        >
          Open full category report <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ProgressItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white/80 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
        {icon} {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{value}</p>
    </div>
  );
}
