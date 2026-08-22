"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, ChevronDown } from "lucide-react";
import type { QuestionCategory, Difficulty } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { STORY_COMPLETION_MARKS } from "@/lib/questions/story-completion";

export default function QuestionBuilderClient({
  initialData,
}: {
  initialData?: any;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    prompt: initialData?.prompt || "",
    category: (initialData?.category || "argumentative_essay") as QuestionCategory,
    difficulty: (initialData?.difficulty || "medium") as Difficulty,
    marks: initialData?.marks || 10,
    source: initialData?.source || "",
    spaceHint: initialData?.space_hint || "",
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prompt) return;
    
    setLoading(true);
    try {
      const isEditing = !!initialData;
      const res = await fetch("/api/admin/questions", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...form,
          id: initialData?.id 
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save question");
      }

      router.push("/admin/questions");
      router.refresh();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-6 space-y-6">
      <h1 className="text-xl font-semibold mb-6">
        {initialData ? "Edit Question" : "Create New Question"}
      </h1>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Question Prompt *</label>
        <textarea 
          value={form.prompt}
          onChange={e => setForm({...form, prompt: e.target.value})}
          required
          className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 h-32"
          placeholder="Enter the full question text here..."
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Category</label>
          <div className="relative">
            <select 
              value={form.category}
              onChange={e => {
                const category = e.target.value as QuestionCategory;
                setForm({
                  ...form,
                  category,
                  marks: category === "story_completion"
                    && !STORY_COMPLETION_MARKS.includes(form.marks as typeof STORY_COMPLETION_MARKS[number])
                      ? 10
                      : form.marks,
                });
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none relative z-10 pr-10"
            >
              {Object.entries(CATEGORY_LABELS)
                .filter(([key]) => key !== "translation")
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </select>
            <ChevronDown size={16} className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-0" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Difficulty</label>
          <div className="relative">
            <select 
              value={form.difficulty}
              onChange={e => setForm({...form, difficulty: e.target.value as Difficulty})}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none relative z-10 pr-10"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="very_hard">Very Hard</option>
            </select>
            <ChevronDown size={16} className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-0" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Marks</label>
          {form.category === "story_completion" ? (
            <select
              value={form.marks}
              onChange={e => setForm({...form, marks: Number(e.target.value)})}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {STORY_COMPLETION_MARKS.map((marks) => (
                <option key={marks} value={marks}>{marks}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min="1"
              value={form.marks}
              onChange={e => setForm({...form, marks: Number(e.target.value)})}
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Source (Optional)</label>
          <input 
            type="text"
            value={form.source}
            onChange={e => setForm({...form, source: e.target.value})}
            placeholder="e.g. IBA BBA 2022"
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Space Hint (Optional)</label>
        <input 
          type="text"
          value={form.spaceHint}
          onChange={e => setForm({...form, spaceHint: e.target.value})}
          placeholder="e.g. Approx. 1 page"
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {form.category === "story_completion" && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-800">
          Put the instruction first, add a blank line, then add the 30–45-word starter as four lines.
          Students must copy that starter before continuing it. Story Completion questions always allow two images.
        </p>
      )}

      <div className="pt-4 border-t border-border flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Question
        </button>
      </div>
    </form>
  );
}
