"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Save, GripVertical, Trash2, Plus, ChevronDown } from "lucide-react";
import type { Question, QuestionCategory, Difficulty } from "@/lib/types";
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/types";

interface Props {
  availableQuestions: Question[];
  initialExam?: {
    id: string;
    title: string;
    description: string | null;
    timeLimitMinutes: number;
    startsAt: string;
    endsAt: string;
    isPublished: boolean;
    questions: { q: Question; marks: number }[];
  };
  locked?: boolean;
}

function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ExamBuilderClient({ availableQuestions, initialExam, locked = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(initialExam?.title ?? "");
  const [description, setDescription] = useState(initialExam?.description ?? "");
  const [timeLimit, setTimeLimit] = useState(initialExam?.timeLimitMinutes ?? 30);
  const [startsAt, setStartsAt] = useState(toLocalInput(initialExam?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initialExam?.endsAt));
  
  // Selected questions with order and marks
  const [selectedQuestions, setSelectedQuestions] = useState<{q: Question, marks: number}[]>(initialExam?.questions ?? []);

  const handleAddBlankQuestion = () => {
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const q: Question = {
      id: tempId,
      prompt: "",
      category: "basic_paragraph",
      difficulty: "medium",
      marks: 10,
      source: null,
      space_hint: null,
      max_images: 2,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: null
    };
    setSelectedQuestions([...selectedQuestions, { q, marks: 10 }]);
  };

  const removeQuestion = (id: string) => {
    setSelectedQuestions(selectedQuestions.filter(x => x.q.id !== id));
  };

  const handleSave = async (publish: boolean) => {
    if (locked) {
      alert("This exam is locked because an official attempt has started. Use Extend Timer for deadline changes.");
      return;
    }
    if (!title || !startsAt || !endsAt) {
      alert("Please fill in all required exam details.");
      return;
    }
    if (publish && selectedQuestions.length === 0) {
      alert("Please add at least one question to publish the exam.");
      return;
    }
    
    setLoading(true);
    try {
      // First, save any temporary questions
      const finalQuestions = [];
      for (let i = 0; i < selectedQuestions.length; i++) {
        const sq = selectedQuestions[i];
        if (sq.q.id.startsWith("temp_")) {
          // POST to create question
          const qRes = await fetch("/api/admin/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: sq.q.prompt || "Untitled Question",
              category: sq.q.category,
              difficulty: sq.q.difficulty,
              marks: sq.marks,
            })
          });
          if (!qRes.ok) throw new Error("Failed to create custom question");
          const qData = await qRes.json();
          finalQuestions.push({
            questionId: qData.id,
            orderIndex: i,
            marks: sq.marks
          });
        } else {
          finalQuestions.push({
            questionId: sq.q.id,
            orderIndex: i,
            marks: sq.marks
          });
        }
      }

      const res = await fetch(initialExam ? `/api/admin/exams/${initialExam.id}` : "/api/admin/exams", {
        method: initialExam ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          timeLimitMinutes: timeLimit,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          isPublished: initialExam ? initialExam.isPublished : publish,
          questions: finalQuestions
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save exam");
      }

      router.push("/admin/exams");
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {locked && (
        <div className="md:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The exam definition is read-only because an official attempt has started. Use the exam list&apos;s Extend Timer action for deadline changes.
        </div>
      )}
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
            <button 
              onClick={handleAddBlankQuestion}
              className="bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-100 transition-colors flex items-center gap-1 border border-brand-200"
            >
              <Plus size={16} /> Write Question
            </button>
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
                    {sq.q.id.startsWith("temp_") ? (
                      <div className="space-y-2">
                        <textarea
                          value={sq.q.prompt}
                          onChange={(e) => {
                            const newArr = [...selectedQuestions];
                            newArr[index].q.prompt = e.target.value;
                            setSelectedQuestions(newArr);
                          }}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                          placeholder="Type your custom question here..."
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={sq.q.category}
                            onChange={(e) => {
                              const newArr = [...selectedQuestions];
                              newArr[index].q.category = e.target.value as QuestionCategory;
                              setSelectedQuestions(newArr);
                            }}
                            className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                          <select
                            value={sq.q.difficulty}
                            onChange={(e) => {
                              const newArr = [...selectedQuestions];
                              newArr[index].q.difficulty = e.target.value as Difficulty;
                              setSelectedQuestions(newArr);
                            }}
                            className="bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-foreground line-clamp-1">{sq.q.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-1">{sq.q.category} • Difficulty: {sq.q.difficulty}</p>
                      </>
                    )}
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
          {!initialExam && (
            <button
              onClick={() => handleSave(false)}
              disabled={loading || locked}
              className="w-full bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Save as Draft
            </button>
          )}
          <button
            onClick={() => handleSave(true)}
            disabled={loading || locked}
            className="w-full bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} /> {initialExam ? "Save Changes" : "Save & Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
