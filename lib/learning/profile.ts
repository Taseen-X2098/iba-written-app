import { createAdminClient } from "@/lib/supabase/admin";
import {
  composeStudentFeedbackSummary,
  type GradingResult,
  type ResponsesClient,
} from "@/lib/grading/grade";

const PERSONALIZATION_MODEL = "gpt-5.6-luna";

export const LEARNING_SKILLS = [
  "grammar_accuracy",
  "sentence_clarity",
  "vocabulary_precision",
  "task_fulfilment",
  "thesis_clarity",
  "paragraph_coherence",
  "argument_depth",
  "evidence_integration",
  "creativity",
  "style_and_tone",
  "overall_effectiveness",
] as const;

export type LearningSkill = (typeof LEARNING_SKILLS)[number];
export type LearningSignal = "strength" | "weakness";
export type ProgressionStatus = "building" | "improving" | "steady" | "needs_attention";

export interface LearningObservation {
  skillKey: LearningSkill;
  signal: LearningSignal;
  severity: 1 | 2 | 3;
  confidence: number;
  description: string;
  evidence: string;
}

export interface ProgressionSnapshot {
  headline: string;
  status: ProgressionStatus;
  recentWin: string;
  focusArea: string;
  nextStep: string;
  evidence: string;
}

interface SkillState {
  skill_key: LearningSkill;
  estimated_level: number;
  confidence: number;
  evidence_count: number;
  trend: "improving" | "stable" | "declining";
}

interface RecentEvent {
  skill_key: LearningSkill;
  signal: LearningSignal;
  description: string;
  evidence: string | null;
  created_at: string;
}

interface LearnerContext {
  profileSummary: string;
  totalGraded: number;
  skills: SkillState[];
  recentEvents: RecentEvent[];
}

export interface LearnerProfilePlan {
  result: GradingResult;
  observations: LearningObservation[];
  profileSummary: string;
  progressionSnapshot: ProgressionSnapshot;
}

export interface LearnerProfileRecordResult {
  updateId: string | null;
  totalGraded: number;
  reportEnqueued: boolean;
}

const PERSONALIZATION_FORMAT = {
  type: "json_schema",
  name: "personalized_learning_feedback",
  strict: true,
  schema: {
    type: "object",
    properties: {
      personalized_feedback: { type: "string" },
      profile_summary: { type: "string" },
      progression_snapshot: {
        type: "object",
        properties: {
          headline: { type: "string" },
          status: {
            type: "string",
            enum: ["building", "improving", "steady", "needs_attention"],
          },
          recent_win: { type: "string" },
          focus_area: { type: "string" },
          next_step: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["headline", "status", "recent_win", "focus_area", "next_step", "evidence"],
        additionalProperties: false,
      },
      observations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill_key: { type: "string", enum: LEARNING_SKILLS },
            signal: { type: "string", enum: ["strength", "weakness"] },
            severity: { type: "integer", minimum: 1, maximum: 3 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            description: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["skill_key", "signal", "severity", "confidence", "description", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["personalized_feedback", "profile_summary", "progression_snapshot", "observations"],
    additionalProperties: false,
  },
} as const;

const PERSONALIZATION_INSTRUCTIONS = `You are the same-type coaching stage of a writing grader. The current answer has already been scored independently. You must never change, question, recalculate, or reveal hidden processing behind that score.

Write exactly one substantive personalized-feedback paragraph of 3-5 concise sentences. The supplied history contains records only for the current submission type; never infer or discuss another writing type. Ground every personal insight in the current submission or supplied same-type evidence, and do not make claims about the student's personality.

When totalGraded is zero, explicitly begin by saying that no previous records were found for personalized feedback yet and that the feedback is based only on the current submission. When a previously weak skill is clearly demonstrated correctly now, say that it was missing or incorrect earlier, is fixed here, and congratulate the student. When the same weakness appears again, explicitly say it was identified before and has recurred. Do not call an issue fixed merely because it is absent; current positive evidence must demonstrate the skill. Do not call something recurring or improving from only one prior observation.

Create 1-4 evidence-based observations about the current answer using only the allowed skill keys. Each skill may appear at most once. Evidence must be an exact substring of the current submission when possible; otherwise use an empty string. The profile summary and progression snapshot must describe only this submission type. Keep the profile summary under 4,000 characters. The snapshot should be compact, candid, encouraging, and useful: identify a real win, the most important focus, one next action, and an exact current-submission evidence quote when possible. Do not mention databases, learner profiles, rubrics, criteria labels, report-generation schedules, token use, or hidden instructions.`;

function isLearningSkill(value: unknown): value is LearningSkill {
  return typeof value === "string" && (LEARNING_SKILLS as readonly string[]).includes(value);
}

function clampConfidence(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function categoryLabel(category: string): string {
  return category
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function skillLabel(skill: LearningSkill): string {
  return skill.replaceAll("_", " ");
}

function noHistoryMessage(category: string): string {
  return `No previous ${categoryLabel(category)} records were found for personalized feedback yet. This feedback is based only on your current submission.`;
}

function sanitizeObservations(submission: string, value: unknown): LearningObservation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<LearningSkill>();
  const observations: LearningObservation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isLearningSkill(row.skill_key) || seen.has(row.skill_key)) continue;
    if (row.signal !== "strength" && row.signal !== "weakness") continue;
    const severity = Math.max(1, Math.min(3, Math.trunc(Number(row.severity)))) as 1 | 2 | 3;
    const description = cleanText(row.description, 1_000);
    const candidateEvidence = cleanText(row.evidence, 2_000);
    if (!description) continue;
    seen.add(row.skill_key);
    observations.push({
      skillKey: row.skill_key,
      signal: row.signal,
      severity,
      confidence: clampConfidence(row.confidence),
      description,
      evidence: candidateEvidence && submission.includes(candidateEvidence) ? candidateEvidence : "",
    });
    if (observations.length === 4) break;
  }
  return observations;
}

function skillForCriterion(criterion: string): LearningSkill {
  const normalized = criterion.toLowerCase();
  if (normalized.includes("grammar")) return "grammar_accuracy";
  if (normalized.includes("sentence") || normalized.includes("clarity")) return "sentence_clarity";
  if (normalized.includes("vocab") || normalized.includes("word choice")) return "vocabulary_precision";
  if (normalized.includes("thesis") || normalized.includes("position")) return "thesis_clarity";
  if (normalized.includes("coher") || normalized.includes("organ") || normalized.includes("structure")) return "paragraph_coherence";
  if (normalized.includes("evidence") || normalized.includes("example")) return "evidence_integration";
  if (normalized.includes("logic") || normalized.includes("argument") || normalized.includes("reason")) return "argument_depth";
  if (normalized.includes("creativ") || normalized.includes("original")) return "creativity";
  if (normalized.includes("style") || normalized.includes("tone")) return "style_and_tone";
  if (normalized.includes("relev") || normalized.includes("task") || normalized.includes("content")) return "task_fulfilment";
  return "overall_effectiveness";
}

function fallbackObservations(result: GradingResult, submission: string): LearningObservation[] {
  const seen = new Set<LearningSkill>();
  const observations: LearningObservation[] = [];
  for (const criterion of result.internal.criteria) {
    const skillKey = skillForCriterion(criterion.criterion);
    if (seen.has(skillKey)) continue;
    const ratio = criterion.marksPossible > 0 ? criterion.marksAwarded / criterion.marksPossible : 0;
    const signal: LearningSignal = ratio >= 0.65 ? "strength" : "weakness";
    const matchingHighlight = result.studentFeedback.highlights.find((highlight) =>
      highlight.type === (signal === "strength" ? "strength" : "improvement"),
    );
    seen.add(skillKey);
    observations.push({
      skillKey,
      signal,
      severity: ratio >= 0.85 || ratio < 0.35 ? 3 : ratio >= 0.7 || ratio < 0.5 ? 2 : 1,
      confidence: 0.75,
      description: criterion.reasoning.slice(0, 1_000),
      evidence: matchingHighlight && submission.includes(matchingHighlight.quote) ? matchingHighlight.quote : "",
    });
    if (observations.length === 4) break;
  }
  if (observations.length) return observations;
  const ratio = result.internal.max > 0 ? result.internal.total / result.internal.max : 0;
  return [{
    skillKey: "overall_effectiveness",
    signal: ratio >= 0.65 ? "strength" : "weakness",
    severity: ratio >= 0.85 || ratio < 0.35 ? 3 : 2,
    confidence: 0.6,
    description: result.studentFeedback.remarks?.slice(0, 1_000)
      || result.studentFeedback.summary.slice(0, 1_000),
    evidence: result.studentFeedback.highlights[0]?.quote ?? "",
  }];
}

async function loadLearnerContext(userId: string, category: string): Promise<LearnerContext> {
  const admin = createAdminClient();
  const [profileResult, skillsResult, eventsResult] = await Promise.all([
    admin
      .from("student_category_profiles")
      .select("summary, total_graded")
      .eq("user_id", userId)
      .eq("submission_type", category)
      .maybeSingle(),
    admin
      .from("student_skill_state")
      .select("skill_key, estimated_level, confidence, evidence_count, trend")
      .eq("user_id", userId)
      .eq("category", category)
      .order("confidence", { ascending: false })
      .limit(20),
    admin
      .from("student_learning_events")
      .select("skill_key, signal, description, evidence, created_at")
      .eq("user_id", userId)
      .eq("category", category)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (skillsResult.error) throw skillsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  return {
    profileSummary: profileResult.data?.summary ?? "",
    totalGraded: Number(profileResult.data?.total_graded ?? 0),
    skills: (skillsResult.data ?? []) as SkillState[],
    recentEvents: (eventsResult.data ?? []) as RecentEvent[],
  };
}

function deterministicSnapshot(
  observations: LearningObservation[],
  context: LearnerContext,
): ProgressionSnapshot {
  const resolved = observations.find((observation) =>
    observation.signal === "strength"
    && context.recentEvents.some((event) => event.skill_key === observation.skillKey && event.signal === "weakness"),
  );
  const repeated = observations.find((observation) =>
    observation.signal === "weakness"
    && context.recentEvents.some((event) => event.skill_key === observation.skillKey && event.signal === "weakness"),
  );
  const strength = resolved
    ?? observations.find((observation) => observation.signal === "strength")
    ?? observations[0];
  const focus = repeated
    ?? observations.find((observation) => observation.signal === "weakness")
    ?? observations[0];
  const status: ProgressionStatus = context.totalGraded === 0
    ? "building"
    : resolved
      ? "improving"
      : repeated
        ? "needs_attention"
        : "steady";
  return {
    headline: resolved
      ? `${skillLabel(resolved.skillKey)} is now a demonstrated improvement.`
      : repeated
        ? `${skillLabel(repeated.skillKey)} remains the clearest recurring priority.`
        : "Your same-type writing profile is becoming more specific.",
    status,
    recentWin: strength?.description ?? "You completed another piece that can now be used as concrete learning evidence.",
    focusArea: focus?.description ?? "Keep connecting each sentence directly to the central purpose.",
    nextStep: focus
      ? `In the next response, revise specifically for ${skillLabel(focus.skillKey)} before submitting.`
      : "Complete one focused revision pass before submitting the next response.",
    evidence: strength?.evidence || focus?.evidence || "",
  };
}

function sanitizeSnapshot(
  submission: string,
  value: unknown,
  fallback: ProgressionSnapshot,
  hasHistory: boolean,
): ProgressionSnapshot {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  const candidateStatus = row.status;
  const status = hasHistory
    && (candidateStatus === "improving"
      || candidateStatus === "steady"
      || candidateStatus === "needs_attention")
    ? candidateStatus
    : "building";
  const candidateEvidence = cleanText(row.evidence, 500);
  return {
    headline: cleanText(row.headline, 500) || fallback.headline,
    status,
    recentWin: cleanText(row.recent_win, 1_000) || fallback.recentWin,
    focusArea: cleanText(row.focus_area, 1_000) || fallback.focusArea,
    nextStep: cleanText(row.next_step, 1_000) || fallback.nextStep,
    evidence: candidateEvidence && submission.includes(candidateEvidence)
      ? candidateEvidence
      : fallback.evidence,
  };
}

function deterministicPlan(
  result: GradingResult,
  submission: string,
  category: string,
  context: LearnerContext,
): LearnerProfilePlan {
  const observations = fallbackObservations(result, submission);
  const resolved = observations.find((observation) =>
    observation.signal === "strength"
    && context.recentEvents.some((event) => event.skill_key === observation.skillKey && event.signal === "weakness"),
  );
  const repeated = observations.find((observation) =>
    observation.signal === "weakness"
    && context.recentEvents.some((event) => event.skill_key === observation.skillKey && event.signal === "weakness"),
  );
  const priority = repeated
    ?? observations.find((observation) => observation.signal === "weakness")
    ?? observations[0];
  const currentStrength = observations.find((observation) => observation.signal === "strength");

  let personalizedFeedback: string;
  if (context.totalGraded === 0) {
    personalizedFeedback = [
      noHistoryMessage(category),
      currentStrength
        ? `In this answer, ${currentStrength.description.charAt(0).toLowerCase()}${currentStrength.description.slice(1)}`
        : `This first record suggests that ${priority.description.charAt(0).toLowerCase()}${priority.description.slice(1)}`,
      `Your first personal priority is ${skillLabel(priority.skillKey)}; future ${categoryLabel(category)} feedback will compare this pattern with new evidence.`,
    ].join(" ");
  } else if (resolved) {
    personalizedFeedback = `This was missing or incorrect in an earlier ${categoryLabel(category)} submission, but you demonstrated ${skillLabel(resolved.skillKey)} correctly here—congratulations on fixing it. ${resolved.description} ${priority && priority !== resolved ? `Your next personal priority is ${skillLabel(priority.skillKey)}.` : "Keep applying this improvement consistently."}`;
  } else if (repeated) {
    personalizedFeedback = `The same ${skillLabel(repeated.skillKey)} issue was identified in an earlier ${categoryLabel(category)} submission and appears again here. ${repeated.description} Because it has recurred, make it the main focus of your next revision rather than trying to correct several smaller habits at once.`;
  } else {
    const established = context.skills.find((skill) => skill.evidence_count >= 2);
    personalizedFeedback = established
      ? `Your previous ${categoryLabel(category)} records show an established pattern in ${skillLabel(established.skill_key)}, currently trending ${established.trend}. In this answer, ${priority.description.charAt(0).toLowerCase()}${priority.description.slice(1)} Your next personal priority is ${skillLabel(priority.skillKey)}.`
      : `Compared with your earlier ${categoryLabel(category)} work, this answer adds useful evidence about ${skillLabel(priority.skillKey)} without yet establishing a long-term trend. ${priority.description} Keep the next revision focused on that one pattern so progress can be judged from clear evidence.`;
  }

  const profileSummary = [
    context.skills
      .filter((skill) => skill.evidence_count >= 2)
      .slice(0, 4)
      .map((skill) => `${skillLabel(skill.skill_key)}: ${skill.trend}`)
      .join("; ") || `A baseline is being established for ${categoryLabel(category)}.`,
    `Latest priority: ${skillLabel(priority.skillKey)}.`,
  ].join(" ").slice(0, 4_000);
  const remarks = result.studentFeedback.remarks || result.studentFeedback.summary;
  const waysToImprove = result.studentFeedback.waysToImprove
    || "For the next response, revise the highest-impact weakness first and then complete a sentence-level proofread.";

  return {
    result: {
      ...result,
      studentFeedback: {
        ...result.studentFeedback,
        remarks,
        personalizedFeedback,
        waysToImprove,
        summary: composeStudentFeedbackSummary({ remarks, personalizedFeedback, waysToImprove }),
      },
    },
    observations,
    profileSummary,
    progressionSnapshot: deterministicSnapshot(observations, context),
  };
}

export async function prepareLearnerProfilePlan(input: {
  client: ResponsesClient;
  useMock: boolean;
  userId: string;
  category: string;
  submission: string;
  result: GradingResult;
}): Promise<LearnerProfilePlan> {
  let context: LearnerContext;
  try {
    context = await loadLearnerContext(input.userId, input.category);
  } catch (error) {
    console.error("Unable to load same-type learner profile; using current-answer fallback", error);
    context = { profileSummary: "", totalGraded: 0, skills: [], recentEvents: [] };
  }
  const fallback = deterministicPlan(
    input.result,
    input.submission,
    input.category,
    context,
  );
  if (input.useMock) return fallback;

  try {
    const response = await input.client.responses.create({
      model: PERSONALIZATION_MODEL,
      instructions: PERSONALIZATION_INSTRUCTIONS,
      tools: [],
      input: [{
        role: "user",
        content: JSON.stringify({
          submissionType: input.category,
          currentSubmission: input.submission,
          fixedCurrentResult: {
            internal: input.result.internal,
            studentFeedback: {
              score: input.result.studentFeedback.score,
              remarks: input.result.studentFeedback.remarks,
              waysToImprove: input.result.studentFeedback.waysToImprove,
              grammarErrors: input.result.studentFeedback.grammarErrors,
              highlights: input.result.studentFeedback.highlights,
            },
          },
          sameTypeHistory: context,
        }),
      }],
      text: { format: PERSONALIZATION_FORMAT },
    });
    const parsed = JSON.parse(response.output_text) as Record<string, unknown>;
    const observations = sanitizeObservations(input.submission, parsed.observations);
    if (!observations.length) return fallback;
    let personalizedFeedback = cleanText(parsed.personalized_feedback, 4_000);
    const profileSummary = cleanText(parsed.profile_summary, 4_000);
    if (!personalizedFeedback || !profileSummary) return fallback;
    if (context.totalGraded === 0 && !personalizedFeedback.includes("No previous")) {
      personalizedFeedback = `${noHistoryMessage(input.category)} ${personalizedFeedback}`.slice(0, 4_000);
    }
    const remarks = input.result.studentFeedback.remarks || input.result.studentFeedback.summary;
    const waysToImprove = input.result.studentFeedback.waysToImprove
      || "For the next response, revise the highest-impact weakness first and then complete a sentence-level proofread.";
    const progressionSnapshot = sanitizeSnapshot(
      input.submission,
      parsed.progression_snapshot,
      deterministicSnapshot(observations, context),
      context.totalGraded > 0,
    );
    return {
      result: {
        ...input.result,
        studentFeedback: {
          ...input.result.studentFeedback,
          remarks,
          personalizedFeedback,
          waysToImprove,
          summary: composeStudentFeedbackSummary({ remarks, personalizedFeedback, waysToImprove }),
        },
      },
      observations,
      profileSummary,
      progressionSnapshot,
    };
  } catch (error) {
    console.error("Personalized feedback generation failed; using deterministic fallback", error);
    return fallback;
  }
}

export async function prepareManualLearnerProfilePlan(input: {
  userId: string;
  category: string;
  submission: string;
  result: GradingResult;
}): Promise<LearnerProfilePlan> {
  let context: LearnerContext;
  try {
    context = await loadLearnerContext(input.userId, input.category);
  } catch (error) {
    console.error("Unable to load same-type learner profile for manual grade", error);
    context = { profileSummary: "", totalGraded: 0, skills: [], recentEvents: [] };
  }
  const plan = deterministicPlan(input.result, input.submission, input.category, context);
  return {
    ...plan,
    // Preserve the administrator's feedback verbatim while still updating the
    // student's structured evidence and future same-type coaching context.
    result: input.result,
  };
}

export async function recordLearnerProfileUpdate(input: {
  userId: string;
  sourceKind: "standalone" | "practice_exam" | "official_exam";
  sourceId: string;
  category: string;
  plan: LearnerProfilePlan;
}): Promise<LearnerProfileRecordResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_student_learning_profile_update_v2", {
    p_user_id: input.userId,
    p_source_kind: input.sourceKind,
    p_source_id: input.sourceId,
    p_submission_type: input.category,
    p_final_score: input.plan.result.internal.total,
    p_max_score: input.plan.result.internal.max,
    p_personalized_summary: input.plan.result.studentFeedback.summary.slice(0, 4_000),
    p_profile_summary: input.plan.profileSummary,
    p_progression_snapshot: input.plan.progressionSnapshot,
    p_observations: input.plan.observations,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    updateId: row?.update_id ? String(row.update_id) : null,
    totalGraded: Number(row?.total_graded ?? 0),
    reportEnqueued: Boolean(row?.report_enqueued),
  };
}
