import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import QuestionBuilderClient from "@/components/admin/question-builder-client";

export default async function AdminCreateQuestionPage() {
  const supabase = await createClient();

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Create New Question</h1>
        <p className="text-muted-foreground text-sm">Add a new question to the centralized Question Bank.</p>
      </div>

      <QuestionBuilderClient />
    </div>
  );
}
