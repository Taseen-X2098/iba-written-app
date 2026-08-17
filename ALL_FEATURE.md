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

### 1.8 Session Middleware
Runs on every request to refresh the Supabase auth cookie and enforce route protection.
Unauthenticated users accessing protected routes are redirected to `/login`.
Authenticated users accessing auth routes (login, signup, forgot-password) are redirected to `/`, except for `/reset-password` which is exempt because Supabase establishes a recovery session before the user arrives.
API routes are skipped entirely — they handle their own auth.

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
These are tracked on the `profiles.free_tests_remaining` column and consumed before any paid quota.

### 2.3 Extra Test Slots
Users on Plan 1 or Plan 2 can purchase additional test slots at ৳5 each (`EXTRA_TEST_PRICE = 5`).
Extra slots are tracked separately (`subscriptions.extra_tests_purchased`) and consumed before the base plan allowance to preserve the more valuable monthly quota.

### 2.4 Usage Calculation
A universal `getUsageInfo()` utility computes remaining tests, percentage, and a color-coded status bar.
The color thresholds are: green (>60%), yellow (>40%), orange (>20%), red (≤20%).
An upgrade prompt appears when usage drops below 40% for paid plans or below 1 test for free users.

### 2.5 Test Slot Consumption
Slot deduction is protected by a Redis-based distributed lock (`lock:consumeTestSlot:{userId}`) to prevent race conditions from concurrent submissions.
The consumption order is: extra purchased slots → plan slots → free slots.
If the lock is already held, the request fails immediately with a descriptive error rather than waiting, preventing abuse from rapid-fire submissions.

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

### 3.4 Question Bank Browsing
Server-side prefetching via TanStack Query's `prefetchInfiniteQuery` for instant initial load.
Client-side infinite scrolling loads 10 questions per page with automatic "Load More" triggers.
Five filter dimensions are synced to URL search parameters for deep-linkable filtered views:
- Text search (matches prompt text)
- Category (all / specific category)
- Difficulty (all / specific level)
- Sort order (newest / oldest)
- Completion status (not done / done / all) — cross-referenced against the user's submission history

### 3.5 Translation Question Exclusion
Translation questions are filtered out of both the student question bank (`excludeTranslation: true`) and admin question list (`neq("category", "translation")`).
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
The current test state is saved to `localStorage` under `in_progress_test` on every state change.
This includes the question ID, prompt, category, marks, elapsed seconds, timer state, and a `lastUpdatedAt` timestamp.
If the student navigates away and returns within 1 hour, the session is restored automatically.
After 1 hour of inactivity, the stored session is treated as expired and cleared.

### 4.4 Active Test Reminder
The main shell detects in-progress tests and exams via localStorage on mount.
If an active session is found and the user is not already on the test page, a popup reminder appears offering to navigate back.
A persistent green banner at the bottom of the app shows the active test/exam title with a "Continue" button.
Cross-tab synchronization via `StorageEvent` and custom events ensures the banner updates when a test starts or ends in another tab.

### 4.5 Image Upload
Students upload photos of their handwritten answers via file picker (JPEG, PNG, WebP, GIF; max 10MB).
Multiple image formats are accepted to accommodate different phone cameras and scanning apps.

### 4.6 Webcam Capture
An alternative to file upload — students can take a photo directly from the browser.
The webcam component supports front/rear camera toggle (critical for mobile phones photographing paper on a desk).
The captured image is converted to a JPEG File object and fed into the same upload pipeline.
Camera permissions are requested on demand with a descriptive error if denied.

### 4.7 OCR (Optical Character Recognition)
Uploaded images are sent to `/api/ocr` which uses OpenAI Vision (GPT-5.6-Luna) to extract handwritten text.
The prompt instructs the model to return only raw text with preserved paragraph breaks — no commentary, labels, or formatting.
A mock mode (`Z_AI_MOCK=true`) returns realistic dummy text with a 2-second simulated delay for development.
Extracted text is presented in an editable textarea so students can correct any OCR errors before grading.

### 4.8 Text Editing
After OCR, students review and edit the extracted text in a textarea.
This step is essential because OCR is imperfect — students correct misread characters, missing words, or merged paragraphs.
Both the original OCR text and the edited text are stored in the submission, creating an audit trail.

### 4.9 Test Quota Enforcement (Client & Server)
Before a test begins, a client-side check verifies the student has available tests (subscription slots, extra slots, or free tests). If no tests are available, the "Start" button redirects to the subscription page.
Critically, this quota is strictly enforced on the server. The `/api/grade` endpoint performs a secure server-side check before invoking the AI, and atomically consumes the slot via a distributed Redis lock (`consumeTestSlot()`) only after grading succeeds. This completely prevents bypass attacks where a user might try to hit the API directly.

### 4.10 Session Cancellation
A "Cancel Session" button is available during the running/paused states.
Cancellation clears localStorage, resets the timer, and returns to the idle state.
A confirmation dialog prevents accidental clicks.

---

## 5. AI Grading Engine

### 5.1 Model & Architecture
Grading uses OpenAI's GPT-5.6-Luna via the Responses API with Structured Outputs.
The model is forced to call a `get_rubric` tool before scoring — it cannot grade from memory or improvise criteria.
If the model makes tool calls, the results are fed back in a second API call for the final graded output.

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

---

## 6. Weekly Exams

### 6.1 Access Control
Only students on Plan 2 (Complete) or Plan 3 (Exam Only) can participate.
Students without access see a prominent "Exams Locked" banner with an upgrade CTA linking to the subscription page.

### 6.2 Exam Data Model
Each exam has: title, optional description, time limit (minutes), start/end datetime window, publish status, results-published flag, and the creating admin's ID.
Questions are linked via `exam_questions` which adds per-question marks and ordering.

### 6.3 Exam States
An exam progresses through: Draft → Published → Live (between start and end times) → Ended → Results Published.
Students see upcoming/live exams in one section and past exams in another, sorted by start date.

### 6.4 Server-Enforced Timer
The exam start time is recorded in Redis on first visit (`exam:start:{examId}:{userId}`).
All subsequent visits compute remaining time from this server-stored start, making client-side timer manipulation impossible.
The Redis key has a 48-hour TTL so admins can find and force-grade abandoned sessions.
A 3-minute grace period is added to the time limit to account for network latency during the final submission.
When the timer expires, `AutoFinalizer` fires, collecting all saved drafts from Redis and submitting them.

### 6.5 Multi-Question Interface
Each exam question is displayed in a tabbed or scrollable interface with its own upload area and text editor.
Students can upload images (including via webcam), edit OCR text, and manually save drafts for each question independently.

### 6.6 Draft Persistence (Redis)
Every answer is saved to Redis as a draft (`exam:{examId}:submission:{userId}:{questionId}`).
Drafts auto-save immediately after OCR completes and can be manually triggered with a "Save Draft" button per question.
A "Save All" button flushes all dirty (unsaved) answers in parallel.
On re-entry (e.g., browser crash), all drafts are hydrated from Redis into the answer state.

### 6.7 Exam Submission
On manual submit or timer expiry, all unsaved drafts are flushed to Redis first, then the full payload is sent to `/api/exam/submit`.
Duplicate submission clicks are handled gracefully — the server returns a specific "Exam already submitted" error that the client catches and redirects to results.
After submission, the `in_progress_exam` localStorage entry is cleared and the exam banner disappears.

### 6.8 Auto-Finalization
When a student revisits an exam page after their timer has expired (including the 3-minute grace), the `AutoFinalizer` component automatically calls `/api/exam/finalize` to submit whatever drafts exist in Redis.
This ensures no answers are lost even if the student's browser crashed during the exam.

### 6.9 Results Embargo
While the global exam window is still open, students who finished early see a "Session Concluded" page explaining their results will appear after the exam officially ends.
After the exam ends but before results are published, a "Results Pending" page appears.
This prevents early finishers from leaking questions or scores to students still taking the exam.

### 6.10 Leaderboard
After results are published, a ranked leaderboard displays all participating students with their scores, names, and institutes. The list is paginated (100 students per page) if the participant count is large.
The current user's row is highlighted with "(You)" appended and a distinct background color.
Gold/silver/bronze medal icons mark the top three positions.
The leaderboard is cached in Redis for 1 hour (`CacheTTL.LEADERBOARD = 3600`) to avoid repeated heavy queries.

### 6.11 Practice Mode
After results are officially published, exams become available in practice mode (`?practice=true`).
Practice mode uses separate Redis keys (`practice:exam:...`) so it doesn't interfere with real submissions.
Practice submissions are graded in real-time by the AI and results are shown inline without saving to the leaderboard.
Practice mode is explicitly blocked before results are published to prevent students from using AI grading to preview official rubrics.

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
The exam builder pre-populates with the existing exam's configuration for modification.

### 14.4 Extend Timer
A per-exam button that prompts the admin for extra minutes and extends both the exam's `time_limit_minutes` and `ends_at` deadline.
All active students' Redis-stored start times are implicitly accommodated because the remaining-time calculation uses the updated time limit.

### 14.5 Force Grade Expired
Scans Redis for all active sessions on a specific exam, identifies expired ones, and force-submits their drafts via `/api/exam/finalize`.
Useful when students abandon sessions without submitting, preventing their drafts from languishing in Redis forever.

### 14.6 Submissions View
Per-exam view of all student submissions with links to individual grading review.

---

## 15. Admin — Grading Queue

### 15.1 Submission Review Table
Lists all practice test submissions with student name/institute, question prompt, submission date, and AI-assigned score.
"Review" link navigates to a detailed view of the submission.

### 15.2 Manual Override
Admins can review AI grading results and adjust scores or feedback.
Both AI-graded (`graded_by: "ai"`) and admin-graded (`graded_by: "admin"`) submissions are tracked.

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
All cache keys are defined in `CacheKeys` to prevent key fragmentation across the codebase.
Pattern keys (with `*` wildcards) are available for scanning related entries.

### 19.2 Cache Purposes
- **Exam start times**: server-enforced timer anchors (48h TTL)
- **Exam drafts**: in-progress answers (separate keys for real and practice mode)
- **Leaderboard**: cached query results (1h TTL)
- **Distributed locks**: test slot consumption race prevention (10s TTL)

### 19.3 In-Memory Fallback
When `UPSTASH_REDIS_REST_URL` is not configured, a Map-based mock provides identical API surface.
The fallback supports `get`, `set` (with `nx` and `ex` options), `del`, `exists`, `expire`, `ttl`, and `keys` (with glob patterns).
This ensures the app runs without Redis in local development.

---

## 20. Technology Stack & Infrastructure

### 20.1 Frontend
Next.js with App Router, React Server Components for data fetching, client components for interactivity.
TanStack Query for client-side data management with server-side prefetching + hydration.
Recharts for data visualization (area charts, sparklines).
Lucide React for icons throughout the interface.

### 20.2 Backend
Supabase for authentication, PostgreSQL database, and Row Level Security.
Upstash Redis for caching, distributed locks, and ephemeral state (exam drafts).
OpenAI GPT-5.2 for both OCR (Vision API) and AI grading (Responses API with Structured Outputs).
Firebase Cloud Messaging for push notifications.

### 20.3 Deployment
Hosted on Netlify with serverless functions.
Environment variables managed via `.env.local` for development and Netlify dashboard for production.

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

### 21.4 Active Test/Exam Banner
A persistent bottom banner appears when a test or exam is in progress (detected via localStorage).
Shows the test/exam title and a "Continue" CTA that links directly to the active session.
The banner uses a pulsing green dot animation to draw attention.

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
Jest-based test suite covering plan configuration (prices, features, upgrade math), type shape validation (compile-time and runtime checks), and label completeness.
The `plans-and-types.test.ts` file verifies that all three plans have correct pricing, test quotas, and feature flags.

### 23.2 Grading Tests
A dedicated `grade.test.ts` validates the grading engine's tool-calling loop, structured output parsing, and highlight validation logic.

### 23.3 Integration Tests
`flow.test.ts` in the exam API directory tests the end-to-end exam submission flow.

### 23.4 Redis Tests
`redis.test.ts` validates the in-memory fallback's correctness against the expected Redis API surface.

---

## 24. Security Measures

### 24.1 Admin Verification
Every admin server action calls `verifyAdmin()` which checks the current user's `is_admin` flag.
The admin layout performs this check at the page level; individual mutations double-check to prevent CSRF or direct API abuse.

### 24.2 Row Level Security
Supabase RLS policies restrict data access at the database level.
The service role key is used only in server-side contexts (webhooks, admin actions) and never exposed to the client.

### 24.3 Anti-Cheat: Server-Enforced Exam Timing
The exam timer is anchored to a Redis-stored server timestamp, making client-side clock manipulation ineffective.
The 3-minute grace period accommodates legitimate network delays without opening a significant cheating window.

### 24.4 Anti-Cheat: Practice Mode Lockout
Practice mode on past exams is only available after `results_published = true`.
This prevents students from using AI-graded practice runs to preview questions or deduce rubrics before the official grading is complete.

### 24.5 Anti-Cheat: Grading Prompt Injection
The per-request UUID nonce in submission tags prevents pre-crafted injection payloads.
The system prompt explicitly tells the model to note manipulation attempts rather than comply with them.

### 24.6 File Upload Validation
OCR endpoint validates file type (JPEG, PNG, WebP, GIF only) and size (max 10MB).
Rejects unsupported types with specific error messages.

### 24.7 Webhook Signature Verification
The push notification webhook endpoint supports `x-supabase-signature` header checking.
A `SUPABASE_WEBHOOK_SECRET` environment variable secures server-to-server communication.
