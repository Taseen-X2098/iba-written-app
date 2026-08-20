import { calibrateAiFinalMark, floorMarkToHalf, formatScore, formatStoredScore } from "./marks";

describe("mark normalization", () => {
  it.each([
    [5.99, 5.5],
    [5.5, 5.5],
    [5.49, 5],
    [0.49, 0],
    [-2, 0],
  ])("floors %p to %p", (input, expected) => {
    expect(floorMarkToHalf(input)).toBe(expected);
  });

  it("caps marks at the available maximum", () => {
    expect(floorMarkToHalf(12, 10)).toBe(10);
  });

  it.each([
    [7, 10, 6],
    [10, 10, 9],
    [5.6, 10, 5],
  ])("applies the 90% AI factor before flooring (%p/%p)", (modelMark, maximum, expected) => {
    expect(calibrateAiFinalMark(modelMark, maximum)).toBe(expected);
  });

  it.each([
    [5, 5, 5],
    [5.6, 6, 5.5],
    [6, 6, 6],
  ])("does not calibrate questions worth at most 6 marks (%p/%p)", (modelMark, maximum, expected) => {
    expect(calibrateAiFinalMark(modelMark, maximum)).toBe(expected);
  });

  it("formats integer and half marks consistently", () => {
    expect(formatScore(5.5, 10)).toBe("5.5/10");
    expect(formatScore(4, 5)).toBe("4/5");
  });

  it("normalizes persisted score strings for display", () => {
    expect(formatStoredScore("8.0000000000000000/12")).toBe("8/12");
    expect(formatStoredScore("5.5000000000000000", 10)).toBe("5.5/10");
  });
});
