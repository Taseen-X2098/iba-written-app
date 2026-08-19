import { calibrateAiFinalMark, floorMarkToHalf, formatScore } from "./marks";

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
    [7, 10, 5.5],
    [10, 10, 8.5],
    [5.6, 10, 4.5],
  ])("applies the AI factor before flooring (%p/%p)", (modelMark, maximum, expected) => {
    expect(calibrateAiFinalMark(modelMark, maximum)).toBe(expected);
  });

  it("formats integer and half marks consistently", () => {
    expect(formatScore(5.5, 10)).toBe("5.5/10");
    expect(formatScore(4, 5)).toBe("4/5");
  });
});
