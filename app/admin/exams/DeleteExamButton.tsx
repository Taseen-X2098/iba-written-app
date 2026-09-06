"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

const CONFIRMATION_DELAY_SECONDS = 5;

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;

  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

function fallbackFilename(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${slug || "exam"}-results.csv`;
}

export function DeleteExamButton({ examId, title }: { examId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(CONFIRMATION_DELAY_SECONDS);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [open]);

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (secondsRemaining > 0 || deleting) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/exams/${examId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Failed to delete exam");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = responseFilename(response, fallbackFilename(title));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete exam");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSecondsRemaining(CONFIRMATION_DELAY_SECONDS);
          setOpen(true);
        }}
        className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
      >
        <Trash2 size={12} /> Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-exam-title-${examId}`}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-red-600">Permanent action</p>
                <h2 id={`delete-exam-title-${examId}`} className="text-xl font-bold text-foreground">
                  Delete {title}?
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                aria-label="Close delete confirmation"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The exam, attempts, submissions, grading jobs, and published results will be permanently deleted.
              A CSV copy of the published results will download automatically.
            </p>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={secondsRemaining > 0 || deleting}
                className="inline-flex min-w-52 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                {deleting
                  ? "Deleting and preparing CSV..."
                  : secondsRemaining > 0
                    ? `Delete & download CSV (${secondsRemaining}s)`
                    : "Delete & download CSV"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
