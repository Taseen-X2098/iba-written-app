import { requireApiUser } from "@/lib/auth";
import { getAvailableTestSlots } from "@/lib/exams/attempts";
import { resolveOcrContext } from "@/lib/ocr/context";
import { enforceOcrDailyProviderLimit, enforceOcrRateLimit } from "@/lib/ocr/rate-limit";
import { completeOcrRequest, reserveOcrRequest } from "@/lib/ocr/usage";
import { extractTextWithZai } from "@/lib/ocr/zai";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireApiUser: jest.fn() }));
jest.mock("@/lib/exams/attempts", () => ({ getAvailableTestSlots: jest.fn() }));
jest.mock("@/lib/ocr/context", () => ({ resolveOcrContext: jest.fn() }));
jest.mock("@/lib/ocr/rate-limit", () => ({
  enforceOcrDailyProviderLimit: jest.fn(),
  enforceOcrRateLimit: jest.fn(),
}));
jest.mock("@/lib/ocr/usage", () => ({
  reserveOcrRequest: jest.fn(),
  completeOcrRequest: jest.fn(),
}));
jest.mock("@/lib/ocr/zai", () => {
  class ZaiOcrError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  }
  return { extractTextWithZai: jest.fn(), ZaiOcrError };
});

const USER_ID = "10000000-0000-0000-0000-000000000001";
const QUESTION_ID = "20000000-0000-0000-0000-000000000002";
const mockedRequireUser = jest.mocked(requireApiUser);
const mockedGetSlots = jest.mocked(getAvailableTestSlots);
const mockedResolveContext = jest.mocked(resolveOcrContext);
const mockedRateLimit = jest.mocked(enforceOcrRateLimit);
const mockedDailyLimit = jest.mocked(enforceOcrDailyProviderLimit);
const mockedReserve = jest.mocked(reserveOcrRequest);
const mockedComplete = jest.mocked(completeOcrRequest);
const mockedExtract = jest.mocked(extractTextWithZai);

function makeRequest() {
  const formData = new FormData();
  formData.append("image", new File(["answer image"], "answer.png", { type: "image/png" }));
  formData.append("questionId", QUESTION_ID);
  return new Request("http://localhost/api/ocr", { method: "POST", body: formData });
}

describe("POST /api/ocr", () => {
  const originalMock = process.env.Z_AI_MOCK;
  const originalKey = process.env.Z_AI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireUser.mockResolvedValue({ id: USER_ID } as Awaited<ReturnType<typeof requireApiUser>>);
    mockedGetSlots.mockResolvedValue(1);
    mockedResolveContext.mockResolvedValue({
      contextKey: `standalone:${QUESTION_ID}:0`,
      questionId: QUESTION_ID,
      attemptId: null,
      examQuestionId: null,
    });
    mockedRateLimit.mockResolvedValue();
    mockedDailyLimit.mockResolvedValue();
    mockedReserve.mockImplementation(async (input) => ({
      id: "30000000-0000-0000-0000-000000000003",
      request_token: input.requestToken,
      status: "pending",
      extracted_text: null,
    }));
    mockedComplete.mockResolvedValue();
  });

  afterAll(() => {
    if (originalMock === undefined) delete process.env.Z_AI_MOCK;
    else process.env.Z_AI_MOCK = originalMock;
    if (originalKey === undefined) delete process.env.Z_AI_API_KEY;
    else process.env.Z_AI_API_KEY = originalKey;
  });

  it("blocks OCR without consuming anything when no slot remains", async () => {
    process.env.Z_AI_MOCK = "true";
    mockedGetSlots.mockResolvedValue(0);

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "INSUFFICIENT_SLOTS",
    }));
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedReserve).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("uses the local OCR path only when Z_AI_MOCK is exactly true", async () => {
    process.env.Z_AI_MOCK = "true";
    delete process.env.Z_AI_API_KEY;

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      text: expect.stringContaining("quick brown fox"),
      cached: false,
    }));
    expect(mockedExtract).not.toHaveBeenCalled();
    expect(mockedComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns a duplicate image from cache without using the daily provider allowance", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedReserve.mockResolvedValue({
      id: "30000000-0000-0000-0000-000000000003",
      request_token: "an-existing-token",
      status: "succeeded",
      extracted_text: "Previously extracted answer",
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Previously extracted answer",
      cached: true,
    });
    expect(mockedDailyLimit).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("uses Z.ai when mock mode is false", async () => {
    process.env.Z_AI_MOCK = "false";
    process.env.Z_AI_API_KEY = "zai-real-key";
    mockedExtract.mockResolvedValue("Real extracted answer");

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      text: "Real extracted answer",
      cached: false,
    });
    expect(mockedExtract).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "zai-real-key",
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      providerUserId: expect.stringMatching(/^user_[0-9a-f]{32}$/),
    }));
  });

  it("fails closed when real OCR has no API key", async () => {
    process.env.Z_AI_MOCK = "false";
    delete process.env.Z_AI_API_KEY;

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(mockedReserve).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });
});
