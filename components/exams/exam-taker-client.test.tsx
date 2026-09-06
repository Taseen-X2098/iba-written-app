/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    is_free: false,
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

  it("shows the question type without exposing grading instructions", () => {
    const basicParagraphQuestion: AttemptQuestion = {
      ...examQuestion,
      questions: {
        ...examQuestion.questions,
        category: "basic_paragraph",
        prompt: "Write a paragraph about persistence.",
      },
    };
    const exam = makeExam(isMagnusOnly);

    render(
      <ExamTakerClient
        exam={exam}
        examQuestions={[basicParagraphQuestion]}
        attempt={makeAttempt(exam.id)}
        writerToken="writer-token"
        initialDrafts={{
          [basicParagraphQuestion.id]: {
            ocrText: "Persistence matters.",
            editedText: "Persistence matters.",
            updatedAt: "2026-09-05T00:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByText("Paragraph Writing")).toBeInTheDocument();
    expect(screen.queryByText(/Write exactly one unified paragraph/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Starting a second paragraph will reduce your mark/)).not.toBeInTheDocument();
  });

  it("stores translation photos for human grading without calling OCR", async () => {
    const translationQuestion: AttemptQuestion = {
      ...examQuestion,
      id: "translation-exam-question",
      questions: {
        ...examQuestion.questions,
        id: "translation-question",
        category: "translation",
        prompt: "Translate the passage into Bangla.",
      },
    };
    jest.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/translation-images")) {
        return {
          ok: true,
          json: async () => ({
            manualReviewOnly: true,
            images: [{ id: "image-1", pageIndex: 1, url: "https://example.test/signed-page" }],
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const exam = makeExam(isMagnusOnly);
    render(
      <ExamTakerClient
        exam={exam}
        examQuestions={[translationQuestion]}
        attempt={makeAttempt(exam.id)}
        writerToken="writer-token"
        initialDrafts={{}}
      />,
    );

    expect(screen.queryByText("Type Answer")).not.toBeInTheDocument();
    expect(screen.getByText(/No OCR, transcription, or AI feedback/)).toBeInTheDocument();
    const uploadLabel = screen.getByText("Upload Page Photos").closest("label");
    const upload = uploadLabel?.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(upload!, {
      target: { files: [new File(["translation"], "translation.jpg", { type: "image/jpeg" })] },
    });

    expect(await screen.findByAltText("Translation answer page 1")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/translation-images"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith("/api/ocr", expect.anything());
  });

  it("waits for a last-second translation upload before automatic finalization", async () => {
    const translationQuestion: AttemptQuestion = {
      ...examQuestion,
      id: "translation-exam-question",
      questions: {
        ...examQuestion.questions,
        id: "translation-question",
        category: "translation",
        prompt: "Translate the passage into Bangla.",
      },
    };
    let finishUpload!: (response: Response) => void;
    jest.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/translation-images")) {
        return new Promise<Response>((resolve) => {
          finishUpload = resolve;
        });
      }
      if (url.endsWith("/complete")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const exam = makeExam(isMagnusOnly);
    const attempt = {
      ...makeAttempt(exam.id),
      expires_at: new Date(Date.now() + 100).toISOString(),
    };
    render(
      <ExamTakerClient
        exam={exam}
        examQuestions={[translationQuestion]}
        attempt={attempt}
        writerToken="writer-token"
        initialDrafts={{}}
      />,
    );

    const upload = screen.getByText("Upload Page Photos")
      .closest("label")
      ?.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(upload!, {
      target: { files: [new File(["translation"], "translation.jpg", { type: "image/jpeg" })] },
    });

    expect(screen.getByRole("button", { name: "Saving Image…" })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Waiting for Image Upload…" })).toBeDisabled();
    }, { timeout: 2_000 });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/complete"),
      expect.anything(),
    );

    await act(async () => {
      finishUpload({
        ok: true,
        json: async () => ({
          manualReviewOnly: true,
          images: [{ id: "image-1", pageIndex: 1, url: "https://example.test/signed-page" }],
        }),
      } as Response);
    });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/complete"),
      expect.objectContaining({ method: "POST" }),
    ));
  });
});
