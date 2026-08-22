import { calculateStreak } from "./analytics";

describe("calculateStreak", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("counts consecutive Bangladesh calendar days once each", () => {
    expect(calculateStreak([
      new Date("2026-08-20T10:00:00.000Z"),
      new Date("2026-08-20T08:00:00.000Z"),
      new Date("2026-08-19T09:00:00.000Z"),
      new Date("2026-08-18T09:00:00.000Z"),
    ], now)).toBe(3);
  });

  it("keeps a streak alive when the latest submission was yesterday", () => {
    expect(calculateStreak([
      new Date("2026-08-19T09:00:00.000Z"),
      new Date("2026-08-18T09:00:00.000Z"),
    ], now)).toBe(2);
  });

  it("returns zero after a missed day", () => {
    expect(calculateStreak([
      new Date("2026-08-18T09:00:00.000Z"),
      new Date("2026-08-17T09:00:00.000Z"),
    ], now)).toBe(0);
  });

  it("uses Bangladesh dates across the UTC midnight boundary", () => {
    const justAfterMidnightInBangladesh = new Date("2026-08-19T18:30:00.000Z");

    expect(calculateStreak([
      justAfterMidnightInBangladesh,
      new Date("2026-08-19T17:59:00.000Z"),
      new Date("2026-08-18T17:59:00.000Z"),
    ], now)).toBe(3);
  });

  it("ignores invalid dates", () => {
    expect(calculateStreak([new Date("invalid")], now)).toBe(0);
  });
});
