import { createClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";
import { redirect } from "next/navigation";
import { Trophy, Medal, Star, Clock } from "lucide-react";
import Link from "next/link";

export default async function ExamResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. Fetch Exam Details
  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).single();
  if (!exam) redirect("/exams");

  const now = Date.now();
  const endsAt = new Date(exam.ends_at).getTime();
  const isExamOngoing = now < endsAt;

  if (isExamOngoing) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center animate-fade-in">
        <div className="bg-brand-50 border border-brand-200 rounded-3xl p-12 max-w-lg mx-auto">
          <Clock size={48} className="mx-auto mb-4 text-brand-500" />
          <h1 className="text-2xl font-bold text-brand-900 mb-2">Exam Session Concluded</h1>
          <p className="text-brand-800">
            You have successfully completed this exam. The global timer is still ongoing for other students. Your results and the leaderboard will be revealed after the exam officially ends on <br/><br/>
            <strong>{new Date(exam.ends_at).toLocaleString()}</strong>
          </p>
          <div className="mt-8">
            <Link href="/exams" className="bg-brand-600 text-white font-bold px-8 py-3 rounded-xl shadow-md hover:bg-brand-700 transition-colors inline-block">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isExamOngoing && !exam.results_published) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center animate-fade-in">
        <div className="bg-brand-50 border border-brand-200 rounded-3xl p-12 max-w-lg mx-auto">
          <Clock size={48} className="mx-auto mb-4 text-brand-500" />
          <h1 className="text-2xl font-bold text-brand-900 mb-2">Results Pending</h1>
          <p className="text-brand-800">
            The exam has concluded, but grading is currently in progress. Your results and the leaderboard will be published shortly.
          </p>
          <div className="mt-8">
            <Link href="/exams" className="bg-brand-600 text-white font-bold px-8 py-3 rounded-xl shadow-md hover:bg-brand-700 transition-colors inline-block">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Fetch User's Result
  const { data: myResult } = await supabase
    .from("exam_results")
    .select("*")
    .eq("exam_id", id)
    .eq("user_id", user.id)
    .single();

  // 3. Leaderboard Caching (Check-Fetch-Store)
  const redis = getRedis();
  const cacheKey = CacheKeys.leaderboard(id);
  let leaderboard: any[] = [];
  
  const cached = await redis.get(cacheKey);
  if (cached && Array.isArray(cached)) {
    leaderboard = cached;
  } else {
    // Fetch from DB
    const { data: topResults, error } = await supabase
      .from("exam_results")
      .select(`
        id, 
        user_id, 
        total_score, 
        max_score,
        profiles ( name, institute )
      `)
      .eq("exam_id", id)
      .order("total_score", { ascending: false })
      .limit(50);
      
    if (!error && topResults) {
      leaderboard = topResults;
      // Background async update to redis
      redis.set(cacheKey, leaderboard, { ex: CacheTTL.LEADERBOARD }).catch(console.error);
    }
  }

  // Find my rank if not in top 50 (simplification for UI)
  const myRank = leaderboard.findIndex(r => r.user_id === user.id) + 1;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-foreground">{exam.title} - Results</h1>
        <p className="text-muted-foreground mt-2">See how you performed compared to your peers.</p>
      </div>

      {myResult ? (
        <div className="bg-brand-600 text-white rounded-3xl p-8 mb-12 shadow-xl shadow-brand-200/50 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Trophy size={120} />
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-1 opacity-90">Your Score</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black">{myResult.total_score}</span>
              <span className="text-xl font-medium opacity-80">/ {myResult.max_score}</span>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-white/10 rounded-2xl p-4 min-w-[120px] text-center backdrop-blur-sm">
              <p className="text-sm font-medium opacity-80 mb-1">Rank</p>
              <p className="text-2xl font-bold">{myRank > 0 ? `#${myRank}` : 'N/A'}</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-4 min-w-[120px] text-center backdrop-blur-sm">
              <p className="text-sm font-medium opacity-80 mb-1">Status</p>
              <p className="text-xl font-bold">{myResult.total_score >= myResult.max_score * 0.5 ? 'Passed' : 'Failed'}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center mb-12">
          <Clock size={32} className="mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">You didn&apos;t take this exam</h2>
          <Link href="/exams" className="text-brand-600 hover:underline mt-2 inline-block text-sm font-medium">
            View available exams
          </Link>
        </div>
      )}

      {/* Leaderboard */}
      <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
        <Medal className="text-yellow-500" /> Top Performers Leaderboard
      </h3>
      
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-4 font-medium text-muted-foreground w-20">Rank</th>
              <th className="px-6 py-4 font-medium text-muted-foreground">Student</th>
              <th className="px-6 py-4 font-medium text-muted-foreground text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                  No results published yet.
                </td>
              </tr>
            ) : (
              leaderboard.map((row: any, index: number) => {
                const isMe = row.user_id === user.id;
                return (
                  <tr key={row.id} className={`${isMe ? 'bg-brand-50/50' : 'hover:bg-muted/30'} transition-colors`}>
                    <td className="px-6 py-4">
                      {index === 0 ? <Medal size={20} className="text-yellow-500" /> : 
                       index === 1 ? <Medal size={20} className="text-gray-400" /> : 
                       index === 2 ? <Medal size={20} className="text-amber-600" /> : 
                       <span className="font-medium text-muted-foreground pl-2">{index + 1}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${isMe ? 'text-brand-700' : 'text-foreground'}`}>
                          {row.profiles.name} {isMe && "(You)"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{row.profiles.institute}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-foreground text-lg">{row.total_score}</span>
                      <span className="text-muted-foreground text-xs font-medium ml-1">/ {row.max_score}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <p className="text-center text-xs text-muted-foreground mt-4">
        Leaderboard updates every hour.
      </p>
    </div>
  );
}
