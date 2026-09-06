/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SingleTestClient from "@/components/test/single-test-client";
import {
  listStandaloneSessions,
  STANDALONE_SESSION_KEY,
  standaloneSessionStorageKey,
} from "@/lib/exams/standalone-session";
import type { GradingResultJSON, Question } from "@/lib/types";
import { USAGE_BALANCE_UPDATED_EVENT } from "@/lib/usage/balance-client";

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
    const usageUpdated = jest.fn();
    window.addEventListener(USAGE_BALANCE_UPDATED_EVENT, usageUpdated);
    render(<SingleTestClient question={question} hasTestsAvailable />);

    expect(screen.getByText("Paragraph Writing")).toBeInTheDocument();
    expect(screen.queryByText(/Write exactly one unified paragraph/)).not.toBeInTheDocument();

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
    expect(usageUpdated).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STANDALONE_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(standaloneSessionStorageKey(question.id))).toBeNull();
    window.removeEventListener(USAGE_BALANCE_UPDATED_EVENT, usageUpdated);
  });

  it("processes another selected image and keeps session controls in the editor", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Text from the first image." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Replacement text from another image." }),
      });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    render(<SingleTestClient question={question} hasTestsAvailable />);
    fireEvent.click(screen.getByRole("button", { name: /start test/i }));

    const firstUpload = document.querySelector<HTMLInputElement>("#file-upload-gallery");
    fireEvent.change(firstUpload!, {
      target: { files: [new File(["first"], "first.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /process 1 page photo/i }));

    expect(await screen.findByDisplayValue("Text from the first image.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause timer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restart timer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel session/i })).toBeInTheDocument();

    const retryUpload = document.querySelector<HTMLInputElement>("#ocr-retry-upload");
    fireEvent.change(retryUpload!, {
      target: { files: [new File(["second"], "second.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByDisplayValue("Replacement text from another image.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: /pause timer/i }));
    expect(screen.getByRole("button", { name: /resume timer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resume timer/i }));
    expect(await screen.findByDisplayValue("Replacement text from another image.")).toBeInTheDocument();
  });

  it("keeps separate active records when two question sessions are started", async () => {
    const secondQuestion = {
      ...question,
      id: "20000000-0000-4000-8000-000000000099",
      prompt: "Write an essay about public transport.",
    };
    const firstView = render(<SingleTestClient question={question} hasTestsAvailable />);
    const secondView = render(<SingleTestClient question={secondQuestion} hasTestsAvailable />);

    fireEvent.click(within(firstView.container).getByRole("button", { name: /start test/i }));
    fireEvent.click(within(secondView.container).getByRole("button", { name: /start test/i }));

    await waitFor(() => {
      expect(listStandaloneSessions(localStorage).map((session) => session.questionId).sort()).toEqual([
        question.id,
        secondQuestion.id,
      ].sort());
    });
  });
});
