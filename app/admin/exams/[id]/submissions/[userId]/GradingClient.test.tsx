/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GradingClient, { type GradingSubmission } from "./GradingClient";
import type { GradingResultJSON } from "@/lib/types";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

function submission(id: string, gradingResult: GradingResultJSON | null = null): GradingSubmission {
  return {
    id,
    edited_text: "A complete student answer.",
    answer_images: [],
    grading_result: gradingResult,
    graded_by: gradingResult ? "ai" as const : null,
    exam_questions: {
      marks: 10,
      questions: {
        category: "argumentative_essay",
        prompt: `Question for ${id}`,
      },
    },
  };
}

const aiResult = {
  internal: { total: 8, max: 10, criteria: [] },
  studentFeedback: {
    score: "8/10",
    summary: "Combined feedback",
    remarks: "The response makes a clear central claim.",
    personalizedFeedback: "Compared with earlier essays, the organization is more consistent.",
    waysToImprove: "Add one precise example and connect it explicitly to the claim.",
    grammarErrors: [],
    highlights: [],
  },
};

describe("GradingClient refreshed AI results", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fills every feedback box when refreshed server props contain the completed AI grade", async () => {
    const initial = submission("submission-1");
    const { rerender } = render(<GradingClient examId="exam-1" submissions={[initial]} />);

    expect(screen.getByLabelText("1. Remarks on this submission")).toHaveValue("");

    rerender(
      <GradingClient
        examId="exam-1"
        submissions={[submission("submission-1", aiResult)]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Score for question 1")).toHaveValue(8);
      expect(screen.getByLabelText("1. Remarks on this submission")).toHaveValue(aiResult.studentFeedback.remarks);
      expect(screen.getByLabelText("2. Personalized feedback")).toHaveValue(aiResult.studentFeedback.personalizedFeedback);
      expect(screen.getByLabelText("3. Ways to improve next time")).toHaveValue(aiResult.studentFeedback.waysToImprove);
    });
    expect(screen.getByLabelText("Select question 1 for AI grading")).toBeDisabled();
  });

  it("shows translation photos and keeps AI-only feedback controls out of human grading", () => {
    const translation = submission("translation-submission");
    translation.edited_text = "";
    translation.answer_images = [{
      id: "translation-image",
      pageIndex: 1,
      url: "https://example.test/signed-translation-page",
    }];
    translation.exam_questions.questions.category = "translation";

    render(<GradingClient examId="exam-1" submissions={[translation]} />);

    expect(screen.getByAltText("Translation answer page 1")).toBeInTheDocument();
    expect(screen.getAllByText(/never sent to AI/)).toHaveLength(2);
    expect(screen.queryByText("AI generated")).not.toBeInTheDocument();
  });

  it("preserves an unsaved manual edit in another answer while an AI result arrives", async () => {
    const { rerender } = render(
      <GradingClient
        examId="exam-1"
        submissions={[submission("submission-1"), submission("submission-2")]}
      />,
    );
    const remarks = screen.getAllByLabelText("1. Remarks on this submission");
    fireEvent.change(remarks[1], { target: { value: "Unsaved administrator remarks" } });

    rerender(
      <GradingClient
        examId="exam-1"
        submissions={[submission("submission-1", aiResult), submission("submission-2")]}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText("1. Remarks on this submission")[0]).toHaveValue(aiResult.studentFeedback.remarks);
    });
    expect(screen.getAllByLabelText("1. Remarks on this submission")[1]).toHaveValue("Unsaved administrator remarks");
  });
});
