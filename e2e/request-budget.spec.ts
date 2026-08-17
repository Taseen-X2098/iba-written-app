import { expect, test } from "@playwright/test";

for (const path of ["/", "/questions", "/exams"]) {
  test(`production request budget: ${path}`, async ({ page, baseURL }) => {
    test.skip(!process.env.E2E_STUDENT_EMAIL, "Seeded staging student is required");
    const applicationRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const base = new URL(baseURL!);
      if (url.origin !== base.origin || url.pathname.startsWith("/_next/")) return;
      if (!["document", "xhr", "fetch"].includes(request.resourceType())) return;
      applicationRequests.push(`${request.method()} ${url.pathname}`);
    });

    await page.goto(path, { waitUntil: "networkidle" });
    expect(applicationRequests.length, applicationRequests.join("\n")).toBeLessThanOrEqual(20);
  });
}

test("exam metadata GET and prefetch never start an attempt", async ({ page }) => {
  const examId = process.env.E2E_LIVE_EXAM_ID;
  test.skip(!examId || !process.env.E2E_STUDENT_EMAIL, "Seeded student and E2E_LIVE_EXAM_ID are required");
  const starts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/attempts/start")) starts.push(request.url());
  });

  await page.goto(`/exams/${examId}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Start Official Exam" })).toBeVisible();
  expect(starts).toHaveLength(0);
});

test("@smoke health and unauthenticated login", async ({ request, browser }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const cleanPage = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await cleanPage.goto("/login");
  await expect(cleanPage.getByRole("button", { name: "Sign in" })).toBeVisible();
  await cleanPage.close();
});
