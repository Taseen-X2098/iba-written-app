import { readFileSync } from "node:fs";
import path from "node:path";

function sqlString(value: string): string {
  return value.replaceAll("''", "'");
}

describe("seeded question-bank classification", () => {
  const migrations = path.join(process.cwd(), "supabase", "migrations");
  const seedSql = readFileSync(
    path.join(migrations, "008_iba_written_questions_full.sql"),
    "utf8",
  );
  const classificationSql = readFileSync(
    path.join(migrations, "018_fixed_free_question_pool.sql"),
    "utf8",
  );

  it("classifies every legacy opinion-writing prompt exactly once", () => {
    const opinionMatches = [...seedSql.matchAll(
      /INSERT INTO questions \(category, marks, difficulty, source, prompt, space_hint, max_images\)\s*(?:VALUES\s*)?\(\s*'basic_paragraph',\s*\d+,\s*'(?:easy|medium|hard|very_hard)',\s*NULL,\s*'((?:''|[^'])*)',/g,
    )];
    const sectionStart = classificationSql.indexOf("WITH basic_paragraph_prompts(prompt) AS (");
    const sectionEnd = classificationSql.indexOf("UPDATE public.questions q", sectionStart);
    const whitelistSection = classificationSql.slice(sectionStart, sectionEnd);
    const paragraphPrompts = [...whitelistSection.matchAll(/\('((?:''|[^'])*)'\)/g)]
      .map((match) => sqlString(match[1]));
    const opinionPrompts = new Set(
      opinionMatches.map((match) => sqlString(match[1])),
    );

    expect(opinionPrompts.size).toBe(250);
    expect(new Set(paragraphPrompts).size).toBe(50);
    expect(paragraphPrompts.every((prompt) => opinionPrompts.has(prompt))).toBe(true);
    expect(opinionPrompts.size - paragraphPrompts.length).toBe(200);
  });

  it("keeps argumentative essays at forty percent of the complete writing bank", () => {
    const categoryMatches = [...seedSql.matchAll(
      /INSERT INTO questions \(category, marks, difficulty, source, prompt, space_hint, max_images\)\s*(?:VALUES\s*)?\(\s*'(basic_paragraph|quote_analysis|creative_writing|personal_reflection)',/g,
    )];
    const counts = categoryMatches.reduce<Record<string, number>>((result, match) => {
      result[match[1]] = (result[match[1]] ?? 0) + 1;
      return result;
    }, {});
    const argumentative = 200;
    const paragraph = counts.basic_paragraph - argumentative;
    const total = categoryMatches.length;

    expect(counts).toEqual({
      basic_paragraph: 250,
      quote_analysis: 100,
      creative_writing: 80,
      personal_reflection: 70,
    });
    expect({ argumentative, paragraph, total }).toEqual({
      argumentative: 200,
      paragraph: 50,
      total: 500,
    });
    expect(argumentative / total).toBe(0.4);
  });
});
