"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Play, Upload, FileText, CheckCircle2, AlertCircle, 
  Clock, X, Loader2, ArrowRight, ChevronRight, PenLine, Sparkles
} from "lucide-react";
import type { Question, GradingResultJSON } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";

type TestState = 
  | "idle" 
  | "running" 
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
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [editedText, setEditedText] = useState("");
  
  // Grading state
  const [gradingResult, setGradingResult] = useState<GradingResultJSON | null>(null);

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

  const handleUploadAndOcr = async () => {
    if (!selectedFile) return;
    setError(null);
    setState("uploading");
    
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      
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
    
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          submissionText: editedText,
          ocrText,
          timeTakenSeconds: secondsElapsed,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grading failed");
      
      setGradingResult(data.gradingResult);
      setState("feedback");
      
      // Tell Next.js router to refresh so the user's slot count updates
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setState("editing"); // go back so they can try again
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      {/* Header Info */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium uppercase tracking-wide">
            {CATEGORY_LABELS[question.category] || question.category}
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
      <div className="flex-1 bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col">
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
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
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

        {state === "running" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-fade-in">
            <div className="text-5xl md:text-7xl font-mono font-bold tracking-tight text-foreground mb-4">
              {formatTime(secondsElapsed)}
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Write your answer on paper. The timer is running.
            </p>
            
            <div className="w-full max-w-sm rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 hover:bg-muted/50 transition-colors">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <div className="h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center">
                  <Upload size={24} className="text-brand-600" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-brand-600 block mb-1">
                    Upload your handwritten answer
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    Take a photo or choose from gallery
                  </span>
                </div>
              </label>
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
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="flex-1 w-full rounded-xl border border-input bg-background p-4 text-sm leading-relaxed resize-none
                         focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[250px]"
              placeholder="Your answer will appear here..."
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmitForGrading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white
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
            <div className="flex flex-col md:flex-row items-center gap-6 bg-brand-50 border border-brand-100 rounded-2xl p-6">
              <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 border-4 border-brand-200">
                <div className="text-center">
                  <span className="block text-2xl font-bold text-brand-700 leading-none">
                    {gradingResult.studentFeedback.score.split("/")[0]}
                  </span>
                  <span className="block text-xs font-semibold text-brand-500 mt-1">
                    OUT OF {gradingResult.studentFeedback.score.split("/")[1]}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-brand-900 mb-2">AI Feedback Summary</h3>
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

            <div className="pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => router.push("/questions")}
                className="inline-flex items-center gap-2 rounded-xl bg-card border border-border px-6 py-2.5 text-sm font-medium text-foreground
                           hover:bg-muted transition-colors"
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

// ─── Highlighted Text Component ──────────────────────────────────────────

function HighlightedText({ text, highlights }: { text: string; highlights: any[] }) {
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);

  // Simple string search implementation. 
  // For a robust implementation, we'd need to find all overlapping indices.
  // Assuming non-overlapping highlights for this MVP.
  
  let result: React.ReactNode[] = [];
  let currentIndex = 0;

  // Sort highlights by their position in text
  const sortedHighlights = [...highlights]
    .map((h, i) => {
      const index = text.indexOf(h.quote);
      return { ...h, originalIndex: i, startIndex: index, endIndex: index + h.quote.length };
    })
    .filter(h => h.startIndex !== -1)
    .sort((a, b) => a.startIndex - b.startIndex);

  sortedHighlights.forEach((h, i) => {
    // Add text before highlight
    if (h.startIndex > currentIndex) {
      result.push(<span key={`text-${currentIndex}`}>{text.slice(currentIndex, h.startIndex)}</span>);
    }
    
    // Add highlighted section
    if (h.startIndex >= currentIndex) {
      result.push(
        <span key={`highlight-wrapper-${i}`} className="relative inline-block group">
          <mark 
            data-type={h.type}
            onMouseEnter={() => setActiveHighlight(i)}
            onMouseLeave={() => setActiveHighlight(null)}
          >
            {text.slice(h.startIndex, h.endIndex)}
          </mark>
          
          {/* Tooltip */}
          {activeHighlight === i && (
            <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-foreground text-background text-xs rounded-lg shadow-xl animate-fade-in pointer-events-none">
              <div className="font-semibold mb-1 uppercase tracking-wide opacity-80">
                {h.type === "strength" ? "Good" : "Improvement"}
              </div>
              {h.comment}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
            </div>
          )}
        </span>
      );
      currentIndex = h.endIndex;
    }
  });

  // Add remaining text
  if (currentIndex < text.length) {
    result.push(<span key={`text-${currentIndex}`}>{text.slice(currentIndex)}</span>);
  }

  // Fallback if no highlights matched
  if (result.length === 0) {
    return <span>{text}</span>;
  }

  return <>{result}</>;
}
