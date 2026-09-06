import { examDefinitionSchema } from "./admin-contracts";

const definition = {
  title: "Weekly exam",
  description: "Instructions",
  timeLimitMinutes: 30,
  startsAt: "2026-09-01T10:00:00.000Z",
  endsAt: "2026-09-01T11:00:00.000Z",
  isPublished: false,
  questions: [{
    questionId: "10000000-0000-4000-8000-000000000001",
    orderIndex: 0,
    marks: 10,
  }],
};

describe("exam definition audience", () => {
  it("defaults existing clients to a normal exam", () => {
    expect(examDefinitionSchema.parse(definition)).toMatchObject({
      isMagnusOnly: false,
      isFree: false,
    });
  });

  it("accepts an explicit Magnus-only exam", () => {
    expect(examDefinitionSchema.parse({ ...definition, isMagnusOnly: true }).isMagnusOnly).toBe(true);
  });

  it("accepts a free exam for every student", () => {
    expect(examDefinitionSchema.parse({ ...definition, isFree: true }).isFree).toBe(true);
  });

  it("rejects a contradictory free and Magnus-only audience", () => {
    expect(() => examDefinitionSchema.parse({
      ...definition,
      isFree: true,
      isMagnusOnly: true,
    })).toThrow("A free-for-all exam cannot be restricted to Magnus students");
  });
});
