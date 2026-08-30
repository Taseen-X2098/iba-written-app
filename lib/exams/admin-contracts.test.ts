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
    expect(examDefinitionSchema.parse(definition).isMagnusOnly).toBe(false);
  });

  it("accepts an explicit Magnus-only exam", () => {
    expect(examDefinitionSchema.parse({ ...definition, isMagnusOnly: true }).isMagnusOnly).toBe(true);
  });
});
