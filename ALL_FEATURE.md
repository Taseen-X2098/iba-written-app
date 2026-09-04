# IBA Written App — Complete Feature Specification

This document catalogues every feature in the IBA Written App, an AI-powered platform for IBA DU written exam preparation.
Students upload handwritten answers, receive instant AI feedback, and compete in timed weekly exams with ranked leaderboards.

---

## 1. Authentication & Account Management

### 1.1 Email/Password Registration
Students register with their full name, institute, phone (optional), email, and password.
Password validation enforces a minimum of 6 characters with client-side confirmation matching.
Signup metadata (name, institute, phone) is passed to Supabase as user metadata for automatic profile row creation.

### 1.2 Email Verification
After signup, a verification email is sent via Supabase with a redirect through `/auth/callback`.
Unverified users are intercepted by the middleware and redirected to `/verify-email` on every navigation attempt.
The verify-email page provides a resend button so students aren't locked out if the original email expires.

### 1.3 Login
Standard email/password login via `signInWithPassword`.
Error messages from Supabase (invalid credentials, unverified email) are surfaced inline without page reloads.

### 1.4 Password Reset (Forgot Password)
Initiated from `/forgot-password` where the student enters their email.
The reset link routes through `/auth/callback?next=/reset-password` so the PKCE authorization code is exchanged server-side before the student reaches the new-password form.
A success state replaces the form with a confirmation message and a back-to-login link.

### 1.5 In-App Password Change
The Settings page lets authenticated users trigger a password reset email from within the app.
Uses the same `/auth/callback?next=/reset-password` flow to avoid the PKCE code-exchange problem.

### 1.6 Password Reset Form
The `/reset-password` page listens for the `PASSWORD_RECOVERY` auth state change event to confirm the session is valid before rendering the form.
A loading spinner ("Verifying your reset link…") is shown while the session resolves.
On successful update, the user is automatically redirected to the dashboard after a 2-second delay.

### 1.7 Auth Callback Route Handler
A server-side `GET` route at `/auth/callback` extracts the `code` query parameter, calls `exchangeCodeForSession()`, and redirects to the `next` parameter (defaulting to `/`).
This is the single point of PKCE code exchange for all auth flows: signup verification, password reset, and any future OAuth providers.

### 1.8 Proxy and Request-Scoped Authentication
The Next.js Proxy performs optimistic cookie routing only; it never calls Supabase. Protected layouts and API routes perform one authoritative `getUser()` validation through a React request cache, so nested server components reuse the same identity lookup. The authenticated layout loads profile, subscription, notification count, and shell state once. API routes still validate their own user or admin authorization.

---

## 2. Pricing Plans & Subscription System

### 2.1 Three-Tier Pricing
All prices are in BDT (Bangladeshi Taka) per month.

| Plan | Price | Practice Tests | Weekly Exams |
|------|-------|---------------|--------------|
| Practice Plan (`plan_1`) | ৳499 | 300/month | ✗ |
| Complete Plan (`plan_2`) | ৳699 | 300/month | ✓ |
| Exam Plan (`plan_3`) | ৳299 | 0 | ✓ |

### 2.2 Free Tier
Every new user receives 3 free AI-graded tests on signup (`FREE_TESTS_ON_SIGNUP = 3`).
These are tracked on the `profiles.free_tests_remaining` column and remain available when no eligible paid slot exists.

### 2.3 Extra Test Slots
Users on Plan 1 or Plan 2 can purchase additional test slots at ৳5 each (`EXTRA_TEST_PRICE = 5`).
Extra slots are tracked separately (`subscriptions.extra_tests_purchased`) and consumed before the base plan allowance to preserve the more valuable monthly quota.

### 2.4 Usage Calculation
A universal `getUsageInfo()` utility computes remaining tests, percentage, and a color-coded status bar.
The color thresholds are: green (>60%), yellow (>40%), orange (>20%), red (≤20%).
An upgrade prompt appears when usage drops below 40% for paid plans or below 1 test for free users.

### 2.5 Atomic Test Slot Consumption
PostgreSQL usage ledgers reserve slots under row locks in the order extra purchased → plan → free. Standalone grading uses an idempotency key; post-publication practice exams record one charge per selected answer. A successful grade consumes its reservation, a terminal failure refunds it, and retries cannot double-charge. Official weekly-exam grading never reserves or consumes test slots. Quota and submission completion occur through service-role-only database functions.

### 2.6 Subscription Page
Displays all three plans with feature lists, pricing, and a "Popular" badge on Plan 2.
Shows the current plan's remaining tests, expiry date, and a usage progress bar.
Includes an "Extra Slots" purchase section with a quantity selector and price calculation.
Links to external Google Forms for plan payment, extra slot payment, and mentorship.

---

## 3. Question Bank & Practice Tests

### 3.1 Question Categories
Six categories are supported, each with a human-readable label:
- **Argumentative Essay** — opinion-based prompts requiring structured argumentation
- **Quote Analysis** — analysis of a given quotation's meaning and implications
- **Creative Writing** — open-ended creative prompts
- **Personal Reflection** — introspective prompts about personal experiences
- **Paragraph Writing** — short-form focused paragraph responses
- **Translation** (English → Bangla) — restricted to weekly exams only; excluded from individual practice because OCR/AI grading cannot reliably evaluate Bangla script

### 3.2 Difficulty Levels
Four levels: Easy, Medium, Hard, Very Hard.
These are used for filtering in the question bank and influence the mark allocation via the rubric system.

### 3.3 Question Data Model
Each question stores: category, marks, difficulty, source (optional attribution), prompt text, space hint (e.g., "2 pages"), max images (how many photos a student can upload), an active/inactive toggle, and the creating admin's ID.
The seeded 500-question writing bank contains 200 argumentative essays, 50 basic paragraphs, 100 quote analyses, 80 creative-writing prompts, and 70 personal reflections. The opinion-writing prompts are explicitly classified by rubric intent rather than inferred from marks.

### 3.4 Question Bank Browsing
One authenticated application endpoint calls `get_question_bank_page`, which performs filtering, completion anti-joins, counting, ordering, and pagination in PostgreSQL. The browser no longer loads every exam-question ID and every prior submission ID before requesting a page.
Client-side infinite scrolling loads 10 questions per page with automatic "Load More" triggers.
Five filter dimensions are synced to URL search parameters for deep-linkable filtered views:
- Text search (matches prompt text)
- Category (all / specific category)
- Difficulty (all / specific level)
- Sort order (newest / oldest)
- Completion status (not done / done / all) — cross-referenced against the user's submission history

### 3.5 Translation Question Exclusion
Translation questions are filtered out of the student question bank but remain manageable by admins for official exams.
Navigating directly to a translation question's test page returns a 404 to prevent bypassing the filter.

---

## 4. Test-Taking Flow (Individual Practice)

### 4.1 Test Lifecycle States
A single test moves through seven states: `idle → running → paused → uploading → ocr_processing → editing → grading → feedback`.
Each state transition drives distinct UI rendering: timer display, file upload interface, OCR progress, text editor, grading spinner, and results view.

### 4.2 Timer
A client-side stopwatch counts upward from 0, recording how long the student takes.
The timer supports pause/resume and a restart button (with confirmation dialog).
Elapsed seconds are stored in the final submission for analytics.

### 4.3 Session Persistence (localStorage)
Each current test is saved to its own `localStorage` key under the `in_progress_test:` prefix on every state change. The legacy `in_progress_test` key mirrors the most recently updated test for backward compatibility.
This includes the question ID, prompt, category, marks, elapsed seconds, timer state, and a `lastUpdatedAt` timestamp.
If the student navigates away and returns within 1 hour, the session is restored automatically.
After 1 hour of inactivity, the stored session is treated as expired and cleared.

### 4.4 Active Test Reminder
The main shell detects in-progress tests and exams via localStorage on mount.
Every active test and exam appears as its own link in the desktop and mobile sidenav, ordered by the most recently updated session.
Cross-tab synchronization via `StorageEvent` and custom events ensures the list updates when a test starts or ends in another tab.

### 4.5 Image Upload
Students upload photos of their handwritten answers via file picker (JPEG, PNG, WebP, GIF; max 10MB).
Multiple image formats are accepted to accommodate different phone cameras and scanning apps.

### 4.6 Webcam Capture
An alternative to file upload — students can take a photo directly from the browser.
The webcam component supports front/rear camera toggle (critical for mobile phones photographing paper on a desk).
The captured image is converted to a JPEG File object and fed into the same upload pipeline.
Camera permissions are requested on demand with a descriptive error if denied.

### 4.7 OCR (Optical Character Recognition)
Uploaded JPEG or PNG images are sent to `/api/ocr`, which uses Z.ai's GLM-OCR layout-parsing endpoint to extract handwritten text.
A mock mode (`Z_AI_MOCK=true`) returns deterministic sample text without contacting Z.ai; every other value selects the real API and requires `Z_AI_API_KEY`.
Both paths require an authorized question context and at least one remaining test slot, but OCR itself does not consume a slot. Identical images are cached; short burst and generous daily limits apply only as user-level bulk-abuse safeguards, with no retry ceiling on an individual answer.
Extracted text is presented in an editable textarea so students can correct any OCR errors before grading.

### 4.8 Text Editing
After OCR, students review and edit the extracted text in a textarea.
This step is essential because OCR is imperfect — students correct misread characters, missing words, or merged paragraphs.
Both the original OCR text and the edited text are stored in the submission, creating an audit trail.

### 4.9 Test Quota Enforcement (Client & Server)
The client presents availability, but `/api/grade` derives the user, active question, category, and marks on the server. It reserves quota with `reserve_standalone_usage`, grades, and atomically inserts the submission plus consumes the charge with `complete_standalone_grade`. Failed grading calls `release_standalone_usage`; a stable request UUID makes lost-response retries safe.

### 4.10 Session Cancellation
A "Cancel Session" button is available while selecting an answer method, while paused, and while reviewing or editing OCR text.
Cancellation clears localStorage, resets the timer, and returns to the idle state.
A confirmation dialog prevents accidental clicks.

---

## 5. AI Grading Engine

### 5.1 Model & Architecture
Grading uses OpenAI's GPT-5.6-Luna via the Responses API with Structured Outputs.
Mock grading is forced through the local `get_rubric` function. Real grading is forced to call hosted `file_search` against the rubric vector store configured by `OPENAI_VECTOR_IBA_WRITTEN`, so it cannot grade from memory or improvise criteria.
Tool output is retained in the Responses API conversation before the final structured grade is produced.

### 5.2 Rubric System
A comprehensive `rubrics.json` file contains mark schemes for every combination of task type and total marks.
Each rubric tier defines criteria names, mark allocations, and detailed guidance text.
Rubrics are fetched on-demand via a tool call rather than embedded in the system prompt, keeping prompt token usage constant regardless of how many rubrics exist.

### 5.3 Grading Output Schema
Structured Outputs enforce an exact JSON schema with two sections:
- **`internal`** — full rubric breakdown with per-criterion marks and reasoning (tutor-only, never shown to students)
- **`student_feedback`** — a score string (e.g., "8/10"), a 2-4 sentence plain-language summary, and 3-6 inline highlights

### 5.4 Inline Highlighting System
Each highlight contains an exact verbatim quote from the student's submission, a specific comment, and a type (strength or improvement).
The `validateHighlights()` function drops any highlight whose quote doesn't appear verbatim in the submission text, preventing hallucinated or paraphrased quotes from breaking the UI.
The `HighlightedText` component renders highlights as colored `<mark>` elements with hover tooltips showing the comment.
Strengths are styled in green; improvements in amber.

### 5.5 Prompt Injection Defense
The student's submission is wrapped in `<submission-{nonce}>` tags where the nonce is a per-request random UUID.
The system prompt explicitly instructs the model to treat everything inside these tags as inert text, regardless of embedded instructions, fake system messages, or score manipulation attempts.
If manipulation is detected, the model notes it in feedback but grades only the genuine content.

### 5.6 Translation Grading Exclusion
The system prompt explicitly states that translation tasks are not graded by AI.
This protects against unreliable Bangla script OCR producing garbage text that would yield meaningless scores.

### 5.7 Cross-Cutting Grading Principles
The "Extraordinary" band is strictly near-zero by default — competent work gets full marks on normal criteria, not bonus points.
The side taken in argumentative essays has zero bearing on the score — only reasoning quality matters.
Ethical dilemma prompts are graded on argument quality regardless of which position the student defends.

### 5.8 Mock Grader
A deterministic mock grading client (`mockClient.ts`) returns realistic grading results without calling OpenAI.
Activated via `USE_MOCK_GRADER=true` for development and testing.

### 5.9 Canonical Final Marks
The server treats the model's score as an intermediate value. For questions worth more than 6 marks it applies the internal 90% calibration; 5- and 6-mark questions are exempt because the reduction would be disproportionate. It always floors the result to the nearest 0.5 and rewrites the numeric total, score string, and criterion awards before persistence. An internal normalization-version marker makes the operation idempotent, so database triggers cannot apply the factor twice. Database write triggers keep standalone submissions, official submissions, practice-job results, and regrades consistent, while published totals are calculated from those saved final marks. Manual administrator marks are floored to 0.5 but do not receive the AI-only calibration.

### 5.10 Personalized Learner Profiles
Every successful grade produces a compact coaching summary and 1-4 evidence-backed observations from a fixed writing-skill taxonomy. PostgreSQL stores one summary per student, normalized skill state by category, and source-linked learning events. Regrading the same answer replaces its events and rebuilds the skill state, preventing stale evidence. The profile informs future feedback only when enough history supports a pattern; it never changes the already-fixed score. Profile enrichment is best-effort after durable grading, so a profile outage cannot refund or duplicate a consumed test slot.

---

## 6. Weekly Exams

### 6.1 Access and Explicit Start
Plan 2 and Plan 3 can start an official exam while its global window is open. A page GET fetches metadata only: it neither starts an attempt nor returns questions, so prefetch and link scanning are harmless. The explicit start POST validates the plan, time window, and published state, then returns questions. Once started, an attempt can be completed even if the subscription later expires.

### 6.2 Authoritative Attempt Model
`exam_attempts` stores mode, status, server start/expiry, submission/finalization timestamps, and a versioned writer-token hash. A partial unique index permits one official attempt per student/exam while completed practice attempts do not block a new run. Official and live-practice creation is concurrency-safe.

### 6.3 Timer, Resume, and Takeover
The countdown is always derived from `expires_at`. At zero the editor locks immediately, performs one final draft batch, and uses only a three-minute network-completion grace. Reloads resume the same server time. An explicit takeover preserves time and drafts while rotating the writer token; the old writer receives `WRITER_REVOKED` and becomes read-only.

### 6.4 Draft Persistence and Recovery
All acknowledged answers live in one Redis hash at `attempt:{attemptId}:drafts`; atomic `HSET` batches avoid per-question keys and `KEYS` scans. Dirty answers flush every 30 seconds, after OCR, on manual save, and when the page becomes hidden. Only unacknowledged edits are kept locally, AES-GCM encrypted with a key held in tab-scoped session storage. Failed acknowledgements stay dirty.

### 6.5 Atomic Completion and Abandonment
`finalize_exam_attempt` locks the official attempt, snapshots the latest acknowledged drafts, inserts every exam answer, assigns explicit zero grades to blanks, and marks finalization in one transaction. Duplicate calls return the completed state. Connected clients finalize their own attempts, while admins can explicitly finalize one expired attempt or all expired attempts for an exam from the admin panel.

### 6.6 Practice Exam Completion
Practice opens only after results publication and every run starts after explicit confirmation. Finishing locks the answer snapshot before quota selection. Each non-empty selected, non-translation answer costs one slot. Translation is excluded from AI grading, quota, total, and denominator; unselected or blank non-translation answers score zero. Terminal failures refund reservations and failed answers can be retried without recharging successful work.

### 6.7 Durable Grading Jobs
Selected practice answers and official admin grading run through `grading_jobs` and `grading_job_items`. Items track claims, retries, exponential backoff, errors, cancellation, resume, and stale-claim recovery. Successful results are saved before completion is acknowledged; admin grades are never overwritten unless an admin explicitly enables regrading.

### 6.8 Publication and Leaderboard
Publication is one database transaction. It rejects early publication, non-final attempts, missing answer rows, and incomplete grades; rebuilds `exam_results`; assigns competition ranks with `RANK()` (`1, 2, 2, 4`); increments `results_version`; and triggers notifications only on the first false→true publication. “Recalculate & Republish” repeats the transaction after corrections.

The signed-in leaderboard RPC returns only name, institute, score, maximum, rank, total count, and result version. Pages contain at most 100 rows and are cached by exam/version/page. Student details expose submitted text, score, safe feedback, and verified highlights only after publication—never rubric reasoning or grader source.

---

## 7. Test History

### 7.1 Submission History
An infinite-scrolling list of all past practice test submissions.
Server-side prefetching via TanStack Query for instant initial page load.

### 7.2 Filtering
Submissions can be filtered by text search (matches prompt text) and by question category.
Filters are synced to URL search parameters for shareable/bookmarkable filtered views.

---

## 8. Progress Analytics

### 8.1 Overview Stats
Four stat cards at the top: Overall Accuracy (percentage), Tests Completed (count), Total Score (earned/max), and Day Streak.

### 8.2 Day Streak
Calculated from submission dates — counts consecutive days with at least one submission.
The streak considers both "today" and "yesterday" as valid starting points to avoid penalizing users who practice at different times.
Up to 365 days of history are checked for streak calculation.

### 8.3 Accuracy Trend Chart
A Recharts AreaChart showing daily average accuracy over time.
Data points are grouped by calendar date, with each day's score averaged across all submissions.
The chart uses a gradient fill from brand-600 to transparent for visual polish.

### 8.4 Performance by Topic
Category-level breakdown showing accuracy percentage and test count per question type.
Color-coded progress bars: green (≥80%), brand blue (≥60%), yellow (≥40%), red (<40%).
Helps students identify their weakest categories for targeted practice.

### 8.5 Dashboard Sparkline
A miniature sparkline of recent accuracy appears as a decorative element on the dashboard hero card.
If the user has fewer than 2 submissions, a static icon is shown instead.

---

## 9. Notifications

### 9.1 In-App Notifications
Four notification types: exam available, results published, subscription expiring, and inactivity reminder.
Each type has a distinct icon (trophy, crown, clock) and color scheme for instant visual differentiation.
Notifications are fetched from the `notifications` table sorted by date, limited to 50.

### 9.2 Unread Badge
The navigation bell icon shows an unread count badge.
The count is polled every 60 seconds and refreshed on navigation.

### 9.3 Mark as Read
Individual notifications can be marked read by clicking them.
A "Mark all read" button appears when unread notifications exist.

### 9.4 Push Notifications (Firebase Cloud Messaging)
FCM tokens are registered on the client via Firebase's `getToken()` with the service worker.
Tokens are stored in a `fcm_tokens` array on the profile row, with deduplication logic to prevent storing the same token twice.
A Supabase webhook triggers on `INSERT` into the `notifications` table, calling `/api/webhooks/push` which sends FCM multicast messages.
Failed tokens (e.g., from uninstalled apps) are automatically cleaned up after each send.

### 9.5 Service Worker
A Firebase Messaging service worker (`firebase-messaging-sw.js`) handles background push notifications when the app is not in the foreground.
Notification click events focus an existing app window or open a new one.

### 9.6 Permission Banner
The main shell tracks `Notification.permission` state and can display a banner prompting users to enable push notifications.

---

## 10. Settings

### 10.1 Profile Editing
Students can update their name, institute, and phone number from the settings page.
Changes are saved directly to the `profiles` table with inline success/error feedback.

### 10.2 Password Change
Triggers a password reset email (same flow as forgot-password) from within the authenticated session.
A one-click flow — the user clicks "Send reset link" and receives an email.

### 10.3 Tips Toggle
The `tips_enabled` field on the profile controls whether the daily tip card appears on the dashboard.
When disabled, the dashboard simply omits the tip section entirely rather than showing a placeholder.

---

## 11. Daily Tips

### 11.1 Tip Display
A random active tip is fetched from the `tips` table on each dashboard load.
Tips are shown in a styled card with a lightbulb icon and italicized quote formatting.
Only shown when the user's `tips_enabled` profile flag is true.

### 11.2 Tip Data Model
Each tip has: content text, an `is_active` boolean for soft-delete, and a creation timestamp.

---

## 12. Admin Panel

### 12.1 Access Control
The admin layout checks `profiles.is_admin` on every request.
Non-admin users are redirected to the main app's dashboard.
All admin server actions independently re-verify admin status before executing mutations.

### 12.2 Admin Dashboard Overview
Displays aggregate stats: total students, total exams, total submissions, active subscriptions, and total revenue.
Revenue is calculated by summing all completed bKash transactions.
Quick action links to "Create New Exam" and "Review Pending Submissions."

### 12.3 Admin Navigation
Desktop: a persistent sidebar with links to Overview, Manage Exams, Grading Queue, Question Bank, Manage Tips, Users, and Settings.
Mobile: a compact top bar with the admin branding.

---

## 13. Admin — Question Management

### 13.1 Question Bank List
Tabular view of all questions (excluding translation) sorted by creation date.
Columns: prompt (truncated), category, difficulty, marks, and action links.

### 13.2 Create Question
Form-based question creation with fields for prompt, category, difficulty, marks, source, space hint, max images, and active status.

### 13.3 Edit Question
Existing questions can be modified through the same form interface pre-populated with current values.

---

## 14. Admin — Exam Management

### 14.1 Exam List
Tabular view of all exams sorted by creation date.
Displays title, publish status (Draft/Published badge), duration, date range, and action buttons.

### 14.2 Create Exam
Exam builder interface for setting title, description, time limit, start/end dates, and selecting/ordering questions from the question bank.

### 14.3 Edit Exam
The restored edit page pre-populates the same exam builder. `update_exam_definition` changes the exam and ordered questions atomically, but rejects question/order/mark edits after the first official attempt starts.

### 14.4 Extend Timer
A controlled database function extends the exam deadline and clamps each active official attempt to the new global deadline without changing its original start.

### 14.5 Finalize Expired Attempts
The accurately named action queries authoritative due attempts and invokes the same idempotent finalizer used by clients and workers. It does not pretend to grade answers.

### 14.6 Submissions View
Per-exam view of finalized official submissions with grade completeness, student identity, and links to detailed review. It also provides Publish Results and Recalculate & Republish actions.

---

## 15. Admin — Grading Queue

### 15.1 Official Submission Review
Admins may manually grade any answer, AI-grade one answer, AI-grade a selection, or enqueue all missing grades. Translation is manual-only. AI successes are marked `ai`; manual saves and overrides are marked `admin`, but the source is never returned to students.

### 15.2 Manual Override
Manual grades are validated against the exam-question marks and written atomically. Bulk grading protects an admin grade by default; regrading requires explicit selection and confirmation. Queue status exposes progress, retries, failures, cancel, and resume controls.

---

## 16. Admin — User Management

### 16.1 User List
Displays all registered students with profile information, subscription status, and test quotas.

### 16.2 Activate Subscription
Admins can manually activate any plan for a user, setting a 30-day expiry.
Existing extra test purchases are carried over to the new subscription.
Previous active subscriptions are deactivated before creating the new one.

### 16.3 Deactivate Subscription
Admins can force-deactivate a user's current subscription.

### 16.4 Add Test Slots
Two modes: add free tests (increments `profiles.free_tests_remaining`) or add extra slots (increments `subscriptions.extra_tests_purchased` on the active subscription).

---

## 17. Admin — Tips Management

### 17.1 Add Tips
A simple form to create new tips that appear on student dashboards.
Tips are immediately active upon creation.

### 17.2 Delete Tips
Each tip has a delete button (visible on hover) that permanently removes it from the database.

---

## 18. Payment Integration (bKash)

### 18.1 bKash PRA Integration
Payment processing via bKash Personal Retail Account (PRA) — suited for small businesses without a trade license.
The integration uses the Tokenized Checkout REST API flow.

### 18.2 Payment Creation
`/api/bkash/create` initializes a payment session with the purchase type (plan subscription or extra test slots), amount, and redirect URLs.
Returns a bKash checkout URL that the client redirects to.

### 18.3 Payment Callback
`/api/bkash/callback` handles the return from bKash after the user completes (or cancels) payment.
On success: activates the subscription or adds extra test slots, records the transaction.
On failure: redirects to the subscription page with an error message.

### 18.4 Transaction Tracking
All bKash transactions are stored in a `bkash_transactions` table with amount, status, and payment metadata.
Used for revenue reporting on the admin dashboard.

---

## 19. Caching Strategy (Upstash Redis)

### 19.1 Centralized Cache Keys
All cache keys are defined in `CacheKeys` to prevent fragmentation. There are no wildcard scans in an exam request path.

### 19.2 Cache Purposes
- **Attempt drafts**: one atomic Redis hash per active attempt (48h TTL)
- **Leaderboard**: sanitized pages keyed by exam, publication version, and page (1h TTL)

Attempt timing, quotas, grading jobs, grades, and results are durable PostgreSQL state rather than cache state.

### 19.3 In-Memory Fallback
When `UPSTASH_REDIS_REST_URL` is not configured, a Map-based mock provides identical API surface.
The fallback supports the strings and hashes used by the application, including `get`, `set`, `hgetall`, `hset`, `del`, `exists`, `expire`, and `ttl`.
This ensures the app runs without Redis in local development.

---

## 20. Technology Stack & Infrastructure

### 20.1 Frontend
Next.js with App Router, React Server Components for data fetching, client components for interactivity.
Server aggregates and same-origin APIs keep browser data traffic bounded; unsafe exam/test links disable automatic prefetch.
Recharts for data visualization (area charts, sparklines).
Lucide React for icons throughout the interface.

### 20.2 Backend
Supabase for authentication, PostgreSQL database, and Row Level Security.
Upstash Redis for ephemeral attempt drafts and versioned leaderboard pages.
Z.ai GLM-OCR for handwriting extraction, and OpenAI GPT-5.6-Luna for grading through the Responses API with Structured Outputs and hosted rubric file search.
Firebase Cloud Messaging for push notifications.

### 20.3 Deployment
Railway hosts two services from the same repository, each selecting its own checked-in config path:

- **Web** — `/railway.web.json`, `npm run build`, then `npm run start`; `/api/health` is the health check.
- **Grading worker** — `/railway.worker.json`, `npm run worker:grading`; its signed `/wake` endpoint drains bounded grading batches and `/health` reports liveness.

Supabase remains the durable database/auth provider and Upstash remains Redis. Shared sealed/reference variables supply Supabase, Upstash, OpenAI, and `GRADING_WORKER_SECRET`; the web service points `GRADING_WORKER_URL` at the worker. Schema migrations run before application rollout, and the staging environment uses separate Supabase/Upstash resources and seeded accounts.

### 20.4 Request Budget
Persistent authenticated navigation and every exam/test start link disable automatic prefetch. The shell obtains profile, subscription, and notification state once from the authenticated layout. Notifications refresh on focus/navigation and at most every five minutes while visible; `last_active_at` is throttled to 15 minutes. Dashboard and question-bank views use aggregate RPCs. The production acceptance budget is at most 20 application/data requests per page load, excluding chunks, fonts, and images.

---

## 21. App Shell & Navigation

### 21.1 Bottom Tab Bar (Mobile)
Four primary tabs: Home, Practice, Exams, Progress.
Active tab is highlighted with brand color and uses `startsWith` path matching.

### 21.2 Desktop Sidebar
Full navigation with all sections: Dashboard, Question Bank, Weekly Exams, Progress, History, Subscription, Tips, and Settings.
The sidebar slides open as an overlay on mobile (triggered by hamburger menu) with backdrop click to close.

### 21.3 Header Bar
Displays the app logo/name, notification bell with unread badge, and a user avatar/logout area.
On desktop, the header is part of the sidebar; on mobile, it's a sticky top bar.

### 21.4 Active Test/Exam Links
The desktop and mobile sidenav show every in-progress test and exam detected via localStorage.
Each session has its own direct link, and the active-session count remains visible above the list.

### 21.5 Activity Tracking
The `last_active_at` timestamp on the profile is updated on every app load.
Used by the admin for inactivity monitoring and potential automated inactivity reminder notifications.

### 21.6 Time-of-Day Greeting
The dashboard greeting adapts to the time of day: "Good morning" (before noon), "Good afternoon" (noon–5pm), "Good evening" (after 5pm).

---

## 22. Data Types & Domain Model

### 22.1 Centralized Type System
All TypeScript interfaces and type unions are defined in `lib/types/index.ts`.
This includes: Profile, Subscription, Payment, Question, Submission, Exam, ExamQuestion, ExamSubmission, ExamResult, Tip, Notification, and all grading-related types.

### 22.2 Grading Result Structure
The `GradingResultJSON` type mirrors the OpenAI Structured Output schema with `internal` (criteria breakdown) and `studentFeedback` (score, summary, highlights).
The `Highlight` type enforces `quote`, `comment`, and `type` ("strength" | "improvement") fields.

### 22.3 Display Constants
`CATEGORY_LABELS` and `DIFFICULTY_LABELS` provide human-readable names for all enum values.
Used consistently across both student and admin interfaces.

---

## 23. Testing

### 23.1 Unit Tests
Jest runs in the Node environment used by Next.js routes and Railway workers, with Next's web primitives installed for `Request`/`Response`. The suite covers plan configuration, contracts, Redis fallback behavior, bKash, security properties, and the grading engine.

### 23.2 Grading Tests
A dedicated `grade.test.ts` validates the grading engine's tool-calling loop, structured output parsing, and highlight validation logic.

### 23.3 Integration Tests
`flow.test.ts` verifies that retired per-question mutations cannot start or alter an exam and that acknowledged drafts use one attempt document. `supabase/tests/exam_reliability.sql` is an executable, rollback-only database contract test for attempt start/finalize, blank zeros, early/incomplete publication rejection, rank ties, republish versioning, practice refunds/retry, repeated practice, and standalone idempotency.

### 23.4 Redis Tests
`redis.test.ts` validates the in-memory fallback's correctness against the expected Redis API surface.

### 23.5 Release Gates
`npm run check` runs TypeScript, ESLint, Jest, and the production Next build. Before release, the SQL contract test runs against dedicated staging Supabase, followed by seeded Playwright exam/practice/admin flows with mocked OpenAI. A smaller production smoke test verifies health, login, exam metadata, and request count without starting a real attempt.

---

## 24. Security Measures

### 24.1 Admin Verification
The admin layout and every mutation perform their own authoritative user lookup and `is_admin` check. Service-role database functions are revoked from `anon` and `authenticated` roles.

### 24.2 Row Level Security
Supabase RLS policies restrict data access at the database level.
The service role key is used only in server-side contexts (webhooks, admin actions) and never exposed to the client.
Attempt, grading-job, usage-ledger, and leaderboard policies expose only the authenticated user's permitted rows; the public leaderboard contract is a sanitized signed-in RPC.

### 24.3 Anti-Cheat: Server-Enforced Exam Timing
The exam timer is anchored to PostgreSQL `started_at`/`expires_at`, making client-clock manipulation ineffective. Questions are unavailable on GET and appear only after the explicit transactional start. The three-minute grace permits network completion but never unlocks editing.

### 24.4 Anti-Cheat: Practice Mode Lockout
Practice mode on past exams is only available after `results_published = true`.
This prevents students from using AI-graded practice runs to preview questions or deduce rubrics before the official grading is complete.

### 24.5 Writer and Recovery Security
Only the SHA-256 writer-token hash is durable. Takeover rotates it, and stale writers receive `WRITER_REVOKED`. Local recovery contains only unacknowledged changes, encrypted with AES-GCM; the key remains in tab-scoped session storage and recovery is cleared after acknowledgement or completion.

### 24.6 Anti-Cheat: Grading Prompt Injection
The per-request UUID nonce in submission tags prevents pre-crafted injection payloads.
The system prompt explicitly tells the model to note manipulation attempts rather than comply with them.

### 24.7 File Upload Validation
OCR endpoint validates file type (JPEG or PNG only) and size (max 10MB).
Rejects unsupported types with specific error messages.

### 24.8 Credential Handling
The Firebase Admin JSON filename is ignored, absent from reachable Git history, and still available at the required physical local path. Production uses Railway sealed environment values. Replacing the Firebase key, deploying the replacement to Railway, and revoking the exposed key is a mandatory operator release gate whenever authenticated Firebase/Railway console access is unavailable to the implementation environment.

### 24.9 Webhook Signature Verification
The push notification webhook endpoint supports `x-supabase-signature` header checking.
A `SUPABASE_WEBHOOK_SECRET` environment variable secures server-to-server communication.
