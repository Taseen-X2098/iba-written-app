import { readFileSync } from "node:fs";
import path from "node:path";
import rubrics from "@/lib/grading/rubrics.json";
import { TASK_TYPES } from "@/lib/grading/tools";
import {
  STORY_COMPLETION_INSTRUCTION,
  splitStoryCompletionPrompt,
} from "@/lib/questions/story-completion";

type SeedRow = {
  marks: number;
  difficulty: "easy" | "medium" | "hard" | "very_hard";
  starter: string;
};

function countBy<T extends string | number>(values: T[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
    return counts;
  }, {});
}

describe("Story Completion integration", () => {
  const migrations = path.join(process.cwd(), "supabase", "migrations");
  const enumSql = readFileSync(
    path.join(migrations, "024_add_story_completion_category.sql"),
    "utf8",
  );
  const seedSql = readFileSync(
    path.join(migrations, "025_story_completion_questions.sql"),
    "utf8",
  );
  const rowPattern = /\((\d+),\s*'(easy|medium|hard|very_hard)'::difficulty_level,\s*\$story\$([\s\S]*?)\$story\$,\s*'((?:''|[^'])*)'\)/g;
  const rows: SeedRow[] = [...seedSql.matchAll(rowPattern)].map((match) => ({
    marks: Number(match[1]),
    difficulty: match[2] as SeedRow["difficulty"],
    starter: match[3].trim(),
  }));

  it("adds the enum in a migration before the seed uses it", () => {
    expect(enumSql).toContain("ADD VALUE IF NOT EXISTS 'story_completion'");
    expect(TASK_TYPES).toContain("story_completion");
  });

  it("contains exactly 125 unique starters with the approved distributions", () => {
    expect(rows).toHaveLength(125);
    expect(new Set(rows.map((row) => row.starter)).size).toBe(125);
    expect(countBy(rows.map((row) => row.marks))).toEqual({
      8: 21,
      9: 21,
      10: 21,
      12: 21,
      13: 21,
      15: 20,
    });
    expect(countBy(rows.map((row) => row.difficulty))).toEqual({
      easy: 25,
      medium: 50,
      hard: 37,
      very_hard: 13,
    });
  });

  it("keeps every starter at four lines and 30-45 words", () => {
    for (const row of rows) {
      const lines = row.starter.split(/\r?\n/u);
      const words = row.starter.split(/\s+/u);
      expect(lines).toHaveLength(4);
      expect(lines.slice(0, 3).every((line) => /[.!?]$/u.test(line))).toBe(true);
      expect(words.length).toBeGreaterThanOrEqual(30);
      expect(words.length).toBeLessThanOrEqual(45);
    }
  });

  it("ends most starters mid-sentence", () => {
    const unfinished = rows.filter((row) => !/[.!?]$/u.test(row.starter));
    expect(unfinished.length).toBeGreaterThanOrEqual(100);
  });

  it("builds the approved prompt, two-image rows, and an 18-question free pool", () => {
    expect(seedSql).toContain(`'${STORY_COMPLETION_INSTRUCTION}'`);
    expect(seedSql).toMatch(/prepared\.space_hint,\s*2\s+FROM prepared_questions/u);
    expect(seedSql).toContain("v_selected <> 18");
    expect(seedSql).toContain("('story_completion'::question_category)");

    const prompt = `${STORY_COMPLETION_INSTRUCTION}\n\n${rows[0].starter}`;
    expect(splitStoryCompletionPrompt(prompt, "story_completion")).toEqual({
      instruction: STORY_COMPLETION_INSTRUCTION,
      starter: rows[0].starter,
    });
  });

  it("has a complete rubric whose rows sum to every approved mark total", () => {
    const storyRubrics = rubrics.story_completion;
    expect(Object.keys(storyRubrics).sort((a, b) => Number(a) - Number(b))).toEqual([
      "8",
      "9",
      "10",
      "12",
      "13",
      "15",
    ]);

    for (const [marks, rubric] of Object.entries(storyRubrics)) {
      expect(rubric.total).toBe(Number(marks));
      expect(rubric.criteria.reduce((sum, criterion) => sum + criterion.marks, 0))
        .toBe(Number(marks));
    }
  });
});
