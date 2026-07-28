"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clock, Upload, Loader2, CheckCircle, AlertCircle, Image as ImageIcon } from "lucide-react";
import type { Exam } from "@/lib/types";

interface Props {
  exam: Exam;
  examQuestions: any[];
  userId: string;
}

export default function ExamTakerClient({ exam, examQuestions, userId }: Props) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<number>(exam.time_limit_minutes * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for each question: OCR text, edited text, uploading state
  const [answers, setAnswers] = useState<Record<string, { ocrText: string, editedText: string, uploading: boolean, error?: string }>>({});

  useEffect(() => {
    // Initialize empty answers
    const initial: any = {};
    examQuestions.forEach(eq => {
      initial[eq.id] = { ocrText: "", editedText: "", uploading: false };
    });
    setAnswers(initial);

    // Timer logic
    const storageKey = `exam_start_${exam.id}_${userId}`;
    let startTime = localStorage.getItem(storageKey);
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem(storageKey, startTime);
    }

    const interval = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - parseInt(startTime as string)) / 1000);
      const remaining = Math.max(0, (exam.time_limit_minutes * 60) - elapsedSecs);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        handleSubmit(); // Auto-submit when time's up
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileUpload = async (eqId: string, file: File) => {
    setAnswers(prev => ({ ...prev, [eqId]: { ...prev[eqId], uploading: true, error: undefined } }));
    
    try {
      const formData = new FormData();
      formData.append("image", file);
      
      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "OCR failed");
      
      setAnswers(prev => ({ 
        ...prev, 
        [eqId]: { ...prev[eqId], ocrText: data.text, editedText: data.text, uploading: false } 
      }));
    } catch (err: any) {
      setAnswers(prev => ({ 
        ...prev, 
        [eqId]: { ...prev[eqId], uploading: false, error: err.message } 
      }));
    }
  };

  const updateText = (eqId: string, text: string) => {
    setAnswers(prev => ({ 
      ...prev, 
      [eqId]: { ...prev[eqId], editedText: text } 
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      // Send all answers to submission endpoint
      const payload = {
        examId: exam.id,
        answers: Object.entries(answers).map(([eqId, data]) => ({
          examQuestionId: eqId,
          ocrText: data.ocrText,
          editedText: data.editedText
        }))
      };

      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Submission failed");

      // Clear timer and redirect to results
      localStorage.removeItem(`exam_start_${exam.id}_${userId}`);
      router.push(`/exams/${exam.id}/results`);
      router.refresh();
      
    } catch (err: any) {
      alert(`Submission Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 pb-32 animate-fade-in">
      {/* Sticky Header */}
      <div className="sticky top-4 z-50 bg-card border border-border rounded-2xl p-4 mb-8 shadow-lg shadow-black/5 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground line-clamp-1">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">{examQuestions.length} Questions</p>
        </div>
        
        <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
          timeLeft < 300 ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-brand-50 border-brand-200 text-brand-700'
        }`}>
          <Clock size={20} />
          <span className="font-mono font-bold text-xl tracking-wider">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-8">
        {examQuestions.map((eq, index) => {
          const ans = answers[eq.id];
          if (!ans) return null;

          return (
            <div key={eq.id} className="bg-card border border-border rounded-2xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <h3 className="font-bold text-foreground">Question {index + 1}</h3>
                </div>
                <span className="text-sm font-bold text-muted-foreground">{eq.marks} Marks</span>
              </div>
              
              <div className="prose prose-sm max-w-none text-foreground mb-6">
                <p className="whitespace-pre-wrap font-medium">{eq.questions.prompt}</p>
              </div>

              {/* Upload or Editor */}
              {!ans.editedText && !ans.uploading ? (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-all">
                  <input 
                    type="file" 
                    accept="image/*"
                    capture="environment"
                    className="hidden" 
                    id={`upload-${eq.id}`}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(eq.id, e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor={`upload-${eq.id}`} className="cursor-pointer flex flex-col items-center">
                    <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mb-4">
                      <ImageIcon size={24} />
                    </div>
                    <span className="font-bold text-foreground block mb-1">Upload Handwritten Answer</span>
                    <span className="text-xs text-muted-foreground">Take a photo of your written answer</span>
                  </label>
                  {ans.error && <p className="text-red-500 text-sm mt-3">{ans.error}</p>}
                </div>
              ) : ans.uploading ? (
                <div className="border border-border rounded-xl p-12 text-center flex flex-col items-center bg-muted/30">
                  <Loader2 className="animate-spin text-brand-500 mb-4" size={32} />
                  <p className="font-medium text-muted-foreground animate-pulse">Extracting text via AI...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-green-600 flex items-center gap-1">
                      <CheckCircle size={14} /> Text Extracted
                    </span>
                    <label htmlFor={`reupload-${eq.id}`} className="text-xs font-medium text-brand-600 hover:underline cursor-pointer">
                      Re-upload Image
                    </label>
                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden" 
                      id={`reupload-${eq.id}`}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(eq.id, e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                  <textarea
                    value={ans.editedText}
                    onChange={(e) => updateText(eq.id, e.target.value)}
                    className="w-full h-48 bg-background border border-border rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none font-medium text-foreground/90 leading-relaxed"
                    placeholder="Your answer will appear here..."
                  />
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <AlertCircle size={12} /> Please review the extracted text and correct any spelling mistakes before submitting.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border z-50">
        <div className="max-w-4xl mx-auto flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-brand-200 hover:bg-brand-700 transition-all flex items-center gap-2 disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {isSubmitting ? "Submitting Exam..." : "Submit Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
