# Implementation Plan: Comprehensive Bug Policing

I have conducted a rigorous security and logic audit of the codebase, focusing on the Exam Taker Flow, Admin Grading, and Practice Sandbox. I found exactly **3 genuine bugs** that could cause data corruption, broken admin flows, or sandbox breakouts.

No fake bugs were added. I will only implement these 3 verified fixes.

## 1. Security Vulnerability: FK Exploitation in Submissions
**Bug:** In `api/exam/submit/route.ts`, the server trusts the `examQuestionId` sent by the client in the `answers` array, blindly inserting it into `exam_submissions`. Because the `adminSupabase` client bypasses Row-Level Security, a malicious student could intercept the HTTP payload and swap their `examQuestionId` with a question ID from a completely different exam. The database foreign keys won't catch it (since the question exists), resulting in cross-exam data corruption.
**Fix:** Validate that every `ans.examQuestionId` in the request payload actually exists in the securely fetched `examQuestions` array (which is already scoped to `examId`). If they send a fake or mismatched ID, throw a `400 Bad Request`.

## 2. Practice Sandbox Breakout via AutoFinalizer
**Bug:** If a student takes a Practice Exam and lets their 3-minute grace period expire while closing the tab, the server forces them into the `AutoFinalizer` on next load. However, the `AutoFinalizer` does not know it's in Practice Mode! It sends a request to `/api/exam/finalize`, which assumes it's an Official exam and inserts empty submission rows into the official `exam_submissions` table! This permanently ruins the student's real exam attempt.
**Fix:** Pass `isPractice={isPractice}` from `app/(main)/exams/[id]/page.tsx` to `<AutoFinalizer />`. If `isPractice` is true, the `AutoFinalizer` should simply clear the local storage banner and redirect them to the dashboard, rather than attempting to hit the official finalize endpoint.

## 3. Feature Dead End: Cannot Republish Results
**Bug:** In the Admin Dashboard (`app/admin/exams/[id]/submissions/page.tsx`), once an admin clicks "Publish Results", the button completely vanishes and is replaced by a static "Results Published" text block. If the admin later realizes they made a grading mistake, fixes it, and wants to recalculate the leaderboard, they are completely stuck.
**Fix:** Keep the `PublishResultsButton` visible even after `results_published` is true, but change its label to "Recalculate & Republish". This allows admins to safely update the leaderboard after making grade corrections.

I am ready to implement these surgical fixes. Please review and approve!
