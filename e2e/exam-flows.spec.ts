import { expect, test } from "@playwright/test";

test("complete a seeded official exam", async ({ page }) => {
  const examId = process.env.E2E_LIVE_EXAM_ID;
  test.skip(!examId || !process.env.E2E_STUDENT_EMAIL, "Seeded student and reset E2E_LIVE_EXAM_ID are required");

  await page.goto(`/exams/${examId}`);
  await page.getByRole("button", { name: "Start Official Exam" }).click();
  await expect(page.getByText(/drafts save every 30 seconds/i)).toBeVisible();
  const typeButtons = page.getByRole("button", { name: "Type Answer" });
  if (await typeButtons.count()) await typeButtons.first().click();
  await page.locator("textarea").first().fill("A staging answer used to verify durable completion.");
  await page.getByRole("button", { name: "Save this answer" }).first().click();
  await page.getByRole("button", { name: "Submit Exam" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${examId}/results`));
});

test("complete, select, and grade a seeded practice run", async ({ page }) => {
  const examId = process.env.E2E_PRACTICE_EXAM_ID;
  test.skip(!examId || !process.env.E2E_STUDENT_EMAIL, "Seeded student and E2E_PRACTICE_EXAM_ID are required with USE_MOCK_GRADER=true");

  await page.goto(`/exams/${examId}?practice=true`);
  await page.getByRole("button", { name: "Start Practice" }).click();
  const typeButtons = page.getByRole("button", { name: "Type Answer" });
  if (await typeButtons.count()) await typeButtons.first().click();
  await page.locator("textarea").first().fill("A practice answer for the durable grading worker.");
  await page.getByRole("button", { name: "Finish Practice" }).click();
  await expect(page.getByText("Choose answers to grade")).toBeVisible();
  const choices = page.locator('input[type="checkbox"]');
  if (await choices.count()) await choices.first().check();
  await page.getByRole("button", { name: /Grade 1 Selected Answer/ }).click();
  await expect(page.getByText("Practice Complete")).toBeVisible({ timeout: 60_000 });
});
