import { readFileSync } from "node:fs";
import path from "node:path";

describe("grading normalization migration safety", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "020_structured_learner_profiles.sql",
    ),
    "utf8",
  );

  it("backfills only results without the normalization marker", () => {
    const guardedBackfills = sql.match(
      /#>> '\{internal,normalizationVersion\}' IS DISTINCT FROM '1'/g,
    );
    expect(guardedBackfills).toHaveLength(3);
  });

  it("does not retain the raw model score in student-visible result JSON", () => {
    expect(sql).not.toContain("modelTotal");
  });

  it("applies the AI factor in triggers only to unmarked results", () => {
    expect(sql).toContain(
      "WHEN NEW.result #>> '{internal,normalizationVersion}' = '1' THEN 1",
    );
    expect(sql).toContain(
      "WHEN NEW.grading_result #>> '{internal,normalizationVersion}' = '1' THEN 1",
    );
    expect(sql).toContain("WHEN NEW.graded_by = 'ai' THEN 0.85");
  });
});
