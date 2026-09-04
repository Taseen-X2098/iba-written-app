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
import { FeedbackParagraphs } from "@/components/feedback/feedback-paragraphs";

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
            <h1 className="text-2xl font-black text-foreground">Category Progress Reports</h1>
            <p className="text-sm text-muted-foreground">
              Evidence-backed patterns kept separate for every question category.
            </p>
          </div>
        </div>
      </header>

      {data.categories.length === 0 || !selected ? (
        <section className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-10 text-center">
          <Sparkles className="mx-auto text-brand-500" size={42} aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold">Your category reports are not ready yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-foreground/85">
            Submit and receive grades for three responses in the same question category to reveal patterns that extend beyond any one answer. You have not submitted any graded responses yet.
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

          {selected.latestReport ? (
            <>
              <section className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-50 shadow-sm">
                <div className="border-b border-brand-100 p-6 sm:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{selected.submissionTypeLabel}</p>
                      <h2 className="mt-2 text-2xl font-black text-foreground">
                        {selected.submissionTypeLabel} Progress Report
                      </h2>
                    </div>
                    <span className="rounded-full border border-brand-200 bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-800">
                      {STATUS_LABELS[selected.latestReport.trajectory]}
                    </span>
                  </div>
                  <FeedbackParagraphs
                    text={selected.latestReport.overview}
                    className="mt-5 max-w-3xl space-y-3 text-sm leading-7 text-foreground/85"
                  />
                </div>

                <div className="grid gap-4 p-6 md:grid-cols-3 sm:p-8">
                  <SnapshotCard
                    icon={<Sparkles size={17} />}
                    label="Category strength"
                    value={selected.latestReport.strengths[0]?.insight
                      ?? selected.latestReport.resolvedWins[0]?.insight
                      ?? "More graded responses will make your recurring strengths clearer."}
                  />
                  <SnapshotCard
                    icon={<Target size={17} />}
                    label="Recurring focus"
                    value={selected.latestReport.growthAreas[0]?.insight
                      ?? "No recurring weakness is established strongly enough to report yet."}
                  />
                  <SnapshotCard
                    icon={<ArrowRight size={17} />}
                    label="Practice priority"
                    value={selected.latestReport.nextSteps[0]?.action
                      ?? "Keep applying the category-level strengths identified in this report."}
                  />
                </div>
              </section>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <InsightSection
                  title="Strengths across the category"
                  icon={<Sparkles size={18} />}
                  tone="emerald"
                  insights={selected.latestReport.strengths}
                  empty="Your next evaluated response will add more evidence about stable strengths."
                />
                <InsightSection
                  title="Recurring growth areas"
                  icon={<Target size={18} />}
                  tone="amber"
                  insights={selected.latestReport.growthAreas}
                  empty="No established recurring weakness is strong enough to report yet."
                />
                <InsightSection
                  title="Resolved patterns"
                  icon={<CheckCircle2 size={18} />}
                  tone="brand"
                  insights={selected.latestReport.resolvedWins}
                  empty="A weakness will appear here only after later writing positively demonstrates that it has been fixed."
                />
                <NextStepsSection steps={selected.latestReport.nextSteps} />
              </div>
            </>
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
          <h1 className="mt-2 text-3xl font-black text-foreground">Category Progress Reports</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            See a private report for each question category, built from patterns across multiple responses rather than feedback on one answer. It recognizes demonstrated improvements, flags repeated mistakes, and turns the evidence into a focused practice strategy.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["Separate report for every question category", "Patterns drawn from multiple responses", "Recognition when an old problem is fixed", "A category-level practice strategy"].map((benefit) => (
              <div key={benefit} className="flex items-start gap-2 rounded-xl border border-amber-100 bg-white/80 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />
                {benefit}
              </div>
            ))}
          </div>
          <Link href="/subscription" prefetch={false} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-3 text-sm font-bold text-white hover:bg-amber-800">
            Unlock category reports <ArrowRight size={16} aria-hidden="true" />
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
      <FeedbackParagraphs
        text={value}
        className="mt-3 space-y-2 text-sm leading-6 text-foreground/85"
      />
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
            {needsMoreSubmissions ? "Your category report is not ready yet" : "Your category report is being prepared"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground/85">
            {needsMoreSubmissions
              ? `You have ${totalGraded} of ${REPORT_SUBMISSIONS_REQUIRED} graded ${submissionTypeLabel} submission${totalGraded === 1 ? "" : "s"}. Submit ${remaining} more graded response${remaining === 1 ? "" : "s"} in this category before we can identify reliable patterns across different questions.`
              : `You have submitted the ${REPORT_SUBMISSIONS_REQUIRED} graded ${submissionTypeLabel} responses needed for a category-wide report. It is being prepared now.`}
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
            <FeedbackParagraphs
              text={insight.insight}
              className="mt-1 space-y-2 text-sm leading-6 text-foreground/85"
            />
            {insight.evidence ? <p className="mt-2 text-sm italic leading-6 text-foreground/80">“{insight.evidence}”</p> : null}
          </div>
        )) : <p className="text-sm leading-6 text-foreground/85">{empty}</p>}
      </div>
    </section>
  );
}

function NextStepsSection({ steps }: { steps: ProgressionReportNextStep[] }) {
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-6">
      <h2 className="flex items-center gap-2 font-bold text-sky-900"><Lightbulb size={18} />Category practice strategy</h2>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={index} className="rounded-xl bg-white/85 p-4">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-black text-white">{index + 1}</span>
              <div>
                <h3 className="text-sm font-bold">{step.action}</h3>
                <FeedbackParagraphs
                  text={step.reason}
                  className="mt-1 space-y-2 text-sm leading-6 text-foreground/85"
                />
                {step.exampleLine ? <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900"><strong>Try:</strong> {step.exampleLine}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
