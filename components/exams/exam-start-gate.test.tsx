/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import ExamStartGate from "./exam-start-gate";
import type { Exam } from "@/lib/types";

const exam: Exam = {
  id: "exam-1",
  title: "Weekly Exam",
  description: null,
  time_limit_minutes: 60,
  starts_at: "2026-09-05T00:00:00.000Z",
  ends_at: "2026-09-06T00:00:00.000Z",
  is_published: true,
  results_published: true,
  results_version: 1,
  is_magnus_only: false,
  is_free: false,
  created_by: "admin-1",
  created_at: "2026-09-05T00:00:00.000Z",
  updated_at: "2026-09-05T00:00:00.000Z",
};

it("labels an existing practice workflow as resumable before the student clicks", () => {
  render(
    <ExamStartGate
      exam={exam}
      userId="student-1"
      mode="practice"
      hasResumableAttempt
    />,
  );

  expect(screen.getByRole("button", { name: "Resume Practice" })).toBeInTheDocument();
  expect(screen.getByText(/answers stay safe while you choose grading/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start Practice" })).not.toBeInTheDocument();
});
