-- ═══════════════════════════════════════════════════════════════════════════
-- 011: Fix Pre-Exam Leakage via RLS (exam_questions only)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: The previous policy for `exam_questions` allowed students to view 
-- which questions are in an exam as soon as it was published (is_published = true).
-- It did NOT check if the exam had actually started (starts_at <= now()).
-- This allowed students to use the Supabase REST API to see exactly which 
-- questions from the Question Bank were going to appear on their upcoming exam.
--
-- FIX: Update the RLS policy to enforce both is_published = true AND starts_at <= now().
-- We DO NOT touch the `questions` table policy because students need full access
-- to `is_active = true` questions for the standalone Practice Question Bank feature.

DROP POLICY IF EXISTS "Users can view exam questions for published exams" ON exam_questions;

CREATE POLICY "Users can view exam questions for published exams"
  ON exam_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM exams 
      WHERE exams.id = exam_id 
        AND exams.is_published = true 
        AND exams.starts_at <= now()
    )
    OR public.is_admin()
  );
