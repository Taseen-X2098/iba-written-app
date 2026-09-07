/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AutoFinalizer from "./auto-finalizer";
import { inProgressExamStorageKey } from "@/lib/exams/in-progress-exam";

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
const mockRouter = { replace: mockReplace, refresh: mockRefresh };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const props = {
  attemptId: "attempt-1",
  examId: "exam-1",
  userId: "student-1",
};

function seedBrowserState() {
  localStorage.setItem(
    inProgressExamStorageKey(props.attemptId),
    JSON.stringify({
      userId: props.userId,
      examId: props.examId,
      attemptId: props.attemptId,
      title: "Weekly Exam",
      isPractice: false,
      phase: "taking",
      expiresAt: "2026-09-06T09:00:00.000Z",
      lastUpdatedAt: Date.now(),
    }),
  );
  localStorage.setItem(`attempt-recovery-data:${props.attemptId}`, "encrypted");
  sessionStorage.setItem(`attempt-recovery-key:${props.attemptId}`, "key");
  sessionStorage.setItem(
    `exam-attempt-session:${props.userId}:${props.examId}:official`,
    JSON.stringify({ attemptId: props.attemptId, writerToken: "writer" }),
  );
}

function installFetchMock(fetchMock: jest.Mock) {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
  return fetchMock;
}

describe("expired official attempt finalization", () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("posts only to the attempt-scoped endpoint and clears browser state after success", async () => {
    seedBrowserState();
    const fetchMock = installFetchMock(jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }));

    render(<AutoFinalizer {...props} />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(
      "/exams/exam-1/results#my-response",
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exam-attempts/attempt-1/finalize-expired",
      { method: "POST" },
    );
    expect(localStorage.getItem(inProgressExamStorageKey(props.attemptId))).toBeNull();
    expect(localStorage.getItem(`attempt-recovery-data:${props.attemptId}`)).toBeNull();
    expect(sessionStorage.getItem(`attempt-recovery-key:${props.attemptId}`)).toBeNull();
    expect(sessionStorage.getItem(
      `exam-attempt-session:${props.userId}:${props.examId}:official`,
    )).toBeNull();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps the saved browser state and exposes a retry after a transient failure", async () => {
    seedBrowserState();
    const fetchMock = installFetchMock(jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Connection interrupted", code: "INTERNAL_ERROR" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      }));

    render(<AutoFinalizer {...props} />);

    expect(await screen.findByText("Connection interrupted")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(inProgressExamStorageKey(props.attemptId))).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Retry Finalization/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it("automatically retries while durable OCR is pending", async () => {
    jest.useFakeTimers();
    const fetchMock = installFetchMock(jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Still scanning", code: "OCR_PENDING" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      }));

    render(<AutoFinalizer {...props} />);
    await act(async () => Promise.resolve());

    expect(screen.getByText(/last page photo is still being scanned/i)).toBeVisible();

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith("/exams/exam-1/results#my-response");
  });
});
