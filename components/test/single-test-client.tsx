"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Play, FileText, CheckCircle2, AlertCircle,
  X, Loader2, ArrowRight, PenLine, Sparkles, Camera
} from "lucide-react";
import { WebcamCapture } from "@/components/ui/webcam-capture";
import {
  clearEncryptedRecovery,
  loadEncryptedRecovery,
  saveEncryptedRecovery,
} from "@/lib/exams/recovery-client";
import { countWords, wordLimitForMarks } from "@/lib/answers/word-limit";
import { ANSWER_PAGE_LIMIT, answerPageLabel, getPageLimitViolation } from "@/lib/answers/page-limit";
import { CATEGORY_LABELS, type Question, type GradingResultJSON, type QuestionCategory } from "@/lib/types";
import { HighlightedText } from "@/components/ui/highlighted-text";

type TestState = 
  | "idle" 
  | "running" 
  | "paused"
  | "uploading" 
  | "ocr_processing" 
  | "editing" 
  | "grading" 
  | "feedback";

interface Props {
  question: Question;
  hasTestsAvailable: boolean;
}

export default function SingleTestClient({ question, hasTestsAvailable }: Props) {
  const router = useRouter();
  const maxWords = wordLimitForMarks(question.marks);
  const maxImages = ANSWER_PAGE_LIMIT;
  const recoveryId = `standalone:${question.id}`;
  const [state, setState] = useState<TestState>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // Timer state
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsRef = useRef(0);
  const gradingRequestIdRef = useRef<string | null>(null);
  
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [editedText, setEditedText] = useState("");
  const editedWordCount = countWords(editedText);
  const exceedsWordLimit = editedWordCount > maxWords;
  
  // Grading state
  const [gradingResult, setGradingResult] = useState<GradingResultJSON | null>(null);

  // Restore timer metadata plus the encrypted answer recovery for this tab.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const saved = localStorage.getItem("in_progress_test");
        if (!saved) return;
        const parsed = JSON.parse(saved);

        // Expire after 1 hour (3600000 ms) of inactivity.
        if (Date.now() - parsed.lastUpdatedAt > 3600000) {
          localStorage.removeItem("in_progress_test");
          clearEncryptedRecovery(recoveryId);
          window.dispatchEvent(new Event("in_progress_test_updated"));
          return;
        }

        if (parsed.questionId !== question.id) return;
        if (parsed.state === "running") {
          const currentElapsed = parsed.secondsElapsed + Math.floor((Date.now() - parsed.lastUpdatedAt) / 1000);
          if (!cancelled) {
            setSecondsElapsed(currentElapsed);
            setState("running");
          }
        } else if (parsed.state === "paused") {
          if (!cancelled) {
            setSecondsElapsed(parsed.secondsElapsed);
            setState("paused");
          }
        } else if (parsed.state === "editing") {
          const recovered = await loadEncryptedRecovery(recoveryId);
          const answer = recovered[question.id];
          if (!cancelled) {
            setSecondsElapsed(parsed.secondsElapsed);
            if (answer) {
              setOcrText(answer.ocrText);
              setEditedText(answer.editedText);
              setState("editing");
            } else {
              setState("paused");
              setError("The saved answer could not be recovered in this tab.");
            }
          }
        }
      } catch {
        // Ignore malformed or unavailable recovery data.
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [question.id, recoveryId]);

  useEffect(() => {
    secondsRef.current = secondsElapsed;
  }, [secondsElapsed]);

  // Persist stable workflow checkpoints without writing localStorage on every
  // one-second timer tick. In-flight OCR/grading falls back to the last stable
  // running or editing checkpoint after a refresh.
  useEffect(() => {
    const persist = () => {
      if (state !== "running" && state !== "paused" && state !== "editing") return;
      const payload = {
        questionId: question.id,
        prompt: question.prompt,
        category: question.category,
        marks: question.marks,
        secondsElapsed: secondsRef.current,
        state,
        lastUpdatedAt: Date.now()
      };
      localStorage.setItem("in_progress_test", JSON.stringify(payload));
      window.dispatchEvent(new Event("in_progress_test_updated"));
    };
    persist();
    const checkpoint = window.setInterval(persist, 15_000);
    return () => window.clearInterval(checkpoint);
  }, [state, question]);

  // Keep answer text out of plaintext localStorage. The encrypted payload is
  // recoverable across refreshes in this tab because its key lives only in
  // sessionStorage, matching the full-exam recovery behavior.
  useEffect(() => {
    if (state !== "editing") return;
    const timeout = window.setTimeout(() => {
      void saveEncryptedRecovery(recoveryId, {
        [question.id]: { ocrText, editedText },
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [editedText, ocrText, question.id, recoveryId, state]);

  // Timer logic
  useEffect(() => {
    if (state === "running") {
      timerRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    if (!hasTestsAvailable) {
      router.push("/subscription");
      return;
    }
    setState("running");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const violation = getPageLimitViolation(files.length);
    if (violation) {
      setError(`Maximum ${answerPageLabel()}. Select fewer photos.`);
      e.target.value = "";
      return;
    }
    setError(null);
    setSelectedFiles(files);
    e.target.value = "";
  };

  const handlePauseToggle = () => {
    if (state === "running") {
      setState("paused");
    } else if (state === "paused") {
      setState("running");
    }
  };

  const handleRestartTimer = () => {
    if (confirm("Are you sure you want to restart the timer?")) {
      setSecondsElapsed(0);
      setState("running");
    }
  };

  const handleCancelSession = () => {
    if (confirm("Are you sure you want to cancel this session? Your timer will be reset and removed from history.")) {
      localStorage.removeItem("in_progress_test");
      clearEncryptedRecovery(recoveryId);
      window.dispatchEvent(new Event("in_progress_test_updated"));
      setSecondsElapsed(0);
      setState("idle");
    }
  };

  const handleUploadAndOcr = async (fileOverride?: File[] | FileList) => {
    const files = Array.from(fileOverride ?? selectedFiles);
    if (!files.length) return;
    const violation = getPageLimitViolation(files.length);
    if (violation) {
      setError(`Maximum ${answerPageLabel()}. Select fewer photos.`);
      return;
    }
    const returnState: TestState = state === "editing" ? "editing" : "running";
    setError(null);
    setState("uploading");
    
    try {
      const formData = new FormData();
      for (const file of files) formData.append("image", file);
      formData.append("questionId", question.id);
      
      setState("ocr_processing");
      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR failed");

      // Finish the recovery write before exposing the editor so an immediate
      // refresh cannot lose a successful OCR result.
      await saveEncryptedRecovery(recoveryId, {
        [question.id]: { ocrText: data.text, editedText: data.text },
      }).catch(() => undefined);
      setOcrText(data.text);
      setEditedText(data.text);
      setSelectedFiles([]);
      setState("editing");
    } catch (err: any) {
      setError(err.message);
      setState(returnState);
    }
  };

  const handleSubmitForGrading = async () => {
    if (!editedText.trim()) {
      setError("Text cannot be empty");
      return;
    }
    if (exceedsWordLimit) {
      setError(`Your answer is ${editedWordCount} words. Shorten it to ${maxWords} words before submitting.`);
      return;
    }
    
    setError(null);
    setState("grading");
    
    let receivedResponse = false;
    try {
      if (!gradingRequestIdRef.current) gradingRequestIdRef.current = crypto.randomUUID();
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          idempotencyKey: gradingRequestIdRef.current,
          submissionText: editedText,
          ocrText,
          timeTakenSeconds: secondsElapsed,
        }),
      });
      receivedResponse = true;
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grading failed");
      
      setGradingResult(data.gradingResult);
      gradingRequestIdRef.current = null;
      setState("feedback");
      
      // Clear localStorage on success
      localStorage.removeItem("in_progress_test");
      clearEncryptedRecovery(recoveryId);
      window.dispatchEvent(new Event("in_progress_test_updated"));
      
      // Tell Next.js router to refresh so the user's slot count updates
      router.refresh();
    } catch (err: any) {
      // If the connection died after the server committed, retain the key so
      // the next click retrieves the existing grade without another charge.
      if (receivedResponse) gradingRequestIdRef.current = null;
      setError(err.message);
      setState("editing"); // go back so they can try again
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      {/* Header Info */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
            {CATEGORY_LABELS[question.category as QuestionCategory] || question.category}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {question.marks} Marks
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground leading-snug">
          {question.prompt}
        </h1>
        <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Hard answer limits: {maxWords} words and maximum {answerPageLabel()}.</strong>{" "}
            {question.space_hint ? `${question.space_hint}. ` : ""}
            You may use one or two sheets. If you use two, upload both page photos together. A third photo will be rejected.
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* State Machine UI */}
      <div className="flex-1 bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col">
        {state === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="h-16 w-16 bg-brand-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <PenLine size={32} className="text-brand-600" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Ready to practice?</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
              When you start, a timer will begin. Your answer must stay within {maxWords} words and {answerPageLabel()}.
            </p>
            <button
              onClick={handleStart}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
                         hover:bg-brand-700 transition-all active:scale-[0.98] shadow-md shadow-brand-200"
            >
              <Play size={16} />
              {hasTestsAvailable ? "Start Test" : "Upgrade to Practice"}
            </button>
            {!hasTestsAvailable && (
              <p className="mt-3 text-xs text-destructive font-medium">
                You have 0 tests remaining. Please purchase a plan or extra tests.
              </p>
            )}
          </div>
        )}

        {(state === "running" || state === "paused") && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-fade-in">
            <div className="text-5xl md:text-7xl font-mono font-bold tracking-tight text-foreground mb-2">
              {formatTime(secondsElapsed)}
            </div>
            
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 mb-8 w-full">
              <button
                onClick={handlePauseToggle}
                className="w-full sm:w-auto px-6 py-2.5 sm:px-4 sm:py-1.5 rounded-xl sm:rounded-full text-sm sm:text-xs font-semibold uppercase tracking-widest transition-colors border
                           bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border-border"
              >
                {state === "paused" ? "Resume Timer" : "Pause Timer"}
              </button>
              
              <button
                onClick={handleRestartTimer}
                className="w-full sm:w-auto px-6 py-2.5 sm:px-4 sm:py-1.5 rounded-xl sm:rounded-full text-sm sm:text-xs font-semibold uppercase tracking-widest transition-colors border
                           bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20"
              >
                Restart Timer
              </button>
              
              <button
                onClick={handleCancelSession}
                className="w-full sm:w-auto px-6 py-2.5 sm:px-4 sm:py-1.5 rounded-xl sm:rounded-full text-sm sm:text-xs font-semibold uppercase tracking-widest transition-colors border
                           bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground border-border hover:border-destructive"
              >
                Cancel Session
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground mb-8">
              {state === "paused" 
                ? "Test is paused. Your time has been suspended."
                : `Write within ${maxWords} words and ${answerPageLabel()}. The timer is running.`}
            </p>
            
            <div className={`w-full max-w-md ${state === "paused" ? "opacity-50 pointer-events-none" : ""}`}>
              {showCamera ? (
                <div className="mb-8">
                  <WebcamCapture 
                    onCapture={(file) => {
                      const nextFiles = [...selectedFiles, file];
                      const violation = getPageLimitViolation(nextFiles.length);
                      if (violation) {
                        setError(`Maximum ${answerPageLabel()}. Remove a selected photo before taking another.`);
                      } else {
                        setError(null);
                        setSelectedFiles(nextFiles);
                      }
                      setShowCamera(false);
                    }}
                    onCancel={() => setShowCamera(false)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Direct Type Button */}
                  <button
                    onClick={() => {
                      setOcrText("");
                      setEditedText("");
                      setState("editing");
                    }}
                    className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center h-full text-center w-full"
                  >
                    <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center mb-3">
                      <PenLine size={20} className="text-brand-600" />
                    </div>
                    <span className="text-sm font-semibold text-brand-600 block mb-1">
                      Type Answer
                    </span>
                    <span className="text-[10px] text-muted-foreground block text-center">
                      Type directly
                    </span>
                  </button>

                  {/* Camera Button */}
                  <button
                    onClick={() => setShowCamera(true)}
                    className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 hover:bg-muted/50 transition-colors flex flex-col items-center"
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

                  {/* Gallery Button */}
                  <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 hover:bg-muted/50 transition-colors flex flex-col items-center">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload-gallery"
                    />
                    <label 
                      htmlFor="file-upload-gallery"
                      className="cursor-pointer flex flex-col items-center w-full text-center"
                    >
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mb-3">
                        <FileText size={20} className="text-secondary-foreground" />
                      </div>
                      <span className="text-sm font-semibold text-foreground block mb-1">
                        Upload File
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        Choose from gallery
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            
            {selectedFiles.length > 0 && (
              <div className="mt-6 flex flex-col items-center gap-4 w-full max-w-sm">
                <div className="w-full rounded-lg border border-brand-200 bg-brand-50 p-3">
                  <p className="mb-2 text-xs font-bold text-brand-800">{selectedFiles.length} of {maxImages} page photos selected</p>
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-brand-700">Page {index + 1}: {file.name}</span>
                        <button onClick={() => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-brand-700 hover:text-brand-800" aria-label={`Remove page ${index + 1}`}>
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => void handleUploadAndOcr()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
                             hover:bg-brand-700 transition-all active:scale-[0.98] shadow-md shadow-brand-200"
                >
                  Process {selectedFiles.length} Page Photo{selectedFiles.length === 1 ? "" : "s"} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {(state === "uploading" || state === "ocr_processing") && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-fade-in">
            <Loader2 size={48} className="text-brand-500 animate-spin mb-6" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              {state === "uploading" ? "Uploading page photos..." : "Extracting text..."}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              {state === "uploading" 
                ? "Sending your page photos securely."
                : "Our AI is reading your handwriting. This usually takes 5-10 seconds."}
            </p>
          </div>
        )}

        {state === "editing" && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileText size={18} className="text-brand-600" /> Verify Text
              </h3>
              <div className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">
                Time: {formatTime(secondsElapsed)}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Review the extracted text and fix any mistakes the AI made reading your handwriting.
            </p>
            
            {showCamera ? (
              <WebcamCapture
                onCapture={(file) => {
                  setShowCamera(false);
                  void handleUploadAndOcr([file]);
                }}
                onCancel={() => setShowCamera(false)}
              />
            ) : (
              <>
                <textarea
                  value={editedText}
                  onChange={(event) => {
                    setEditedText(event.target.value);
                    setError(null);
                  }}
                  className="flex-1 w-full rounded-xl border border-input bg-background p-4 text-sm leading-relaxed resize-none
                             focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[250px]"
                  placeholder="Your answer will appear here..."
                />
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  <span>Running OCR on a new image will replace the text in this editor.</span>
                  <span className={exceedsWordLimit ? "text-red-500 font-bold" : ""}>
                    {editedWordCount} / {maxWords} words
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto"
                  >
                    <Camera size={16} /> Take Another Photo
                  </button>
                  <label
                    htmlFor="ocr-retry-upload"
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto"
                  >
                    <FileText size={16} /> Upload Another Image
                  </label>
                  <input
                    id="ocr-retry-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = event.currentTarget.files;
                      event.currentTarget.value = "";
                      if (files?.length) void handleUploadAndOcr(files);
                    }}
                  />
                  <button
                    onClick={handleSubmitForGrading}
                    disabled={exceedsWordLimit}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
                               hover:bg-brand-700 transition-all active:scale-[0.98] shadow-md shadow-brand-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exceedsWordLimit ? `Remove ${editedWordCount - maxWords} word${editedWordCount - maxWords === 1 ? "" : "s"}` : "Submit for Grading"}
                    {!exceedsWordLimit && <Sparkles size={16} />}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {state === "grading" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-fade-in">
            <div className="relative">
              <Loader2 size={64} className="text-brand-500 animate-spin mb-6" />
              <div className="absolute inset-0 flex items-center justify-center mb-6">
                <Sparkles size={24} className="text-brand-600 animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Grading your answer...</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Applying the IBA written rubric. Analyzing structure, vocabulary, grammar, and content.
            </p>
          </div>
        )}

        {state === "feedback" && gradingResult && (
          <div className="flex-1 animate-fade-in space-y-8">
            {/* Score Banner */}
              <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6 bg-brand-50 border border-brand-100 rounded-2xl p-5 sm:p-6 text-center md:text-left">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 border-4 border-brand-200">
                <div className="text-center">
                  <span className="block text-xl sm:text-2xl font-bold text-brand-700 leading-none">
                    {gradingResult.studentFeedback.score.split("/")[0]}
                  </span>
                  <span className="block text-[10px] sm:text-xs font-semibold text-brand-500 mt-1">
                    OUT OF {gradingResult.studentFeedback.score.split("/")[1]}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-brand-900 mb-1.5 sm:mb-2">AI Feedback Summary</h3>
                <p className="text-sm text-brand-800 leading-relaxed">
                  {gradingResult.studentFeedback.summary}
                </p>
              </div>
            </div>

            {/* Highlights Interactive Text */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FileText size={16} /> Your Annotated Submission
              </h4>
              <div className="bg-muted/30 border border-border rounded-xl p-5 text-sm leading-loose">
                <HighlightedText 
                  text={editedText} 
                  highlights={gradingResult.studentFeedback.highlights} 
                />
              </div>
              <div className="mt-3 flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[var(--color-highlight-strength)] border border-[var(--color-highlight-strength-border)]" />
                  <span className="text-muted-foreground">Strengths</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[var(--color-highlight-improvement)] border border-[var(--color-highlight-improvement-border)]" />
                  <span className="text-muted-foreground">Areas for Improvement</span>
                </div>
              </div>
            </div>

            <div className="pt-4 sm:pt-6 border-t border-border flex flex-col sm:flex-row sm:justify-end">
              <button
                onClick={() => router.push("/questions")}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-6 py-3 sm:py-2.5 text-sm font-medium text-foreground
                           hover:bg-muted transition-colors active:scale-[0.98]"
              >
                Back to Questions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
