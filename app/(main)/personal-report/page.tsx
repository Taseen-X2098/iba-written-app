import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Lightbulb,
  Lock,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { getPersonalReportPageData } from "@/lib/learning/progression";
import type {
  ProgressionReportInsight,
  ProgressionReportNextStep,
  ProgressionStatus,
} from "@/lib/types";

const STATUS_LABELS: Record<ProgressionStatus, string> = {
  building: "Building your baseline",
  improving: "Improving",
  steady: "Steady",
  needs_attention: "Needs focused attention",
};

const REPORT_SUBMISSIONS_REQUIRED = 3;

export default async function PersonalReportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requirePageUser();
  const data = await getPersonalReportPageData(user.id);
  const { type } = await searchParams;

  if (!data.access) return <LockedPersonalReport />;

  const selected = data.categories.find((category) => category.submissionType === type)
    ?? data.categories[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <TrendingUp size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-foreground">Personal Report</h1>
            <p className="text-sm text-muted-foreground">
              Evidence-backed progression kept separate for every writing type.
            </p>
          </div>
        </div>
      </header>

      {data.categories.length === 0 || !selected ? (
        <section className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-10 text-center">
          <Sparkles className="mx-auto text-brand-500" size={42} aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold">Your personal report is not ready yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            Submit and receive grades for three responses of the same writing type to form your first personal report. You have not submitted any graded responses yet.
          </p>
          <Link href="/questions" prefetch={false} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            Start practising <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          <nav className="mb-6 flex gap-2 overflow-x-auto pb-2" aria-label="Writing type reports">
            {data.categories.map((category) => {
              const active = category.submissionType === selected.submissionType;
              return (
                <Link
                  key={category.submissionType}
                  href={`/personal-report?type=${encodeURIComponent(category.submissionType)}`}
                  prefetch={false}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border bg-card text-muted-foreground hover:border-brand-300 hover:text-brand-800"
                  }`}
                >
                  {category.submissionTypeLabel}
                </Link>
              );
            })}
          </nav>

          <section className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50 shadow-sm">
            <div className="border-b border-brand-100 p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{selected.submissionTypeLabel}</p>
                  <h2 className="mt-2 text-2xl font-black text-foreground">
                    {selected.latestReport?.title ?? "Personal Progression Report"}
                  </h2>
                </div>
                <span className="rounded-full border border-brand-200 bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-800">
                  {STATUS_LABELS[selected.latestReport?.trajectory ?? selected.snapshot.status]}
                </span>
              </div>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
                {selected.latestReport?.overview ?? selected.snapshot.headline}
              </p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-3 sm:p-8">
              <SnapshotCard icon={<Sparkles size={17} />} label="Recent win" value={selected.snapshot.recentWin} />
              <SnapshotCard icon={<Target size={17} />} label="Current focus" value={selected.snapshot.focusArea} />
              <SnapshotCard icon={<ArrowRight size={17} />} label="Next action" value={selected.snapshot.nextStep} />
            </div>
          </section>

          {selected.latestReport ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <InsightSection
                title="Strengths to preserve"
                icon={<Sparkles size={18} />}
                tone="emerald"
                insights={selected.latestReport.strengths}
                empty="Your next evaluated response will add more evidence about stable strengths."
              />
              <InsightSection
                title="Growth areas"
                icon={<Target size={18} />}
                tone="amber"
                insights={selected.latestReport.growthAreas}
                empty="No established recurring weakness is strong enough to report yet."
              />
              <InsightSection
                title="Resolved wins"
                icon={<CheckCircle2 size={18} />}
                tone="brand"
                insights={selected.latestReport.resolvedWins}
                empty="A weakness will appear here only after later writing positively demonstrates that it has been fixed."
              />
              <NextStepsSection steps={selected.latestReport.nextSteps} />
            </div>
          ) : (
            <ReportPendingNotice totalGraded={selected.totalGraded} submissionTypeLabel={selected.submissionTypeLabel} />
          )}
        </>
      )}
    </div>
  );
}

function LockedPersonalReport() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-brand-50 p-7 shadow-sm sm:p-10">
        <Crown className="absolute -right-8 -top-8 text-amber-200/60" size={180} aria-hidden="true" />
        <div className="relative max-w-2xl">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <Lock size={22} aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-widest text-amber-700">Subscriber feature</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Personal Report</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            See a private report for each writing type, backed by quotations and patterns from your own work—not generic advice. It recognizes demonstrated improvements, flags repeated mistakes, and turns the evidence into a focused practice strategy.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["Separate report for every writing type", "Evidence-backed strengths and weaknesses", "Recognition when an old problem is fixed", "A personal next-step practice plan"].map((benefit) => (
              <div key={benefit} className="flex items-start gap-2 rounded-xl border border-amber-100 bg-white/80 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />
                {benefit}
              </div>
            ))}
          </div>
          <Link href="/subscription" prefetch={false} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-3 text-sm font-bold text-white hover:bg-amber-800">
            Unlock your personal report <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SnapshotCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white/85 p-5">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-700">{icon}{label}</div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{value}</p>
    </div>
  );
}

function ReportPendingNotice({
  totalGraded,
  submissionTypeLabel,
}: {
  totalGraded: number;
  submissionTypeLabel: string;
}) {
  const remaining = Math.max(REPORT_SUBMISSIONS_REQUIRED - totalGraded, 0);
  const needsMoreSubmissions = remaining > 0;

  return (
    <section className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-6">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 shrink-0 text-brand-600" size={22} aria-hidden="true" />
        <div>
          <h2 className="font-bold text-foreground">
            {needsMoreSubmissions ? "Your full personal report is not ready yet" : "Your full personal report is being prepared"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {needsMoreSubmissions
              ? `You have ${totalGraded} of ${REPORT_SUBMISSIONS_REQUIRED} graded ${submissionTypeLabel} submission${totalGraded === 1 ? "" : "s"}. Submit ${remaining} more graded response${remaining === 1 ? "" : "s"} of this same writing type before we can form a reliable personal report.`
              : `You have submitted the ${REPORT_SUBMISSIONS_REQUIRED} graded ${submissionTypeLabel} responses needed to form your report. It is being prepared now.`}
          </p>
        </div>
      </div>
    </section>
  );
}

function InsightSection({
  title,
  icon,
  tone,
  insights,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "brand";
  insights: ProgressionReportInsight[];
  empty: string;
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50/40 text-emerald-800",
    amber: "border-amber-200 bg-amber-50/40 text-amber-800",
    brand: "border-brand-200 bg-brand-50/40 text-brand-800",
  };
  return (
    <section className={`rounded-2xl border p-6 ${tones[tone]}`}>
      <h2 className="flex items-center gap-2 font-bold">{icon}{title}</h2>
      <div className="mt-4 space-y-3">
        {insights.length ? insights.map((insight, index) => (
          <div key={`${insight.skill}-${index}`} className="rounded-xl bg-white/85 p-4 text-foreground">
            <h3 className="text-sm font-bold capitalize">{insight.skill}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.insight}</p>
            {insight.evidence ? <p className="mt-2 text-xs italic text-muted-foreground">“{insight.evidence}”</p> : null}
          </div>
        )) : <p className="text-sm leading-6 text-muted-foreground">{empty}</p>}
      </div>
    </section>
  );
}

function NextStepsSection({ steps }: { steps: ProgressionReportNextStep[] }) {
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-6">
      <h2 className="flex items-center gap-2 font-bold text-sky-900"><Lightbulb size={18} />Your practice strategy</h2>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={index} className="rounded-xl bg-white/85 p-4">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-black text-white">{index + 1}</span>
              <div>
                <h3 className="text-sm font-bold">{step.action}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.reason}</p>
                {step.exampleLine ? <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900"><strong>Try:</strong> {step.exampleLine}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
