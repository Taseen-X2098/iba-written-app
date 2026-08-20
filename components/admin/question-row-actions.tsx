"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function QuestionRowActions({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Remove this question from the active question bank? Existing exam and submission records will be kept.")) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/admin/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: questionId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Failed to remove question");

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to remove question");
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      aria-label="Remove question"
      title="Remove question"
      className="text-muted-foreground hover:text-red-600 p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 size={16} className={isDeleting ? "animate-pulse" : undefined} />
    </button>
  );
}
