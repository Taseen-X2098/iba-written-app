/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExamBuilderClient from "./exam-builder-client";

const push = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("ExamBuilderClient free exam creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });

  it("publishes a mutually exclusive free-for-all setting in the create payload", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "44000000-0000-4000-8000-000000000001" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, examId: "45000000-0000-4000-8000-000000000001" }),
      });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const { container } = render(<ExamBuilderClient availableQuestions={[]} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Weekly Assessment 1"), { target: { value: "Open Assessment" } });
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-09-06T10:00" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-09-06T11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Write Question" }));
    fireEvent.change(screen.getByPlaceholderText("Type your custom question here..."), {
      target: { value: "Write one paragraph." },
    });

    const magnusOnly = screen.getByRole("checkbox", { name: /Magnus students only/ });
    const freeForAll = screen.getByRole("checkbox", { name: /Free for every student/ });
    fireEvent.click(magnusOnly);
    expect(magnusOnly).toBeChecked();
    fireEvent.click(freeForAll);
    expect(freeForAll).toBeChecked();
    expect(magnusOnly).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Save & Publish" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/questions");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/exams");
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      title: "Open Assessment",
      isPublished: true,
      isMagnusOnly: false,
      isFree: true,
      questions: [{
        questionId: "44000000-0000-4000-8000-000000000001",
        orderIndex: 0,
        marks: 10,
      }],
    });
    expect(push).toHaveBeenCalledWith("/admin/exams");
  });
});
