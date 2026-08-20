import { readFileSync } from "node:fs";
import path from "node:path";

describe("grading normalization migration safety", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "022_ninety_percent_mark_calibration.sql",
    ),
    "utf8",
  );

  it("stores the new policy as normalization version 2", () => {
    expect(sql).toContain("'{internal,normalizationVersion}'");
    expect(sql).toContain("'2'::jsonb");
  });

  it("does not retain the raw model score in student-visible result JSON", () => {
    expect(sql).not.toContain("modelTotal");
  });

  it("preserves results already normalized by either application policy", () => {
    expect(sql).toContain("IN ('1', '2')");
  });

  it("applies 90% only when the question is worth more than 6 marks", () => {
    expect(sql).toContain("CASE WHEN v_maximum <= 6 THEN 1 ELSE 0.90 END");
  });

  it("enforces the policy on every AI result persistence table", () => {
    expect(sql).toContain("submissions_half_down_grade");
    expect(sql).toContain("exam_submissions_half_down_grade");
    expect(sql).toContain("grading_job_items_half_down_grade");
  });
});
