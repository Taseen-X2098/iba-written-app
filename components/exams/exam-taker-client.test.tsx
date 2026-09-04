/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExamTakerClient from "./exam-taker-client";
import type { AttemptQuestion, Exam, ExamAttempt } from "@/lib/types";

const mockPush = jest.fn();
const mockClearEncryptedRecovery = jest.fn((..._args: unknown[]) => undefined);
const mockLoadEncryptedRecovery = jest.fn(async (..._args: unknown[]) => ({}));
const mockSaveEncryptedRecovery = jest.fn(async (..._args: unknown[]) => undefined);
const originalFetch = globalThis.fetch;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/exams/recovery-client", () => ({
  clearEncryptedRecovery: (...args: unknown[]) => mockClearEncryptedRecovery(...args),
  loadEncryptedRecovery: (...args: unknown[]) => mockLoadEncryptedRecovery(...args),
  saveEncryptedRecovery: (...args: unknown[]) => mockSaveEncryptedRecovery(...args),
}));

const examQuestion: AttemptQuestion = {
  id: "exam-question-1",
  order_index: 0,
  marks: 10,
  questions: {
    id: "question-1",
    category: "argumentative_essay",
    marks: 10,
    difficulty: "medium",
    source: null,
    prompt: "Should public transport be free?",
    space_hint: null,
    max_images: 2,
    is_active: true,
    created_at: "2026-09-05T00:00:00.000Z",
    created_by: null,
  },
};

function makeExam(isMagnusOnly: boolean): Exam {
  return {
    id: isMagnusOnly ? "magnus-exam" : "weekly-exam",
    title: isMagnusOnly ? "Magnus Exam" : "Weekly Exam",
    description: null,
    time_limit_minutes: 60,
    starts_at: "2026-09-05T00:00:00.000Z",
    ends_at: "2026-09-06T00:00:00.000Z",
    is_published: true,
    results_published: false,
    results_version: 1,
    is_magnus_only: isMagnusOnly,
    created_by: "admin-1",
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  };
}

function makeAttempt(examId: string): ExamAttempt {
  return {
    id: `attempt-${examId}`,
    exam_id: examId,
    user_id: "student-1",
    mode: "official",
    status: "active",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    submitted_at: null,
    finalized_at: null,
    writer_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe.each([
  ["weekly", false],
  ["Magnus", true],
])("ExamTakerClient %s exam uploads", (_label, isMagnusOnly) => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/ocr") {
        return {
          ok: true,
          json: async () => ({ text: "Replacement text from another exam image." }),
        };
      }
      if (url.endsWith("/drafts")) {
        return { ok: true, json: async () => ({}) };
      }
      throw new Error(`Unexpected request: ${url}`);
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

  it("replaces the editor text after selecting another image", async () => {
    const exam = makeExam(isMagnusOnly);
    render(
      <ExamTakerClient
        exam={exam}
        examQuestions={[examQuestion]}
        attempt={makeAttempt(exam.id)}
        writerToken="writer-token"
        initialDrafts={{
          [examQuestion.id]: {
            ocrText: "Original exam text.",
            editedText: "Original exam text.",
            updatedAt: "2026-09-05T00:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByDisplayValue("Original exam text.")).toBeInTheDocument();
    expect(screen.getByText(/Paragraph check:/)).toBeInTheDocument();

    const uploadLabel = screen.getByText("Upload Another Image").closest("label");
    const upload = uploadLabel?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(upload).not.toBeNull();
    fireEvent.change(upload!, {
      target: { files: [new File(["replacement"], "replacement.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByDisplayValue("Replacement text from another exam image.")).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });
});
