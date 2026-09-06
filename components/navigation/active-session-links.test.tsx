/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ActiveSessionSidenavLinks } from "./active-session-links";
import type { ActiveSessionLink } from "@/lib/exams/active-sessions";

jest.mock("@/components/ui/navigation-loading-overlay", () => ({
  NavigationLoadingOverlay: () => null,
}));

const sessions: ActiveSessionLink[] = [
  {
    key: "exam:attempt-1",
    type: "exam",
    id: "exam-1",
    title: "Weekly Exam",
    lastUpdatedAt: 3,
  },
  {
    key: "exam:attempt-2",
    type: "exam",
    id: "exam-2",
    title: "Magnus Practice",
    isPractice: true,
    phase: "grading",
    timedOut: true,
    lastUpdatedAt: 2,
  },
  {
    key: "test:question-1",
    type: "test",
    id: "question-1",
    title: "Practice Question",
    lastUpdatedAt: 1,
  },
];

it("renders a separate sidenav link for every active session", () => {
  const onNavigate = jest.fn();
  render(<ActiveSessionSidenavLinks sessions={sessions} onNavigate={onNavigate} />);

  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Weekly Exam/i })).toHaveAttribute("href", "/exams/exam-1");
  expect(screen.getByRole("link", { name: /Magnus Practice/i })).toHaveAttribute("href", "/exams/exam-2?practice=true");
  expect(screen.getByText("Time Up · Grading")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Practice Question/i })).toHaveAttribute("href", "/test/question-1");

  fireEvent.click(screen.getByRole("link", { name: /Practice Question/i }));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});
