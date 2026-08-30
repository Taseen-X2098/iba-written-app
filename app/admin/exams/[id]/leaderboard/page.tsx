import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Medal, Trophy, Users } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LeaderboardResult = {
  user_id: string;
  total_score: number | string;
  max_score: number;
  rank: number | null;
  profiles: unknown;
};

function profileFromJoin(value: unknown) {
  const profile = Array.isArray(value) ? value[0] : value;
  if (!profile || typeof profile !== "object") {
    return { name: "Student", institute: "" };
  }

  const record = profile as Record<string, unknown>;
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Student",
    institute: typeof record.institute === "string" ? record.institute : "",
  };
}

export default async function AdminExamLeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminUser();
  const admin = await createAdminClient();
  const [{ data: exam }, { data: results, error }] = await Promise.all([
    admin
      .from("exams")
      .select("id, title, results_published")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("exam_results")
      .select("user_id, total_score, max_score, rank, profiles(name, institute)")
      .eq("exam_id", id)
      .order("rank", { ascending: true }),
  ]);

  if (!exam) notFound();

  if (error) {
    console.error("Unable to load the admin leaderboard", error);
  }

  const leaderboard = ((results ?? []) as LeaderboardResult[]).map((result) => {
    const profile = profileFromJoin(result.profiles);
    const totalScore = Number(result.total_score);
    const maxScore = Number(result.max_score);
    return {
      userId: result.user_id,
      totalScore,
      maxScore,
      rank: result.rank,
      percentage: maxScore > 0 ? totalScore * 100 / maxScore : 0,
      ...profile,
    };
  });

  const topScore = leaderboard.length ? Math.max(...leaderboard.map((row) => row.totalScore)) : 0;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in">
      <Link
        href={`/admin/exams/${id}/submissions`}
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Submissions
      </Link>

      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
            <Trophy size={18} /> Leaderboard
          </div>
          <h1 className="text-2xl font-bold text-foreground">{exam.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Final competition ranks and scores for this exam.
          </p>
        </div>
        <span className={`inline-flex self-start items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
          exam.results_published
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {exam.results_published ? "Results Published" : "Results Not Published"}
        </span>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users size={17} /> Participants
          </div>
          <p className="mt-2 text-3xl font-black text-foreground">{leaderboard.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Medal size={17} /> Top score
          </div>
          <p className="mt-2 text-3xl font-black text-foreground">{topScore}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {error ? (
          <div className="p-10 text-center text-sm text-red-700">
            The leaderboard could not be loaded. Refresh the page to try again.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-5 py-4">Rank</th>
                  <th className="px-5 py-4">Student</th>
                  <th className="px-5 py-4 text-right">Score</th>
                  <th className="px-5 py-4 text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((row) => (
                  <tr key={row.userId} className={topRankClass(row.rank)}>
                    <td className="px-5 py-4 font-black">
                      {row.rank && row.rank <= 3 ? (
                        <span aria-label={`Rank ${row.rank}`}>
                          {["🥇", "🥈", "🥉"][row.rank - 1]} #{row.rank}
                        </span>
                      ) : row.rank ? `#${row.rank}` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.institute || "Institute not provided"}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-black">
                      {row.totalScore}
                      <span className="text-xs text-muted-foreground"> / {row.maxScore}</span>
                    </td>
                    <td className="px-5 py-4 text-right font-black">{row.percentage.toFixed(2)}%</td>
                  </tr>
                ))}
                {!leaderboard.length && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-muted-foreground">
                      No ranked results are available for this exam.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function topRankClass(rank: number | null) {
  if (rank === 1) return "bg-amber-50/80";
  if (rank === 2) return "bg-slate-50/80";
  if (rank === 3) return "bg-orange-50/70";
  return "";
}
