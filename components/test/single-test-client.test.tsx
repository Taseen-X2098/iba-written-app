/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import SingleTestClient from "@/components/test/single-test-client";
import { STANDALONE_SESSION_KEY } from "@/lib/exams/standalone-session";
import type { GradingResultJSON, Question } from "@/lib/types";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockClearEncryptedRecovery = jest.fn((..._args: unknown[]) => undefined);
const mockLoadEncryptedRecovery = jest.fn(async (..._args: unknown[]) => ({}));
const mockSaveEncryptedRecovery = jest.fn(async (..._args: unknown[]) => undefined);
const originalFetch = globalThis.fetch;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock("@/lib/exams/recovery-client", () => ({
  clearEncryptedRecovery: (...args: unknown[]) => mockClearEncryptedRecovery(...args),
  loadEncryptedRecovery: (...args: unknown[]) => mockLoadEncryptedRecovery(...args),
  saveEncryptedRecovery: (...args: unknown[]) => mockSaveEncryptedRecovery(...args),
}));

const question: Question = {
  id: "20000000-0000-4000-8000-000000000002",
  category: "basic_paragraph",
  marks: 10,
  difficulty: "easy",
  source: null,
  prompt: "Write a paragraph about persistence.",
  space_hint: null,
  max_images: 2,
  is_active: true,
  created_at: "2026-08-23T00:00:00.000Z",
  created_by: null,
};

const gradingResult: GradingResultJSON = {
  internal: { total: 8, max: 10, criteria: [] },
  studentFeedback: {
    score: "8/10",
    summary: "A focused response.",
    remarks: "A focused response.",
    personalizedFeedback: "Your organization is improving.",
    waysToImprove: "Add one concrete example.",
    grammarErrors: [],
    highlights: [],
  },
};

describe("SingleTestClient grading completion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn(() => "30000000-0000-4000-8000-000000000003") },
    });

    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Persistence rewards consistent effort." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ gradingResult, personalProgressionReport: null }),
      });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });

  it("shows feedback without refreshing the route after a successful grade", async () => {
    render(<SingleTestClient question={question} hasTestsAvailable />);

    fireEvent.click(screen.getByRole("button", { name: /start test/i }));

    const upload = document.querySelector<HTMLInputElement>("#file-upload-gallery");
    expect(upload).not.toBeNull();
    fireEvent.change(upload!, {
      target: { files: [new File(["answer"], "answer.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /process 1 page photo/i }));

    expect(await screen.findByText("Verify Text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /submit for grading/i }));

    expect(await screen.findByText("Your evaluated submission")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(STANDALONE_SESSION_KEY)).toBeNull();
  });
});
