import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("signup exposes the optional Magnus promocode", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Magnus Academy promocode (optional)")).toBeVisible();
  await expect(page.getByText(/submits your Magnus status for admin approval/i)).toBeVisible();
});

test("settings renders a clear Magnus membership state", async ({ page }) => {
  test.skip(!process.env.E2E_STUDENT_EMAIL, "A seeded authenticated student is required");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Magnus Academy" })).toBeVisible();
  await expect(page.getByText(/Approved Magnus student|Awaiting approval|submit their promocode/i)).toBeVisible();
});

test("admin candidates and all-students views expose email and approval controls", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "Seeded E2E admin credentials are required");
  await signIn(page, email!, password!);
  await page.goto("/admin/users");
  await expect(page.getByRole("button", { name: /Pending candidates/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /All students/ })).toBeVisible();
  await expect(page.getByPlaceholder(/Search name, email, or institute/)).toBeEnabled();
});

test("Magnus exam cards use the supplied logo and detailed leaderboard", async ({ page }) => {
  const email = process.env.E2E_MAGNUS_STUDENT_EMAIL;
  const password = process.env.E2E_MAGNUS_STUDENT_PASSWORD;
  const examId = process.env.E2E_MAGNUS_RESULTS_EXAM_ID;
  test.skip(!email || !password || !examId, "Approved Magnus credentials and a published-results exam are required");
  await signIn(page, email!, password!);
  await page.goto("/exams");
  await expect(page.locator('img[alt="Magnus Academy"]').first()).toBeVisible();
  await page.goto(`/exams/${examId}/results`);
  await expect(page.getByText(/participant/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Percentage" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Score" })).toBeVisible();
});

test("same-browser Magnus to normal switch clears private in-progress metadata", async ({ page }) => {
  const magnusEmail = process.env.E2E_MAGNUS_STUDENT_EMAIL;
  const magnusPassword = process.env.E2E_MAGNUS_STUDENT_PASSWORD;
  const normalEmail = process.env.E2E_NORMAL_STUDENT_EMAIL;
  const normalPassword = process.env.E2E_NORMAL_STUDENT_PASSWORD;
  const practiceExamId = process.env.E2E_MAGNUS_PRACTICE_EXAM_ID;
  test.skip(
    !magnusEmail || !magnusPassword || !normalEmail || !normalPassword || !practiceExamId,
    "Magnus and normal credentials plus a reset practice exam are required",
  );

  await signIn(page, magnusEmail!, magnusPassword!);
  await page.goto(`/exams/${practiceExamId}?practice=true`);
  const privateTitle = (await page.locator("h1").first().textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "Start Practice" }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("in_progress_exam")))).toBe(true);

  await page.getByRole("button", { name: "Logout" }).click();
  await signIn(page, normalEmail!, normalPassword!);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("in_progress_exam")))).toBe(false);
  if (privateTitle) await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0);
});
