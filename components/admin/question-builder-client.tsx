"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import type { QuestionCategory, Difficulty } from "@/lib/types";

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "essay", label: "Essay Writing" },
  { value: "quote_analysis", label: "Quote Analysis" },
  { value: "creative_writing", label: "Creative Writing" },
  { value: "personal_reflection", label: "Personal Reflection" },
  { value: "translation", label: "Translation" },
  { value: "basic_paragraph", label: "Paragraph Writing" },
  { value: "comprehension", label: "Reading Comprehension" },
  { value: "precis", label: "Precis Writing" },
  { value: "grammar", label: "Grammar & Vocabulary" },
];

export default function QuestionBuilderClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    prompt: "",
    category: "essay" as QuestionCategory,
    difficulty: "medium" as Difficulty,
    marks: 10,
    source: "",
    spaceHint: "",
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prompt) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
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
          <select 
            value={form.category}
            onChange={e => setForm({...form, category: e.target.value as QuestionCategory})}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Difficulty</label>
          <select 
            value={form.difficulty}
            onChange={e => setForm({...form, difficulty: e.target.value as Difficulty})}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Marks</label>
          <input 
            type="number"
            min="1"
            value={form.marks}
            onChange={e => setForm({...form, marks: Number(e.target.value)})}
            required
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
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
