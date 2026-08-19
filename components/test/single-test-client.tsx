"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Play, Upload, FileText, CheckCircle2, AlertCircle, 
  Clock, X, Loader2, ArrowRight, ChevronRight, PenLine, Sparkles, Camera
} from "lucide-react";
import { WebcamCapture } from "@/components/ui/webcam-capture";
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
  const [state, setState] = useState<TestState>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // Timer state
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const secondsRef = useRef(0);
  const gradingRequestIdRef = useRef<string | null>(null);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [editedText, setEditedText] = useState("");
  
  // Grading state
  const [gradingResult, setGradingResult] = useState<GradingResultJSON | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("in_progress_test");
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Expire after 1 hour (3600000 ms) of inactivity
        if (Date.now() - parsed.lastUpdatedAt > 3600000) {
          localStorage.removeItem("in_progress_test");
          return;
        }

        if (parsed.questionId === question.id) {
          if (parsed.state === "running") {
            const currentElapsed = parsed.secondsElapsed + Math.floor((Date.now() - parsed.lastUpdatedAt) / 1000);
            setSecondsElapsed(currentElapsed);
            setState("running");
          } else if (parsed.state === "paused") {
            setSecondsElapsed(parsed.secondsElapsed);
            setState("paused");
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }, [question.id]);

  useEffect(() => {
    secondsRef.current = secondsElapsed;
  }, [secondsElapsed]);

  // Persist timer checkpoints without writing localStorage or waking the shell
  // on every one-second tick.
  useEffect(() => {
    const persist = () => {
      if (state !== "running" && state !== "paused") return;
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
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
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
      window.dispatchEvent(new Event("in_progress_test_updated"));
      setSecondsElapsed(0);
      setState("idle");
    }
  };

  const handleUploadAndOcr = async () => {
    if (!selectedFile) return;
    setError(null);
    setState("uploading");
    
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("questionId", question.id);
      
      setState("ocr_processing");
      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR failed");
      
      setOcrText(data.text);
      setEditedText(data.text);
      setState("editing");
    } catch (err: any) {
      setError(err.message);
      setState("running"); // go back so they can try again
    }
  };

  const handleSubmitForGrading = async () => {
    if (!editedText.trim()) {
      setError("Text cannot be empty");
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
        {question.space_hint && (
          <p className="mt-2 text-sm text-muted-foreground italic flex items-center gap-1.5">
            <AlertCircle size={14} /> {question.space_hint}
          </p>
        )}
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
              When you start, a timer will begin. Write your answer on a physical piece of paper, then upload a photo when you&apos;re done.
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
                : "Write your answer on paper. The timer is running."}
            </p>
            
            <div className={`w-full max-w-md ${state === "paused" ? "opacity-50 pointer-events-none" : ""}`}>
              {showCamera ? (
                <div className="mb-8">
                  <WebcamCapture 
                    onCapture={(file) => {
                      setSelectedFile(file);
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
            
            {selectedFile && (
              <div className="mt-6 flex flex-col items-center gap-4 w-full max-w-sm">
                <div className="w-full bg-brand-50 border border-brand-200 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-brand-700 truncate">{selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="text-brand-700 hover:text-brand-800">
                    <X size={16} />
                  </button>
                </div>
                <button
                  onClick={handleUploadAndOcr}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
                             hover:bg-brand-700 transition-all active:scale-[0.98] shadow-md shadow-brand-200"
                >
                  Process Image <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {(state === "uploading" || state === "ocr_processing") && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-fade-in">
            <Loader2 size={48} className="text-brand-500 animate-spin mb-6" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              {state === "uploading" ? "Uploading image..." : "Extracting text..."}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              {state === "uploading" 
                ? "Sending your photo securely." 
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
            
            {(() => {
              const maxWords = question.marks > 10 ? 250 : 150;
              const maxChars = maxWords * 5;
              const currentWords = editedText.trim() === "" ? 0 : editedText.trim().split(/\s+/).length;
              
              return (
                <>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    maxLength={maxChars}
                    className="flex-1 w-full rounded-xl border border-input bg-background p-4 text-sm leading-relaxed resize-none
                               focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[250px]"
                    placeholder="Your answer will appear here..."
                  />
                  <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                    </span>
                    <span className={currentWords >= maxWords ? "text-red-500 font-medium" : ""}>
                      {currentWords} / {maxWords} words
                    </span>
                  </div>
                </>
              );
            })()}

            <div className="mt-4 flex flex-col sm:flex-row sm:justify-end">
              <button
                onClick={handleSubmitForGrading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
                           hover:bg-brand-700 transition-all active:scale-[0.98] shadow-md shadow-brand-200"
              >
                Submit for Grading <Sparkles size={16} />
              </button>
            </div>
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
