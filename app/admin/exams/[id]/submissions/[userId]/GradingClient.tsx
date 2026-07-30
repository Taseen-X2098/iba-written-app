"use client";

import { useState } from "react";
import { Loader2, Bot, Save, CheckCircle } from "lucide-react";

export default function GradingClient({ submissions }: { submissions: any[] }) {
  const [grades, setGrades] = useState<Record<string, any>>(
    submissions.reduce((acc, sub) => {
      acc[sub.id] = {
        score: sub.grading_result ? (parseFloat(sub.grading_result.studentFeedback?.score?.split("/")[0]) || 0) : "",
        feedback: sub.grading_result?.studentFeedback?.summary || "",
        highlights: sub.grading_result?.studentFeedback?.highlights || [],
        saving: false,
        aiLoading: false,
        saved: !!sub.grading_result
      };
      return acc;
    }, {})
  );

  const handleGradeWithAI = async (sub: any) => {
    setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], aiLoading: true } }));
    try {
      const eq = sub.exam_questions;
      const res = await fetch("/api/admin/grade-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedText: sub.edited_text,
          category: eq.questions.category,
          marks: eq.marks
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setGrades(prev => ({
        ...prev,
        [sub.id]: {
          ...prev[sub.id],
          score: data.earned,
          feedback: data.result.studentFeedback.summary,
          highlights: data.result.studentFeedback.highlights,
          aiLoading: false,
          saved: false // Needs saving
        }
      }));
    } catch (err: any) {
      alert("AI Grading Error: " + err.message);
      setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], aiLoading: false } }));
    }
  };

  const handleSaveGrade = async (sub: any) => {
    const current = grades[sub.id];
    if (current.score === "") {
      alert("Please enter a score");
      return;
    }

    setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], saving: true } }));
    
    // We update the submission directly in the DB from the client for simplicity, 
    // but typically we'd use an API route. Since admins have RLS bypass via admin API,
    // wait, we need an API route because RLS doesn't allow admins to update exam_submissions directly without policies.
    // Let's create/use an API route for saving individual grades.
    try {
      const res = await fetch("/api/admin/save-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: sub.id,
          score: current.score,
          maxMarks: sub.exam_questions.marks,
          feedback: current.feedback,
          highlights: current.highlights
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], saving: false, saved: true } }));
    } catch (err: any) {
      alert("Save Error: " + err.message);
      setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], saving: false } }));
    }
  };

  return (
    <div className="space-y-8 pb-24">
      {submissions.map((sub, index) => {
        const eq = sub.exam_questions;
        const q = eq.questions;
        const state = grades[sub.id];

        return (
          <div key={sub.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted/50 p-6 border-b border-border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-brand-600 mb-1">Question {index + 1} ({eq.marks} Marks)</h3>
                  <div className="text-foreground font-medium" dangerouslySetInnerHTML={{ __html: q.title }} />
                </div>
                <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-md font-bold uppercase">{q.category}</span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Student Answer */}
              <div>
                <h4 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Student Answer</h4>
                {sub.edited_text ? (
                  <div className="bg-brand-50/50 p-4 rounded-xl text-foreground text-sm border border-brand-100 min-h-[150px] whitespace-pre-wrap">
                    {sub.edited_text}
                  </div>
                ) : (
                  <div className="bg-muted p-4 rounded-xl text-muted-foreground text-sm italic min-h-[150px] flex items-center justify-center">
                    No answer provided.
                  </div>
                )}
              </div>

              {/* Grading Form */}
              <div className="bg-muted/30 p-6 rounded-xl border border-border flex flex-col h-full">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Grade</h4>
                  <button
                    onClick={() => handleGradeWithAI(sub)}
                    disabled={state.aiLoading || !sub.edited_text}
                    className="flex items-center gap-1.5 bg-brand-100 text-brand-700 hover:bg-brand-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {state.aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                    {state.aiLoading ? "Analyzing..." : "Ask AI"}
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <input 
                    type="number"
                    min="0"
                    max={eq.marks}
                    step="0.5"
                    value={state.score}
                    onChange={(e) => setGrades(prev => ({...prev, [sub.id]: {...prev[sub.id], score: e.target.value, saved: false}}))}
                    className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Score"
                  />
                  <span className="text-muted-foreground font-bold text-lg">/ {eq.marks}</span>
                </div>

                <div className="flex-grow mb-4">
                  <label className="text-xs font-bold text-muted-foreground block mb-2">Feedback (Optional)</label>
                  <textarea
                    value={state.feedback}
                    onChange={(e) => setGrades(prev => ({...prev, [sub.id]: {...prev[sub.id], feedback: e.target.value, saved: false}}))}
                    className="w-full h-full min-h-[100px] px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    placeholder="Add feedback for the student..."
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => handleSaveGrade(sub)}
                    disabled={state.saving}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      state.saved 
                        ? "bg-green-100 text-green-700 border border-green-200" 
                        : "bg-brand-600 text-white hover:bg-brand-700 shadow-md"
                    }`}
                  >
                    {state.saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : state.saved ? (
                      <CheckCircle size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {state.saving ? "Saving..." : state.saved ? "Saved" : "Save Grade"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
