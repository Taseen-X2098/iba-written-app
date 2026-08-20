import {
  countWords,
  getWordLimitViolation,
  wordLimitForMarks,
} from "./word-limit";

describe("answer word limits", () => {
  it("uses the same limits displayed by the clients", () => {
    expect(wordLimitForMarks(5)).toBe(90);
    expect(wordLimitForMarks(6)).toBe(110);
    expect(wordLimitForMarks(8)).toBe(110);
    expect(wordLimitForMarks(9)).toBe(140);
    expect(wordLimitForMarks(10)).toBe(140);
    expect(wordLimitForMarks(11)).toBe(150);
    expect(wordLimitForMarks(12)).toBe(150);
    expect(wordLimitForMarks(13)).toBe(160);
    expect(wordLimitForMarks(14)).toBe(180);
    expect(wordLimitForMarks(15)).toBe(180);
  });

  it("counts words across ordinary and multiline whitespace", () => {
    expect(countWords("  one\n two\tthree  ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("reports only answers that exceed their question limit", () => {
    expect(getWordLimitViolation("word ".repeat(90), 5)).toBeNull();
    expect(getWordLimitViolation("word ".repeat(91), 5)).toEqual({
      wordCount: 91,
      wordLimit: 90,
    });
    expect(getWordLimitViolation("word ".repeat(140), 10)).toBeNull();
    expect(getWordLimitViolation("word ".repeat(141), 10)).toEqual({
      wordCount: 141,
      wordLimit: 140,
    });
  });
});
