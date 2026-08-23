import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATEGORY_LABELS,
  type PersonalProgressionCardDTO,
  type ProgressionReportContent,
  type ProgressionReportInsight,
  type ProgressionReportNextStep,
  type ProgressionStatus,
  type QuestionCategory,
} from "@/lib/types";

const REPORTABLE_TYPES = Object.keys(CATEGORY_LABELS)
  .filter((category) => category !== "translation") as QuestionCategory[];

export const CATEGORY_PROGRESS_REPORT_PROMPT_VERSION = "category-patterns-v3-simple-english";

const CATEGORY_SCOPED_PROMPT_VERSIONS = new Set([
  "category-patterns-v2",
  CATEGORY_PROGRESS_REPORT_PROMPT_VERSION,
]);

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

export function sanitizeProgressionReport(
  value: unknown,
  options?: { submissionTypeLabel: string; promptVersion: string | null },
): ProgressionReportContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const overview = cleanText(row.overview, 2_000);
  if (!overview) return null;
  const report: ProgressionReportContent = {
    title: options?.submissionTypeLabel
      ? `${options.submissionTypeLabel} Progress Report`
      : cleanText(row.title, 200) || "Category Progress Report",
    overview,
    trajectory: safeStatus(row.trajectory),
    strengths: sanitizeInsights(row.strengths),
    growthAreas: sanitizeInsights(row.growthAreas ?? row.growth_areas),
    resolvedWins: sanitizeInsights(row.resolvedWins ?? row.resolved_wins),
    nextSteps: sanitizeNextSteps(row.nextSteps ?? row.next_steps),
  };
  if (!options || (options.promptVersion && CATEGORY_SCOPED_PROMPT_VERSIONS.has(options.promptVersion))) {
    return report;
  }

  const focusAreas = report.growthAreas.slice(0, 2);
  return {
    ...report,
    nextSteps: focusAreas.length
      ? focusAreas.map((focus) => ({
          action: `For future ${options.submissionTypeLabel} responses, practise ${focus.skill} on every question.`,
          reason: `${focus.insight} Treating this as a category-wide habit keeps the practice useful beyond one completed answer.`,
          exampleLine: "",
        }))
      : [{
          action: `Use a short ${options.submissionTypeLabel} checklist before submitting each new response.`,
          reason: "A repeatable category-level check turns strengths into consistent habits across different questions.",
          exampleLine: "",
        }],
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
      .select("total_graded")
      .eq("user_id", input.userId)
      .eq("submission_type", submissionType)
      .maybeSingle(),
    admin
      .from("student_progression_reports")
      .select("report, prompt_version")
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
    totalGraded: Number(profileResult.data?.total_graded ?? 0),
    latestReport: sanitizeProgressionReport(reportResult.data?.report, {
      submissionTypeLabel,
      promptVersion: reportResult.data?.prompt_version ?? null,
    }),
  };
}

export interface PersonalReportCategoryDTO {
  submissionType: QuestionCategory;
  submissionTypeLabel: string;
  totalGraded: number;
  updatedAt: string;
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
      .select("submission_type, total_graded, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    admin
      .from("student_progression_reports")
      .select("submission_type, checkpoint, report, prompt_version, generated_at")
      .eq("user_id", userId)
      .order("checkpoint", { ascending: false }),
  ]);
  if (profileError) throw profileError;
  if (reportError) throw reportError;

  const latestByType = new Map<string, { report: unknown; prompt_version: string | null; generated_at: string }>();
  for (const row of reports ?? []) {
    if (!latestByType.has(row.submission_type)) {
      latestByType.set(row.submission_type, {
        report: row.report,
        prompt_version: row.prompt_version,
        generated_at: row.generated_at,
      });
    }
  }

  const categories = (profiles ?? [])
    .filter((profile) => isQuestionCategory(profile.submission_type))
    .map((profile) => {
      const latest = latestByType.get(profile.submission_type);
      const submissionType = profile.submission_type as QuestionCategory;
      const submissionTypeLabel = CATEGORY_LABELS[submissionType];
      return {
        submissionType,
        submissionTypeLabel,
        totalGraded: Number(profile.total_graded ?? 0),
        updatedAt: profile.updated_at,
        latestReport: sanitizeProgressionReport(latest?.report, {
          submissionTypeLabel,
          promptVersion: latest?.prompt_version ?? null,
        }),
        reportGeneratedAt: latest?.generated_at ?? null,
      };
    });
  return { access: true, categories };
}
