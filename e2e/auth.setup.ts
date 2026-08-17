import { expect, test as setup } from "@playwright/test";

setup("authenticate seeded staging student", async ({ page }) => {
  const email = process.env.E2E_STUDENT_EMAIL;
  const password = process.env.E2E_STUDENT_PASSWORD;
  setup.skip(!email || !password, "E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD are required");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: "playwright/.auth/student.json" });
});
