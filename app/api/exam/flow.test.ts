import { CacheKeys, getRedis } from "@/lib/redis";
import { POST as legacyDraftPost } from "./draft/route";

describe("authoritative exam attempt contract", () => {
  beforeEach(async () => {
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";
    await getRedis().del(CacheKeys.attemptDrafts("attempt-123"));
  });

  it("does not permit the old per-question mutation endpoint", async () => {
    const response = await legacyDraftPost(
      new Request("http://localhost/api/exam/draft", {
        method: "POST",
        body: JSON.stringify({
          examId: "exam-123",
          examQuestionId: "question-123",
          editedText: "answer",
        }),
      }),
    );

    expect(response.status).toBe(410);
    await expect(
      getRedis().get("exam:exam-123:submission:user-123:question-123"),
    ).resolves.toBeNull();
  });

  it("stores acknowledged drafts under one document per attempt", async () => {
    const redis = getRedis();
    const key = CacheKeys.attemptDrafts("attempt-123");
    const draftDocument = {
      "exam-question-1": {
        ocrText: "ocr",
        editedText: "edited",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
      "exam-question-2": {
        ocrText: "",
        editedText: "second",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    };

    await redis.set(key, draftDocument);

    await expect(redis.get(key)).resolves.toEqual(draftDocument);
    expect(key).toBe("attempt:attempt-123:drafts");
  });

  it("versions leaderboard cache entries by publication and page", () => {
    expect(CacheKeys.leaderboard("exam-123", 7, 3)).toBe(
      "leaderboard:exam-123:v7:p3",
    );
  });
});
