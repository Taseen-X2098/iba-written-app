"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Save, GripVertical, Trash2, Plus } from "lucide-react";
import type { Question } from "@/lib/types";

interface Props {
  availableQuestions: Question[];
}

export default function ExamBuilderClient({ availableQuestions }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  
  // Selected questions with order and marks
  const [selectedQuestions, setSelectedQuestions] = useState<{q: Question, marks: number}[]>([]);

  const handleAddQuestion = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const qId = e.target.value;
    if (!qId) return;
    const q = availableQuestions.find(x => x.id === qId);
    if (q && !selectedQuestions.find(x => x.q.id === qId)) {
      setSelectedQuestions([...selectedQuestions, { q, marks: q.marks }]);
    }
    e.target.value = "";
  };

  const removeQuestion = (id: string) => {
    setSelectedQuestions(selectedQuestions.filter(x => x.q.id !== id));
  };

  const handleSave = async (publish: boolean) => {
    if (!title || !startsAt || !endsAt || selectedQuestions.length === 0) {
      alert("Please fill in all required fields and select at least one question.");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          timeLimitMinutes: timeLimit,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          isPublished: publish,
          questions: selectedQuestions.map((sq, i) => ({
            questionId: sq.q.id,
            orderIndex: i,
            marks: sq.marks
          }))
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save exam");
      }

      router.push("/admin/exams");
      router.refresh();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {/* Configuration Form */}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Exam Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Weekly Assessment 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 h-24"
                placeholder="Instructions for the students..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Start Time *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                  <input 
                    type="datetime-local" 
                    value={startsAt}
                    onChange={e => setStartsAt(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">End Time *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
                  <input 
                    type="datetime-local" 
                    value={endsAt}
                    onChange={e => setEndsAt(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-foreground">Questions ({selectedQuestions.length})</h2>
            <select 
              onChange={handleAddQuestion}
              className="bg-brand-50 border border-brand-100 text-brand-700 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">+ Add Question</option>
              {availableQuestions.filter(q => !selectedQuestions.find(sq => sq.q.id === q.id)).map(q => (
                <option key={q.id} value={q.id}>{q.prompt.slice(0, 50)}...</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {selectedQuestions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
                Select a question from the dropdown to add it to the exam.
              </div>
            ) : (
              selectedQuestions.map((sq, index) => (
                <div key={sq.q.id} className="flex items-center gap-3 bg-background border border-border rounded-lg p-3 group">
                  <div className="text-muted-foreground cursor-grab">
                    <GripVertical size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{sq.q.prompt}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sq.q.category} • Difficulty: {sq.q.difficulty}</p>
                  </div>
                  <div className="w-20">
                    <input 
                      type="number"
                      value={sq.marks}
                      onChange={(e) => {
                        const newArr = [...selectedQuestions];
                        newArr[index].marks = Number(e.target.value);
                        setSelectedQuestions(newArr);
                      }}
                      className="w-full bg-muted border border-border rounded px-2 py-1 text-sm text-center"
                      title="Marks"
                    />
                  </div>
                  <button 
                    onClick={() => removeQuestion(sq.q.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar / Actions */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Exam Settings</h2>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Time Limit (minutes)</label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
              <input 
                type="number" 
                value={timeLimit}
                onChange={e => setTimeLimit(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total marks: {selectedQuestions.reduce((sum, item) => sum + item.marks, 0)}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <button
            onClick={() => handleSave(false)}
            disabled={loading}
            className="w-full bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={loading}
            className="w-full bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} /> Save & Publish
          </button>
        </div>
      </div>
    </div>
  );
}
