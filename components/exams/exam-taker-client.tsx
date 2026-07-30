"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, Upload, Loader2, CheckCircle, AlertCircle, Image as ImageIcon, Save, Camera } from "lucide-react";
import { WebcamCapture } from "@/components/ui/webcam-capture";
import type { Exam } from "@/lib/types";

interface Props {
  exam: Exam;
  examQuestions: any[];
  userId: string;
  serverStartTime: number;
  initialDrafts: Record<string, { ocrText: string; editedText: string }>;
  isPractice?: boolean;
}

export default function ExamTakerClient({ exam, examQuestions, userId, serverStartTime, initialDrafts, isPractice }: Props) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<number>(exam.time_limit_minutes * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [practiceResults, setPracticeResults] = useState<any[] | null>(null);
  
  // State for each question: OCR text, edited text, uploading state, isDirty
  const [answers, setAnswers] = useState<Record<string, { ocrText: string, editedText: string, uploading: boolean, error?: string, isDirty?: boolean, saving?: boolean }>>({});

  useEffect(() => {
    // Initialize answers with drafts if they exist
    const initial: any = {};
    examQuestions.forEach(eq => {
      const draft = initialDrafts[eq.id];
      initial[eq.id] = { 
        ocrText: draft?.ocrText || "", 
        editedText: draft?.editedText || "", 
        uploading: false 
      };
    });
    setAnswers(initial);

    // Timer logic completely relies on serverStartTime
    const interval = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - serverStartTime) / 1000);
      const remaining = Math.max(0, (exam.time_limit_minutes * 60) - elapsedSecs);
      setTimeLeft(remaining);

      // Track ongoing exam in localStorage for global banner
      if (remaining > 0) {
        localStorage.setItem("in_progress_exam", JSON.stringify({
          examId: exam.id,
          title: exam.title,
          isPractice,
          lastUpdatedAt: Date.now()
        }));
        window.dispatchEvent(new Event("in_progress_exam_updated"));
      }

      if (remaining === 0) {
        clearInterval(interval);
        handleSubmit(); // Auto-submit when time's up
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileUpload = async (eqId: string, files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setAnswers(prev => ({ ...prev, [eqId]: { ...prev[eqId], uploading: true, error: undefined } }));
    
    try {
      let combinedText = "";
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append("image", file);
        
        const res = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "OCR failed");
        
        combinedText += (combinedText ? "\n\n" : "") + data.text;
      }
      
      const newText = combinedText;
      setAnswers(prev => ({ 
        ...prev, 
        [eqId]: { ...prev[eqId], ocrText: newText, editedText: newText, uploading: false, isDirty: false } 
      }));

      // Auto-save immediately after OCR completes
      fetch("/api/exam/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: exam.id,
          examQuestionId: eqId,
          ocrText: newText,
          editedText: newText,
          isPractice: isPractice
        })
      }).catch(err => console.error("Auto-save after OCR failed", err));

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
      [eqId]: { ...prev[eqId], editedText: text, isDirty: true }
    }));
  };

  const manualSaveDraft = async (eqId: string, ocrText?: string, editedText?: string) => {
    const currentAns = answers[eqId];
    if (!currentAns) return;

    setAnswers(prev => ({ ...prev, [eqId]: { ...prev[eqId], saving: true } }));
    try {
      await fetch("/api/exam/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: exam.id,
          examQuestionId: eqId,
          ocrText: ocrText ?? currentAns.ocrText,
          editedText: editedText ?? currentAns.editedText,
          isPractice: isPractice
        })
      });
      setAnswers(prev => ({ ...prev, [eqId]: { ...prev[eqId], saving: false, isDirty: false } }));
    } catch (err) {
      console.error("Draft save failed", err);
      setAnswers(prev => ({ ...prev, [eqId]: { ...prev[eqId], saving: false } }));
    }
  };

  const saveAllDrafts = async () => {
    const dirtyEntries = Object.entries(answers).filter(([, data]) => data.isDirty);
    if (dirtyEntries.length === 0) return;

    setIsSavingAll(true);
    try {
      await Promise.all(
        dirtyEntries.map(([eqId, data]) =>
          fetch("/api/exam/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              examId: exam.id,
              examQuestionId: eqId,
              ocrText: data.ocrText,
              editedText: data.editedText,
              isPractice: isPractice
            }),
          })
        )
      );
      setAnswers(prev => {
        const updated = { ...prev };
        for (const [eqId] of dirtyEntries) {
          updated[eqId] = { ...updated[eqId], isDirty: false };
        }
        return updated;
      });
    } catch (err) {
      console.error("Save all drafts failed", err);
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      // Flush all unsaved drafts to Redis before final submit
      await saveAllDrafts();

      // Send all answers to submission endpoint
      const payload = {
        examId: exam.id,
        isPractice,
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
      if (!res.ok) {
        if (res.status === 400 && result.error === "Exam already submitted") {
          // Gracefully handle duplicate submission clicks
          localStorage.removeItem("in_progress_exam");
          window.dispatchEvent(new Event("in_progress_exam_updated"));
          router.push(`/exams/${exam.id}/results`);
          router.refresh();
          return;
        }
        throw new Error(result.error || "Submission failed");
      }

      // Clear from localStorage since we submitted
      localStorage.removeItem("in_progress_exam");
      window.dispatchEvent(new Event("in_progress_exam_updated"));

      if (isPractice && result.gradedResults) {
        setPracticeResults(result.gradedResults);
        setIsSubmitting(false);
        window.scrollTo(0, 0);
        return;
      }

      // Clear timer and redirect to results
      router.push(`/exams/${exam.id}/results`);
      router.refresh();
      
    } catch (err: any) {
      alert(`Submission Error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  if (practiceResults) {
    const totalEarned = practiceResults.reduce((acc, curr) => acc + (curr.earned || 0), 0);
    const maxPossible = practiceResults.reduce((acc, curr) => acc + (curr.result?.internal?.max || 0), 0);

    return (
      <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in">
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-8 mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-100 text-brand-600 mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-black text-brand-900 mb-2">Practice Complete!</h2>
          <p className="text-brand-800 mb-6">You scored {totalEarned} out of {maxPossible} marks.</p>
          <button 
            onClick={() => router.push("/exams")}
            className="bg-brand-600 text-white font-bold px-6 py-2 rounded-xl shadow hover:bg-brand-700 transition-colors"
          >
            Back to Exams
          </button>
        </div>

        <div className="space-y-6">
          {practiceResults.map((pr: any, i: number) => {
            const studentFeedback = pr.result?.studentFeedback || pr.result?.student_feedback;
            const scoreStr = studentFeedback?.score || (pr.result?.marks ? `${pr.result.marks}/10` : "?/?");
            const summaryText = studentFeedback?.summary || (pr.result?.marks ? "This is a mock summary from test-db." : "No summary available.");
            const highlights = studentFeedback?.highlights || [];

            return (
            <div key={pr.eqId} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h3 className="font-bold">Question {i + 1}</h3>
                <span className="font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full text-sm">
                  Score: {scoreStr}
                </span>
              </div>
              <div className="mb-4">
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Your Answer</h4>
                <p className="text-sm bg-muted/30 p-3 rounded-lg border border-border">{pr.editedText || "No answer"}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">AI Feedback</h4>
                <p className="text-sm text-foreground mb-4">{summaryText}</p>
                {highlights.length > 0 && (
                  <div className="space-y-2">
                    {highlights.map((h: any, idx: number) => (
                      <div key={idx} className="text-xs bg-red-50 text-red-900 p-2 rounded border border-red-100">
                        <span className="font-bold block mb-1">"{h.quote}"</span>
                        {h.comment}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 pb-32 animate-fade-in">
      {/* Sticky Header */}
      <div className="sticky top-4 z-50 bg-card border border-border rounded-2xl p-4 mb-8 shadow-lg shadow-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-foreground line-clamp-1">{isPractice ? `[Practice] ${exam.title}` : exam.title}</h1>
          <p className="text-xs text-muted-foreground">{examQuestions.length} Questions</p>
        </div>
        
        <div className={`flex items-center justify-center gap-3 px-4 py-2 rounded-xl border shrink-0 ${
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
                activeCameraId === eq.id ? (
                  <div className="mb-8">
                    <WebcamCapture 
                      onCapture={(file) => {
                        handleFileUpload(eq.id, [file]);
                        setActiveCameraId(null);
                      }}
                      onCancel={() => setActiveCameraId(null)}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setActiveCameraId(eq.id)}
                        className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center text-center h-full"
                      >
                        <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center mb-3">
                          <Camera size={20} className="text-brand-600" />
                        </div>
                        <span className="text-sm font-semibold text-brand-600 block mb-1">
                          Take Photo
                        </span>
                        <span className="text-[10px] text-muted-foreground block text-center">
                          Use camera directly
                        </span>
                      </button>
                      
                      <label htmlFor={`upload-${eq.id}`} className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center text-center h-full">
                        <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mb-3">
                          <ImageIcon size={20} />
                        </div>
                        <span className="text-sm font-semibold text-foreground block mb-1">Upload File</span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Max {eq.marks > 10 ? 2 : 1} image{eq.marks > 10 ? "s" : ""}
                        </span>
                        <input 
                          type="file" 
                          accept="image/*"
                          multiple={eq.marks > 10}
                          className="hidden" 
                          id={`upload-${eq.id}`}
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              const maxAllowed = eq.marks > 10 ? 2 : 1;
                              if (e.target.files.length > maxAllowed) {
                                 alert(`You can only upload up to ${maxAllowed} image(s) for this question.`);
                                 return;
                              }
                              handleFileUpload(eq.id, e.target.files);
                            }
                          }}
                        />
                      </label>
                    </div>
                    {ans.error && <p className="text-red-500 text-sm mt-3 text-center">{ans.error}</p>}
                  </div>
                )
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
                      multiple={eq.marks > 10}
                      className="hidden" 
                      id={`reupload-${eq.id}`}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const maxAllowed = eq.marks > 10 ? 2 : 1;
                          if (e.target.files.length > maxAllowed) {
                             alert(`You can only upload up to ${maxAllowed} image(s) for this question.`);
                             return;
                          }
                          handleFileUpload(eq.id, e.target.files);
                        }
                      }}
                    />
                    <button
                      onClick={() => manualSaveDraft(eq.id)}
                      disabled={!ans.isDirty || ans.saving}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors flex items-center gap-1 ${
                        ans.saving ? "bg-muted text-muted-foreground" :
                        ans.isDirty ? "bg-amber-100 text-amber-700 hover:bg-amber-200" :
                        "bg-green-50 text-green-600"
                      }`}
                    >
                      {ans.saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      {ans.saving ? "Saving..." : ans.isDirty ? "Save Draft" : "Draft Saved"}
                    </button>
                  </div>
                  {(() => {
                    const maxWords = eq.marks > 10 ? 250 : 150;
                    const maxChars = maxWords * 5;
                    const currentWords = ans.editedText.trim() === "" ? 0 : ans.editedText.trim().split(/\s+/).length;
                    
                    return (
                      <>
                        <textarea
                          value={ans.editedText}
                          onChange={(e) => updateText(eq.id, e.target.value)}
                          maxLength={maxChars}
                          className="w-full h-48 bg-background border border-border rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none font-medium text-foreground/90 leading-relaxed"
                          placeholder="Your answer will appear here..."
                        />
                        <div className="flex justify-between items-center mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <AlertCircle size={12} /> Please review the extracted text and correct any spelling mistakes before submitting.
                          </span>
                          <span className={currentWords >= maxWords ? "text-red-500 font-medium" : ""}>
                            {currentWords} / {maxWords} words
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border z-50">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <button
            onClick={saveAllDrafts}
            disabled={isSavingAll || !Object.values(answers).some(a => a.isDirty)}
            className="border border-border text-foreground px-5 py-3 rounded-xl font-bold hover:bg-muted transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {isSavingAll ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isSavingAll ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-brand-200 hover:bg-brand-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 w-full sm:w-auto"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {isSubmitting ? "Submitting Exam..." : "Submit Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
