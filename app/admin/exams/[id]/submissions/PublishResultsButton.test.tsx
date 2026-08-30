/**
 * @jest-environment jsdom
 */

import { act, render, screen } from "@testing-library/react";
import PublishResultsButton from "./PublishResultsButton";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("PublishResultsButton", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("cannot be clicked after results are published", () => {
    render(
      <PublishResultsButton
        examId="40000000-0000-4000-8000-000000000004"
        allGraded
        examEnded
        endsAt="2026-08-30T00:00:00.000Z"
        hasSubmissions
        isPublished
      />,
    );

    const button = screen.getByRole("button", { name: /results published/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Results have already been published. Extend the deadline to reopen publication.",
    );
  });

  it("becomes available when an extended deadline passes", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));

    render(
      <PublishResultsButton
        examId="40000000-0000-4000-8000-000000000004"
        allGraded
        examEnded={false}
        endsAt="2026-08-30T12:00:01.000Z"
        hasSubmissions
        isPublished={false}
      />,
    );

    const button = screen.getByRole("button", { name: /publish results/i });
    expect(button).toBeDisabled();

    act(() => jest.advanceTimersByTime(1_001));

    expect(button).toBeEnabled();
  });
});
