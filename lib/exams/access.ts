import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";

export function canAccessExamAudience(input: {
  isMagnusOnly: boolean;
  isAdmin: boolean;
  isApprovedMagnus: boolean;
}) {
  return !input.isMagnusOnly || input.isAdmin || input.isApprovedMagnus;
}

export async function assertExamAudienceAccess(input: {
  examId: string;
  userId: string;
  isMagnusOnly?: boolean;
}) {
  const admin = createAdminClient();
  let isMagnusOnly = input.isMagnusOnly;

  if (isMagnusOnly === undefined) {
    const { data: exam, error } = await admin
      .from("exams")
      .select("is_magnus_only")
      .eq("id", input.examId)
      .maybeSingle();
    if (error) throw error;
    if (!exam) throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
    isMagnusOnly = exam.is_magnus_only === true;
  }

  if (!isMagnusOnly) return;

  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("profiles").select("is_admin").eq("id", input.userId).maybeSingle(),
    admin
      .from("magnus_memberships")
      .select("user_id")
      .eq("user_id", input.userId)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;

  if (!canAccessExamAudience({
    isMagnusOnly,
    isAdmin: profile?.is_admin === true,
    isApprovedMagnus: Boolean(membership),
  })) {
    // Restricted exams intentionally look nonexistent to other students.
    throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
  }
}
