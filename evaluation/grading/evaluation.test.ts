import { GRADING_EVALUATION_CASES } from "./cases";
import { PROPOSED_GRADES } from "./proposed-grades";
import { TASK_TYPES } from "@/lib/grading/tools";

describe("real grading evaluation fixtures", () => {
  it("contains exactly three cases for every AI-gradable rubric type", () => {
    expect(GRADING_EVALUATION_CASES).toHaveLength(18);

    for (const taskType of TASK_TYPES) {
      expect(
        GRADING_EVALUATION_CASES.filter((item) => item.taskType === taskType)
      ).toHaveLength(3);
    }
  });

  it("keeps one proposed grade for every case in the separate answer key", () => {
    const caseIds = GRADING_EVALUATION_CASES.map((item) => item.id).sort();
    expect(Object.keys(PROPOSED_GRADES).sort()).toEqual(caseIds);
  });

  it("uses valid score bands", () => {
    for (const testCase of GRADING_EVALUATION_CASES) {
      const proposed = PROPOSED_GRADES[testCase.id];
      expect(proposed.acceptableRange.min).toBeGreaterThanOrEqual(0);
      expect(proposed.acceptableRange.min).toBeLessThanOrEqual(proposed.targetScore);
      expect(proposed.targetScore).toBeLessThanOrEqual(proposed.acceptableRange.max);
      expect(proposed.acceptableRange.max).toBeLessThanOrEqual(testCase.marks);
    }
  });
});
