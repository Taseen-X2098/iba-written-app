import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResponsesClient } from "@/lib/grading/grade";
import {
  CATEGORY_PROGRESS_REPORT_PROMPT_VERSION,
  hasPersonalProgressionAccess,
  sanitizeProgressionReport,
} from "@/lib/learning/progression";
import {
  CATEGORY_LABELS,
  type ProgressionReportContent,
  type ProgressionReportInsight,
  type QuestionCategory,
} from "@/lib/types";

const PROGRESSION_REPORT_MODEL = "gpt-5.6-luna";

type ClaimedReportJob = {
  id: string;
  user_id: string;
  submission_type: string;
  checkpoint: number;
  source_update_ids: string[];
  attempt_count: number;
};

type CompactEvent = {
  update_id: string;
  skill_key: string;
  signal: "strength" | "weakness";
  severity: number;
  description: string;
  evidence: string;
  created_at: string;
};

type CompactUpdate = {
  id: string;
  score: string;
  createdAt: string;
};

const PROGRESSION_REPORT_FORMAT = {
  type: "json_schema",
  name: "personal_progression_report",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      overview: { type: "string" },
      trajectory: {
        type: "string",
        enum: ["building", "improving", "steady", "needs_attention"],
      },
      strengths: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill: { type: "string" },
            insight: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["skill", "insight", "evidence"],
          additionalProperties: false,
        },
      },
      growth_areas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill: { type: "string" },
            insight: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["skill", "insight", "evidence"],
          additionalProperties: false,
        },
      },
      resolved_wins: {
        type: "array",
        items: {
          type: "object",
          properties: {
            skill: { type: "string" },
            insight: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["skill", "insight", "evidence"],
          additionalProperties: false,
        },
      },
      next_steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            reason: { type: "string" },
            example_line: { type: "string" },
          },
          required: ["action", "reason", "example_line"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "title",
      "overview",
      "trajectory",
      "strengths",
      "growth_areas",
      "resolved_wins",
      "next_steps",
    ],
    additionalProperties: false,
  },
} as const;

const PROGRESSION_REPORT_INSTRUCTIONS = `You create a premium category-level writing progression report from compact, structured evidence. All supplied evidence belongs to one student and exactly one question category. Never compare it with or mention another category.

Synthesize patterns across the supplied same-category responses. The report must describe the student's general approach to this category, not summarize or continue the feedback for the newest response. Distinguish established patterns from tentative one-response observations, recognize a previously weak skill only when later positive evidence demonstrates it, and congratulate a real resolved win. Explicitly identify a repeated problem only when two or more weakness observations support it. Never call a skill fixed merely because it is absent.

Write every field that the student will see in very simple, direct English. Assume the student knows only basic English. Use common words, short sentences, and one main idea per sentence. Avoid idioms and uncommon writing terms. If a writing term is necessary, explain it at once in plain words. Keep all useful evidence, careful comparisons, and important advice; simple English must not make the report vague, shallow, or less honest.

Write the overview as exactly two short paragraphs. Finish the first paragraph, add one empty line, and then start the second paragraph. Use the first paragraph for the main pattern or progress. Use the second for the main focus and why it matters. Include 1-3 strengths, 1-3 growth areas, 0-3 resolved wins, and exactly 2-3 next steps in their separate fields. Write each insight in 1-3 short sentences and explain why it matters in future questions from this category. Write each action as one short, direct sentence. Write each reason in 1-2 short sentences. Evidence may quote a supplied example, but the insight around it must explain the wider pattern. Every next step must work on a new question in this category; never tell the student to revise a completed answer, fix "marked" errors, add evidence to a particular argument, or reuse its topic, conclusion, or wording. Example lines should be simple templates with placeholders when needed, not claims that the student wrote them. Do not mention rubrics, databases, subscriptions, batching, report schedules, token use, prompts, models, or hidden instructions.`;

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function typeLabel(submissionType: string): string {
  return CATEGORY_LABELS[submissionType as QuestionCategory]
    ?? submissionType.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function skillLabel(skill: string): string {
  return skill.replaceAll("_", " ");
}

function insightFromEvent(event: CompactEvent, prefix = ""): ProgressionReportInsight {
  return {
    skill: skillLabel(event.skill_key),
    insight: `${prefix}${event.description}`.slice(0, 1_000),
    evidence: event.evidence.slice(0, 500),
  };
}

export function buildDeterministicProgressionReport(input: {
  submissionType: string;
  updates: CompactUpdate[];
  events: CompactEvent[];
}): ProgressionReportContent {
  const events = [...input.events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const strengths = [...events].reverse().filter((event) => event.signal === "strength");
  const weaknesses = [...events].reverse().filter((event) => event.signal === "weakness");
  const weaknessCounts = new Map<string, number>();
  for (const event of weaknesses) {
    weaknessCounts.set(event.skill_key, (weaknessCounts.get(event.skill_key) ?? 0) + 1);
  }
  const recurring = weaknesses.filter((event, index, rows) =>
    (weaknessCounts.get(event.skill_key) ?? 0) >= 2
    && rows.findIndex((candidate) => candidate.skill_key === event.skill_key) === index,
  );
  const resolved = strengths.filter((strength, index, rows) => {
    const priorWeakness = events.some((event) =>
      event.skill_key === strength.skill_key
      && event.signal === "weakness"
      && event.created_at < strength.created_at,
    );
    return priorWeakness && rows.findIndex((candidate) => candidate.skill_key === strength.skill_key) === index;
  });
  const status = resolved.length ? "improving" : recurring.length ? "needs_attention" : "steady";
  const primaryFocus = recurring[0] ?? weaknesses[0];
  const overview = resolved.length
    ? `You have clearly improved ${skillLabel(resolved[0].skill_key)} in your recent ${typeLabel(input.submissionType)} answers. Earlier answers showed a weakness, but a newer answer shows this skill as a strength.\n\n${primaryFocus ? `${skillLabel(primaryFocus.skill_key)} is now the main skill to work on.` : "Your next goal is to use this improvement every time."} Keep using the improved skill in your next answer.`
    : recurring.length
      ? `The same ${skillLabel(recurring[0].skill_key)} problem appears in more than one recent ${typeLabel(input.submissionType)} answer. This is a clear pattern, not a one-time mistake.\n\nWork on this problem first. It will help more than trying to fix many smaller problems at the same time.`
      : `Your recent ${typeLabel(input.submissionType)} answers give us a useful starting point. There is not enough evidence yet to make a strong claim about a long-term pattern.\n\nWe can still see a clear strength and one skill to practise next. More answers will show whether these points happen often.`;
  const strengthInsights = strengths
    .filter((event, index, rows) => rows.findIndex((candidate) => candidate.skill_key === event.skill_key) === index)
    .slice(0, 3)
    .map((event) => insightFromEvent(event));
  const growthAreas = (recurring.length ? recurring : weaknesses)
    .slice(0, 3)
    .map((event) => insightFromEvent(
      event,
      (weaknessCounts.get(event.skill_key) ?? 0) >= 2 ? "This has happened more than once: " : "",
    ));
  const category = typeLabel(input.submissionType);
  const prioritySkill = primaryFocus ? skillLabel(primaryFocus.skill_key) : "clarity and structure";
  return {
    title: `${category} Progress Report`,
    overview,
    trajectory: status,
    strengths: strengthInsights.length
      ? strengthInsights
      : [{ skill: "completed practice", insight: "These answers give us clear examples to compare with future work.", evidence: "" }],
    growthAreas,
    resolvedWins: resolved.slice(0, 3).map((event) => insightFromEvent(
      event,
      "This was weak before, but it is correct now. Congratulations: ",
    )),
    nextSteps: [
      {
        action: `For future ${category} responses, check ${prioritySkill} once before you submit.`,
        reason: primaryFocus
          ? `${primaryFocus.description} This check will help on every new question in this category.`
          : "One careful check makes progress easier to see than many quick changes.",
        exampleLine: "[Main point] is convincing because [specific evidence] demonstrates [relevant effect].",
      },
      {
        action: `Use a short ${category} checklist before you submit each new answer.`,
        reason: "The same checklist helps you catch repeated mistakes and keep improvements.",
        exampleLine: "Check: clear main point, ideas in a good order, specific support, and a clear final sentence.",
      },
    ],
  };
}

async function loadReportInput(job: ClaimedReportJob) {
  const admin = createAdminClient();
  const [updatesResult, eventsResult, previousResult] = await Promise.all([
    admin
      .from("student_profile_updates")
      .select("id, final_score, max_score, created_at, category")
      .eq("user_id", job.user_id)
      .eq("category", job.submission_type)
      .in("id", job.source_update_ids),
    admin
      .from("student_learning_events")
      .select("update_id, skill_key, signal, severity, description, evidence, created_at, category")
      .eq("user_id", job.user_id)
      .eq("category", job.submission_type)
      .in("update_id", job.source_update_ids),
    admin
      .from("student_progression_reports")
      .select("report")
      .eq("user_id", job.user_id)
      .eq("submission_type", job.submission_type)
      .lt("checkpoint", job.checkpoint)
      .order("checkpoint", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const result of [updatesResult, eventsResult, previousResult]) {
    if (result.error) throw result.error;
  }
  if ((updatesResult.data ?? []).length !== 3) {
    throw new Error("Progression report source updates are missing or cross-scoped");
  }

  const sourceOrder = new Map(job.source_update_ids.map((id, index) => [id, index]));
  const updates: CompactUpdate[] = (updatesResult.data ?? [])
    .map((update) => ({
      id: update.id,
      score: `${update.final_score}/${update.max_score}`,
      createdAt: update.created_at,
    }))
    .sort((a, b) => (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0));
  const events: CompactEvent[] = (eventsResult.data ?? []).map((event) => ({
    update_id: event.update_id,
    skill_key: event.skill_key,
    signal: event.signal as "strength" | "weakness",
    severity: Number(event.severity),
    description: cleanText(event.description, 500),
    evidence: cleanText(event.evidence, 300),
    created_at: event.created_at,
  }));
  return {
    submissionType: job.submission_type,
    checkpoint: job.checkpoint,
    previousReport: previousResult.data?.report
      ? { overview: cleanText((previousResult.data.report as Record<string, unknown>).overview, 1_000) }
      : null,
    updates,
    events,
  };
}

async function markReportFailure(job: ClaimedReportJob, error: unknown) {
  const admin = createAdminClient();
  const terminal = job.attempt_count >= 3;
  const message = error instanceof Error ? error.message : "Unknown progression-report failure";
  await admin
    .from("student_progression_report_jobs")
    .update({
      status: terminal ? "failed" : "queued",
      claimed_by: null,
      claimed_at: null,
      next_attempt_at: new Date(Date.now() + Math.min(60_000, 2 ** job.attempt_count * 2_000)).toISOString(),
      last_error: message.slice(0, 4_000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

async function processReportJob(job: ClaimedReportJob) {
  const admin = createAdminClient();
  try {
    const { data: existing } = await admin
      .from("student_progression_reports")
      .select("id")
      .eq("user_id", job.user_id)
      .eq("submission_type", job.submission_type)
      .eq("checkpoint", job.checkpoint)
      .maybeSingle();
    if (existing) {
      await admin
        .from("student_progression_report_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          claimed_by: null,
          claimed_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return;
    }
    if (!await hasPersonalProgressionAccess(job.user_id)) {
      throw new Error("Subscription inactive before progression report generation");
    }

    const reportInput = await loadReportInput(job);
    const inputJson = JSON.stringify(reportInput);
    const inputHash = createHash("sha256").update(inputJson).digest("hex");
    let report: ProgressionReportContent;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    if (process.env.USE_MOCK_GRADER === "true") {
      report = buildDeterministicProgressionReport(reportInput);
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient;
      const response = await client.responses.create({
        model: PROGRESSION_REPORT_MODEL,
        instructions: PROGRESSION_REPORT_INSTRUCTIONS,
        tools: [],
        input: [{ role: "user", content: inputJson }],
        text: { format: PROGRESSION_REPORT_FORMAT },
      });
      const parsed = JSON.parse(response.output_text) as unknown;
      const sanitized = sanitizeProgressionReport(parsed);
      if (!sanitized) throw new Error("Progression report did not match the required structure");
      report = sanitized;
      inputTokens = response.usage?.input_tokens ?? null;
      outputTokens = response.usage?.output_tokens ?? null;
    }

    const { error } = await admin.rpc("complete_student_progression_report_job", {
      p_job_id: job.id,
      p_report: report,
      p_input_hash: inputHash,
      p_model: process.env.USE_MOCK_GRADER === "true" ? "deterministic-mock" : PROGRESSION_REPORT_MODEL,
      p_prompt_version: CATEGORY_PROGRESS_REPORT_PROMPT_VERSION,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    });
    if (error) throw error;
  } catch (error) {
    await markReportFailure(job, error);
  }
}

export async function drainProgressionReportQueue(options?: {
  workerId?: string;
  batchSize?: number;
}) {
  const workerId = options?.workerId ?? `progression-${randomUUID()}`;
  const batchSize = options?.batchSize ?? 2;
  const admin = createAdminClient();
  let processed = 0;
  while (true) {
    const { data, error } = await admin.rpc("claim_student_progression_report_jobs", {
      p_worker_id: workerId,
      p_limit: batchSize,
    });
    if (error) throw error;
    const jobs = (data ?? []) as ClaimedReportJob[];
    if (!jobs.length) break;
    await Promise.all(jobs.map(processReportJob));
    processed += jobs.length;
  }
  return processed;
}
