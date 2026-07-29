-- ═══════════════════════════════════════════════════════════════════════════
-- 007: RLS Security Hardening (fixes 006_exam_results_rls.sql mistakes)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: 006_exam_results_rls.sql added a dangerous INSERT policy on
-- exam_results that lets students forge their own scores. Additionally,
-- several INSERT/UPDATE policies from 001_schema.sql let students write
-- security-critical tables (exam_results, exam_submissions, submissions,
-- subscriptions). A malicious user with the Supabase anon key could:
--   • INSERT fake exam_results with a perfect score
--   • INSERT fake submissions with fabricated grading_result JSON
--   • UPDATE their profile to set free_tests_remaining = 999999
--   • UPDATE their profile to set is_admin = true
--
-- FIX: Remove all dangerous write policies from student-facing tables.
-- Server-side API routes now use createAdminClient() (service role) for
-- all writes to these tables, which bypasses RLS entirely.
-- Students keep SELECT-only access to their own data.
--
-- ─── 1. exam_results: Remove INSERT ability, add own-row SELECT ─────────

-- DROP the dangerous INSERT policy created by 006_exam_results_rls.sql.
-- Students should NEVER insert their own scores.
-- The server inserts via service role after grading.
DROP POLICY IF EXISTS "Users can insert own exam results" ON exam_results;

-- Students should be able to see their own results even before admin
-- publishes the full leaderboard (so the duplicate-entry check and the
-- "you already submitted" redirect works).
-- 006 also created this — DROP it first so we can recreate cleanly.
DROP POLICY IF EXISTS "Users can view own exam results" ON exam_results;

CREATE POLICY "Users can view own exam results"
  ON exam_results FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 2. exam_submissions: Remove student INSERT/UPDATE ──────────────────

-- These contain grading_result JSONB. Letting students INSERT means they
-- could fabricate graded answers. Server inserts via service role.
DROP POLICY IF EXISTS "Users can insert own exam submissions" ON exam_submissions;
DROP POLICY IF EXISTS "Users can update own exam submissions" ON exam_submissions;

-- ─── 3. submissions (QB single tests): Remove student INSERT ────────────

-- Same issue — grading_result is in this table. A student could POST
-- directly to Supabase and insert a perfect-score submission.
DROP POLICY IF EXISTS "Users can insert own submissions" ON submissions;

-- ─── 4. profiles: Replace broad UPDATE with restricted UPDATE ───────────

-- The old policy lets a student UPDATE *any* column on their own row,
-- including free_tests_remaining and is_admin. We replace it with one
-- that only allows safe, student-editable fields.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own safe fields"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- Only allow changes if the sensitive columns stay unchanged.
    -- This works because WITH CHECK runs against the *new* row values,
    -- and USING runs against the *old* row values. By checking the new
    -- values match a subquery of the old values, we block mutations.
    free_tests_remaining = (SELECT p.free_tests_remaining FROM profiles p WHERE p.id = auth.uid())
    AND is_admin = (SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid())
  );
