import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuestionBuilderClient from "@/components/admin/question-builder-client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function EditQuestionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .single();

  if (!question) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link 
          href="/admin/questions"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} /> Back to Question Bank
        </Link>
        <p className="text-muted-foreground">
          Update the details for this question. Changes will affect future exams.
        </p>
      </div>

      <QuestionBuilderClient initialData={question} />
    </div>
  );
}
