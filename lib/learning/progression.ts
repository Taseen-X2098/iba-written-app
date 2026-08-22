import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATEGORY_LABELS,
  type PersonalProgressionCardDTO,
  type ProgressionReportContent,
  type ProgressionReportInsight,
  type ProgressionReportNextStep,
  type ProgressionSnapshotDTO,
  type ProgressionStatus,
  type QuestionCategory,
} from "@/lib/types";
import type { ProgressionSnapshot } from "@/lib/learning/profile";

const REPORTABLE_TYPES = Object.keys(CATEGORY_LABELS)
  .filter((category) => category !== "translation") as QuestionCategory[];

function isQuestionCategory(value: string): value is QuestionCategory {
  return REPORTABLE_TYPES.includes(value as QuestionCategory);
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeStatus(value: unknown): ProgressionStatus {
  return value === "improving" || value === "steady" || value === "needs_attention"
    ? value
    : "building";
}

function sanitizeSnapshot(value: unknown): ProgressionSnapshotDTO {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    headline: cleanText(row.headline, 500) || "Your personal writing profile is taking shape.",
    status: safeStatus(row.status),
    recentWin: cleanText(row.recentWin ?? row.recent_win, 1_000)
      || "Your latest submission added useful evidence about your writing habits.",
    focusArea: cleanText(row.focusArea ?? row.focus_area, 1_000)
      || "Keep the next revision focused on one high-impact writing skill.",
    nextStep: cleanText(row.nextStep ?? row.next_step, 1_000)
      || "Apply the feedback to one deliberate revision before your next submission.",
    evidence: cleanText(row.evidence, 500),
  };
}

function sanitizeInsights(value: unknown): ProgressionReportInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      skill: cleanText(item.skill, 120),
      insight: cleanText(item.insight, 1_000),
      evidence: cleanText(item.evidence, 500),
    }))
    .filter((item) => item.skill && item.insight)
    .slice(0, 4);
}

function sanitizeNextSteps(value: unknown): ProgressionReportNextStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      action: cleanText(item.action, 500),
      reason: cleanText(item.reason, 1_000),
      exampleLine: cleanText(item.exampleLine ?? item.example_line, 1_000),
    }))
    .filter((item) => item.action && item.reason)
    .slice(0, 3);
}

export function sanitizeProgressionReport(value: unknown): ProgressionReportContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const overview = cleanText(row.overview, 2_000);
  if (!overview) return null;
  return {
    title: cleanText(row.title, 200) || "Personal Progression Report",
    overview,
    trajectory: safeStatus(row.trajectory),
    strengths: sanitizeInsights(row.strengths),
    growthAreas: sanitizeInsights(row.growthAreas ?? row.growth_areas),
    resolvedWins: sanitizeInsights(row.resolvedWins ?? row.resolved_wins),
    nextSteps: sanitizeNextSteps(row.nextSteps ?? row.next_steps),
  };
}

export async function hasPersonalProgressionAccess(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", now)
      .limit(1),
  ]);
  return Boolean(profile?.is_admin || subscriptions?.length);
}

export async function getPersonalProgressionCard(input: {
  userId: string;
  submissionType: string;
  currentSnapshot?: ProgressionSnapshot;
  access?: boolean;
}): Promise<PersonalProgressionCardDTO> {
  if (!isQuestionCategory(input.submissionType)) {
    throw new Error(`Unsupported progression-report submission type: ${input.submissionType}`);
  }
  const submissionType = input.submissionType;
  const submissionTypeLabel = CATEGORY_LABELS[submissionType];
  const access = input.access ?? await hasPersonalProgressionAccess(input.userId);
  if (!access) return { locked: true, submissionType, submissionTypeLabel };

  const admin = createAdminClient();
  const [profileResult, reportResult] = await Promise.all([
    admin
      .from("student_category_profiles")
      .select("latest_snapshot")
      .eq("user_id", input.userId)
      .eq("submission_type", submissionType)
      .maybeSingle(),
    admin
      .from("student_progression_reports")
      .select("report")
      .eq("user_id", input.userId)
      .eq("submission_type", submissionType)
      .order("checkpoint", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (reportResult.error) throw reportResult.error;
  return {
    locked: false,
    submissionType,
    submissionTypeLabel,
    snapshot: sanitizeSnapshot(input.currentSnapshot ?? profileResult.data?.latest_snapshot),
    latestReport: sanitizeProgressionReport(reportResult.data?.report),
  };
}

export interface PersonalReportCategoryDTO {
  submissionType: QuestionCategory;
  submissionTypeLabel: string;
  totalGraded: number;
  updatedAt: string;
  snapshot: ProgressionSnapshotDTO;
  latestReport: ProgressionReportContent | null;
  reportGeneratedAt: string | null;
}

export async function getPersonalReportPageData(userId: string): Promise<{
  access: boolean;
  categories: PersonalReportCategoryDTO[];
}> {
  const access = await hasPersonalProgressionAccess(userId);
  if (!access) return { access: false, categories: [] };

  const admin = createAdminClient();
  const [{ data: profiles, error: profileError }, { data: reports, error: reportError }] = await Promise.all([
    admin
      .from("student_category_profiles")
      .select("submission_type, total_graded, latest_snapshot, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    admin
      .from("student_progression_reports")
      .select("submission_type, checkpoint, report, generated_at")
      .eq("user_id", userId)
      .order("checkpoint", { ascending: false }),
  ]);
  if (profileError) throw profileError;
  if (reportError) throw reportError;

  const latestByType = new Map<string, { report: unknown; generated_at: string }>();
  for (const row of reports ?? []) {
    if (!latestByType.has(row.submission_type)) {
      latestByType.set(row.submission_type, { report: row.report, generated_at: row.generated_at });
    }
  }

  const categories = (profiles ?? [])
    .filter((profile) => isQuestionCategory(profile.submission_type))
    .map((profile) => {
      const latest = latestByType.get(profile.submission_type);
      return {
        submissionType: profile.submission_type as QuestionCategory,
        submissionTypeLabel: CATEGORY_LABELS[profile.submission_type as QuestionCategory],
        totalGraded: Number(profile.total_graded ?? 0),
        updatedAt: profile.updated_at,
        snapshot: sanitizeSnapshot(profile.latest_snapshot),
        latestReport: sanitizeProgressionReport(latest?.report),
        reportGeneratedAt: latest?.generated_at ?? null,
      };
    });
  return { access: true, categories };
}
