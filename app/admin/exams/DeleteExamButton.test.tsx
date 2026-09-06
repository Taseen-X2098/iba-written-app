/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteExamButton } from "./DeleteExamButton";

const refresh = jest.fn();
const originalFetch = globalThis.fetch;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("DeleteExamButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectUrl,
    });
    jest.restoreAllMocks();
  });

  it("enforces the five-second delay, downloads the CSV, and refreshes the list", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-disposition": "attachment; filename*=UTF-8''weekly-exam-results.csv",
      }),
      blob: async () => new Blob(["Rank,Score"]),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    const createObjectUrl = jest.fn().mockReturnValue("blob:exam-results");
    const revokeObjectUrl = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrl,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<DeleteExamButton examId="40000000-0000-4000-8000-000000000004" title="Weekly Exam" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const confirmButton = screen.getByRole("button", { name: "Delete & download CSV (5s)" });
    expect(confirmButton).toBeDisabled();

    act(() => jest.advanceTimersByTime(4000));
    expect(screen.getByRole("button", { name: "Delete & download CSV (1s)" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1000));
    const enabledButton = screen.getByRole("button", { name: "Delete & download CSV" });
    expect(enabledButton).toBeEnabled();
    fireEvent.click(enabledButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/exams/40000000-0000-4000-8000-000000000004",
      { method: "DELETE" },
    ));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:exam-results");
  });
});
