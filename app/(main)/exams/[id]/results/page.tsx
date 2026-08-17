import Link from "next/link";
import { Clock, Medal, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { getPublishedExamResults } from "@/lib/exams/results";

export default async function ExamResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const { page: rawPage } = await searchParams;
  const page = Number(rawPage ?? "1");
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, ends_at, results_published")
    .eq("id", id)
    .single();

  if (!exam) return <StatusCard title="Exam not found" message="This exam is no longer available." />;
  if (!exam.results_published) {
    const ongoing = Date.now() < new Date(exam.ends_at).getTime();
    return (
      <StatusCard
        title={ongoing ? "Submission received" : "Results pending"}
        message={ongoing
          ? `The exam remains open for other students until ${new Date(exam.ends_at).toLocaleString()}. Results stay private until publication.`
          : "Grading is in progress. The leaderboard will appear after every answer has a final grade and an admin publishes the results."}
      />
    );
  }

  const results = await getPublishedExamResults(id, user.id, safePage);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-black">{results.exam.title} — Results</h1>
        <p className="mt-2 text-muted-foreground">Final scores, shared competition ranks, and your detailed feedback.</p>
      </header>

      {results.myResult ? (
        <section className="relative mb-10 flex flex-col items-center justify-between gap-6 overflow-hidden rounded-3xl bg-brand-600 p-8 text-white shadow-xl md:flex-row">
          <Trophy className="absolute right-6 top-3 opacity-10" size={120} />
          <div>
            <p className="font-bold opacity-80">Your score</p>
            <p className="text-5xl font-black">{results.myResult.totalScore}<span className="text-xl opacity-75"> / {results.myResult.maxScore}</span></p>
          </div>
          <div className="rounded-2xl bg-white/10 px-8 py-4 text-center">
            <p className="text-sm opacity-80">Competition rank</p>
            <p className="text-3xl font-black">#{results.myResult.rank ?? "—"}</p>
          </div>
        </section>
      ) : (
        <section className="mb-10 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">You did not take this exam.</section>
      )}

      <section className="mb-12">
        <h2 className="mb-5 flex items-center gap-2 text-xl font-black"><Medal className="text-yellow-500" /> Leaderboard</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr><th className="px-5 py-4">Rank</th><th className="px-5 py-4">Student</th><th className="px-5 py-4 text-right">Score</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.leaderboard.map((row) => {
                const mine = row.user_id === user.id;
                return (
                  <tr key={row.user_id} className={mine ? "bg-brand-50/60" : ""}>
                    <td className="px-5 py-4 font-black">#{row.rank}</td>
                    <td className="px-5 py-4"><p className="font-bold">{row.student_name}{mine ? " (You)" : ""}</p><p className="text-xs text-muted-foreground">{row.institute}</p></td>
                    <td className="px-5 py-4 text-right font-black">{row.total_score}<span className="text-xs text-muted-foreground"> / {row.max_score}</span></td>
                  </tr>
                );
              })}
              {!results.leaderboard.length && <tr><td colSpan={3} className="p-10 text-center text-muted-foreground">No ranked results.</td></tr>}
            </tbody>
          </table>
        </div>
        {results.totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-4">
            {results.page > 1 ? <Link prefetch={false} href={`/exams/${id}/results?page=${results.page - 1}`} className="rounded-lg border border-border px-4 py-2 font-bold">Previous</Link> : <span />}
            <span className="text-sm text-muted-foreground">Page {results.page} of {results.totalPages}</span>
            {results.page < results.totalPages ? <Link prefetch={false} href={`/exams/${id}/results?page=${results.page + 1}`} className="rounded-lg border border-border px-4 py-2 font-bold">Next</Link> : <span />}
          </nav>
        )}
      </section>

      {results.details.length > 0 && (
        <section>
          <h2 className="mb-5 text-xl font-black">Your answers and feedback</h2>
          <div className="space-y-6">
            {results.details.map((detail, index) => (
              <article key={detail.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-4">
                  <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600">Question {index + 1}</p><p className="whitespace-pre-wrap font-medium">{detail.prompt}</p></div>
                  <span className="whitespace-nowrap rounded-full bg-brand-50 px-3 py-1 text-sm font-black text-brand-700">{detail.score}</span>
                </div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your answer</h3>
                <div className="mb-5 whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm">{detail.answer || "No answer"}</div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Feedback</h3>
                <p className="text-sm">{detail.summary}</p>
                {detail.highlights.length > 0 && <div className="mt-4 space-y-2">{detail.highlights.map((highlight, highlightIndex) => <div key={highlightIndex} className="rounded-lg border border-border bg-muted/20 p-3 text-xs"><strong className="block">“{highlight.quote}”</strong>{highlight.comment}</div>)}</div>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="rounded-3xl border border-brand-200 bg-brand-50 p-10">
        <Clock className="mx-auto mb-4 text-brand-600" size={44} />
        <h1 className="text-2xl font-black text-brand-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-brand-800">{message}</p>
        <Link href="/exams" prefetch={false} className="mt-7 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">Back to Exams</Link>
      </div>
    </div>
  );
}

