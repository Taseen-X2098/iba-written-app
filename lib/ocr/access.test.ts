jest.mock("server-only", () => ({}));

import { getAvailableTestSlots } from "@/lib/exams/attempts";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOcrAccess } from "./access";

jest.mock("@/lib/exams/attempts", () => ({ getAvailableTestSlots: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "20000000-0000-4000-8000-000000000002";
const EXAM_ID = "30000000-0000-4000-8000-000000000003";

function queryReturning(data: unknown, error: unknown = null) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function mockAccessRows(input: {
  attempt?: { exam_id: string; mode: string; status: string } | null;
  exam?: { is_free: boolean } | null;
}) {
  const attemptQuery = queryReturning(input.attempt ?? null);
  const examQuery = queryReturning(input.exam ?? null);
  const from = jest.fn((table: string) => {
    if (table === "exam_attempts") return attemptQuery;
    if (table === "exams") return examQuery;
    throw new Error(`Unexpected table: ${table}`);
  });
  jest.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { from, attemptQuery, examQuery };
}

describe("OCR access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows ordinary OCR while at least one test slot remains", async () => {
    jest.mocked(getAvailableTestSlots).mockResolvedValue(1);

    await expect(requireOcrAccess({ userId: USER_ID })).resolves.toBeUndefined();

    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("allows a slotless active official attempt only when its server-owned exam is free", async () => {
    jest.mocked(getAvailableTestSlots).mockResolvedValue(0);
    const { attemptQuery } = mockAccessRows({
      attempt: { exam_id: EXAM_ID, mode: "official", status: "active" },
      exam: { is_free: true },
    });

    await expect(requireOcrAccess({
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
    })).resolves.toBeUndefined();

    expect(attemptQuery.eq).toHaveBeenCalledWith("id", ATTEMPT_ID);
    expect(attemptQuery.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(attemptQuery.eq).toHaveBeenCalledWith("mode", "official");
    expect(attemptQuery.eq).toHaveBeenCalledWith("status", "active");
  });

  it("denies slotless standalone OCR without querying exam metadata", async () => {
    jest.mocked(getAvailableTestSlots).mockResolvedValue(0);

    await expect(requireOcrAccess({
      userId: USER_ID,
      attemptId: null,
    })).rejects.toMatchObject({
      code: "INSUFFICIENT_SLOTS",
      status: 403,
    });

    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["a paid official exam", { exam_id: EXAM_ID, mode: "official", status: "active" }, { is_free: false }],
    ["an attempt not owned by the user", null, { is_free: true }],
  ])("denies slotless OCR for %s", async (_label, attempt, exam) => {
    jest.mocked(getAvailableTestSlots).mockResolvedValue(0);
    mockAccessRows({ attempt, exam });

    await expect(requireOcrAccess({
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
    })).rejects.toMatchObject({
      code: "INSUFFICIENT_SLOTS",
      status: 403,
    });
  });

  it.each([
    ["practice", "active"],
    ["official", "finalized"],
  ])("does not extend the free-exam exception to a slotless %s/%s attempt", async (mode, status) => {
    jest.mocked(getAvailableTestSlots).mockResolvedValue(0);
    const { from } = mockAccessRows({
      attempt: { exam_id: EXAM_ID, mode, status },
      exam: { is_free: true },
    });

    await expect(requireOcrAccess({
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
    })).rejects.toMatchObject({
      code: "INSUFFICIENT_SLOTS",
      status: 403,
    });

    expect(from).not.toHaveBeenCalledWith("exams");
  });
});
