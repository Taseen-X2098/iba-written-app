import { createClient } from "@/lib/supabase/server";
import { Clock, FileText, Lock, ChevronRight, Trophy, Gift } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Exam } from "@/lib/types";
import { getMainUserContext } from "@/lib/main-user-context";
import { isExamPlan } from "@/lib/exams/access";

export default async function StudentExamsPage() {
  const supabase = await createClient();
  const context = await getMainUserContext();
  if (!context) return null;
  const hasExamPlan = isExamPlan(context.subscription?.plan_type);

  // 2. Fetch published exams
  const [{ data: exams, error }, { data: attempts }] = await Promise.all([
    supabase
      .from("exams")
      .select("*")
      .eq("is_published", true)
      .order("starts_at", { ascending: false }),
    supabase
      .from("exam_attempts")
      .select("exam_id, status, expires_at")
      .eq("user_id", context.user.id)
      .eq("mode", "official"),
  ]);

  // Ignore empty object errors (common in some Supabase edge cases when returning 0 rows)
  if (error && Object.keys(error).length > 0) {
    console.error("Error fetching exams:", error);
  }

  const attemptsByExamId = (attempts || []).reduce((acc: Record<string, any>, attempt: any) => {
    acc[attempt.exam_id] = attempt;
    return acc;
  }, {});

  const safeExams = exams || [];
  const now = new Date().getTime();

  const upcomingOrLiveExams = safeExams.filter((exam: Exam) => new Date(exam.ends_at).getTime() >= now);
  const pastExams = safeExams.filter((exam: Exam) => new Date(exam.ends_at).getTime() < now);

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <FileText size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Weekly Exams</h2>
          <p className="text-sm text-muted-foreground">
            Test yourself under timed conditions and compete on the leaderboard.
          </p>
        </div>
      </div>

      {!hasExamPlan && (
        <div className="mb-8 p-6 bg-brand-50 border border-brand-200 rounded-xl flex items-start gap-4">
          <Lock className="text-brand-600 shrink-0 mt-1" size={24} />
          <div>
            <h3 className="font-bold text-brand-900 text-lg">Paid Exams Locked</h3>
            <p className="text-brand-800 text-sm mt-1 mb-4">
              Free exams are open to you. You need the <strong>Complete Prep</strong> or <strong>Exams Only</strong> plan to participate in other weekly exams.
            </p>
            <Link 
              href="/subscription"
              prefetch={false}
              className="bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-brand-700 transition-colors inline-block"
            >
              Upgrade Plan
            </Link>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {upcomingOrLiveExams.length === 0 ? (
          <div className="md:col-span-2 text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-card/50">
            <FileText size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">No weekly exams are currently scheduled.</p>
          </div>
        ) : (
          upcomingOrLiveExams.map((exam: Exam) => {
            const startsAt = new Date(exam.starts_at).getTime();
            const endsAt = new Date(exam.ends_at).getTime();
            
            let status: "upcoming" | "active" = "upcoming";
            if (now >= startsAt && now <= endsAt) status = "active";

            return (
              <div 
                key={exam.id}
                className={`bg-card border rounded-2xl p-6 transition-all relative overflow-hidden group ${
                  status === "active" ? "border-brand-500 shadow-md shadow-brand-100/50" : "border-border hover:border-brand-300"
                }`}
              >
                {status === "active" && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                      Live Now
                    </div>
                  </div>
                )}

                <div className="mb-2 flex items-center gap-3 pr-16">
                  {exam.is_magnus_only && <MagnusExamLogo />}
                  <h3 className="text-lg font-bold text-foreground">{exam.title}</h3>
                  {exam.is_free && <FreeExamBadge />}
                </div>
                {exam.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{exam.description}</p>
                )}

                <div className="flex flex-col gap-2 mb-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-brand-500" />
                    <span className="font-medium text-foreground">{exam.time_limit_minutes} Minutes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={16} className="opacity-70" />
                    <span>
                      {status === "upcoming" 
                        ? `Starts: ${new Date(exam.starts_at).toLocaleString()}`
                        : `Ends: ${new Date(exam.ends_at).toLocaleString()}`
                      }
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {status === "active" ? (
                    (() => {
                      const attempt = attemptsByExamId[exam.id];
                      const hasSubmitted = attempt?.status === "finalized";
                      const isOngoing = attempt && ["active", "locked"].includes(attempt.status);
                      const canContinue = isOngoing && now < new Date(attempt.expires_at).getTime() + 3 * 60 * 1000;
                      const canEnter = hasExamPlan || exam.is_free || isOngoing;

                      if (hasSubmitted) {
                        return (
                          <Link
                            href={`/exams/${exam.id}/results#my-response`}
                            prefetch={false}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200"
                          >
                            View My Response
                            <ChevronRight size={16} />
                          </Link>
                        );
                      }

                      let buttonText = "Enter Exam";
                      if (canContinue) {
                        buttonText = "Resume Exam";
                      } else if (isOngoing) {
                        buttonText = "Finalize Exam";
                      }

                      return (
                        <Link
                          href={canEnter ? `/exams/${exam.id}` : "#"}
                          prefetch={false}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                            canEnter
                              ? canContinue 
                                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-200/50"
                                : isOngoing 
                                  ? "bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200/50"
                                  : "bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-200/50" 
                              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                          }`}
                        >
                          {canEnter ? buttonText : "Locked"}
                          <ChevronRight size={16} />
                        </Link>
                      );
                    })()
                  ) : (
                    <button disabled className="flex-1 bg-muted text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-bold cursor-not-allowed">
                      Starts Soon
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!hasExamPlan ? (
        <section
          aria-labelledby="past-exams-locked-title"
          className="rounded-2xl border border-brand-200 bg-brand-50 p-6 sm:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <Lock size={22} />
            </div>
            <div>
              <h3 id="past-exams-locked-title" className="text-lg font-bold text-brand-900">
                Past exam practice is locked
              </h3>
              <p className="mt-1 text-sm leading-6 text-brand-800">
                Subscribe to the <strong>Complete Prep</strong> or <strong>Exams Only</strong> plan to view previous exams and practice them.
              </p>
              <Link
                href="/subscription"
                prefetch={false}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                View Plans <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      ) : pastExams.length > 0 ? (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-muted-foreground hover:text-foreground font-bold mb-6 transition-colors">
            <span className="bg-muted px-3 py-1.5 rounded-lg border border-border group-open:bg-brand-50 group-open:text-brand-700 group-open:border-brand-200 transition-colors flex items-center gap-2">
              <ChevronRight size={18} className="group-open:rotate-90 transition-transform" />
              View Past Exams ({pastExams.length})
            </span>
          </summary>
          
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {pastExams.map((exam: Exam) => {
              const hasSubmitted = attemptsByExamId[exam.id]?.status === "finalized";
              return (
                <div
                  key={exam.id}
                  className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0">
                    <div className="bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">
                      Ended
                    </div>
                  </div>

                  <div className="mb-2 flex items-center gap-3 pr-16">
                    {exam.is_magnus_only && <MagnusExamLogo />}
                    <h3 className="text-lg font-bold text-foreground">{exam.title}</h3>
                    {exam.is_free && <FreeExamBadge />}
                  </div>
                  {exam.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{exam.description}</p>
                  )}

                  <div className="flex flex-col gap-2 mb-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-muted-foreground" />
                      <span className="font-medium text-foreground">{exam.time_limit_minutes} Minutes</span>
                    </div>
                    <p className={`text-xs font-bold ${exam.results_published ? "text-green-700" : "text-amber-700"}`}>
                      {exam.results_published ? "Results published" : "Results pending"}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    {hasSubmitted || exam.results_published ? (
                      <Link
                        href={`/exams/${exam.id}/results${hasSubmitted ? "#my-response" : ""}`}
                        prefetch={false}
                        className="flex-1 w-full flex items-center justify-center gap-2 bg-muted text-foreground hover:bg-border px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                      >
                        {hasSubmitted ? <FileText size={16} /> : <Trophy size={16} />}
                        {hasSubmitted
                          ? exam.results_published ? "My Response & Results" : "My Response"
                          : "Leaderboard"}
                      </Link>
                    ) : (
                      <span className="flex-1 w-full rounded-xl bg-muted px-4 py-2.5 text-center text-sm font-bold text-muted-foreground">
                        Results Pending
                      </span>
                    )}
                    {exam.results_published ? (
                      <Link
                        href={`/exams/${exam.id}?practice=true`}
                        prefetch={false}
                        className="flex-1 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200"
                      >
                        <FileText size={16} /> Practice Exam
                      </Link>
                    ) : (
                      <span className="flex-1 w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-center text-sm font-bold text-muted-foreground">
                        Practice after results
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CalendarIcon({ size, className }: { size: number, className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  );
}

function MagnusExamLogo() {
  return (
    <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 p-1" title="Magnus Academy exam">
      <Image src="/magnus/magnus-transparent.png" alt="Magnus Academy" width={28} height={44} className="h-10 w-auto object-contain" />
    </span>
  );
}

function FreeExamBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
      <Gift size={12} /> Free
    </span>
  );
}
