import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkTestLimit } from "@/lib/api/usage";
import SingleTestClient from "@/components/test/single-test-client";
import type { Question } from "@/lib/types";

export default async function SingleTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the question
  const { data: question, error } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !question) {
    notFound();
  }

  // Check if user has enough tests to start
  const hasTestsAvailable = await checkTestLimit(user.id);

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in h-full flex flex-col">
      <SingleTestClient 
        question={question as Question} 
        hasTestsAvailable={hasTestsAvailable}
      />
    </div>
  );
}
