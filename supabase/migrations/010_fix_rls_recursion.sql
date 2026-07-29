-- ═══════════════════════════════════════════════════════════════════════════
-- 010: Fix RLS Infinite Recursion
-- ═══════════════════════════════════════════════════════════════════════════
-- The previous policies on the `profiles` table caused infinite recursion 
-- because they queried the `profiles` table to check if a user is an admin.
-- We fix this by introducing a SECURITY DEFINER function that bypasses RLS.

-- 1. Create SECURITY DEFINER function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;

-- 2. Drop recursive profile policies
DROP POLICY IF EXISTS "Admins can do all on profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own safe fields" ON profiles;

-- 3. Recreate safe profile policies using the helper function
CREATE POLICY "Admins can do all on profiles" ON profiles
  FOR ALL USING ( public.is_admin() );

CREATE POLICY "Users can update own safe fields" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    free_tests_remaining = (SELECT p.free_tests_remaining FROM profiles p WHERE p.id = auth.uid())
    AND is_admin = (SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid())
  );
  
-- Note: The WITH CHECK above still queries profiles, but since the SELECT policy
-- no longer has a recursive ALL policy, the SELECT should succeed without recursion.

-- Let's also update the other admin policies to use the faster helper function
DROP POLICY IF EXISTS "Admins can do all on exams" ON exams;
CREATE POLICY "Admins can do all on exams" ON exams
  FOR ALL USING ( public.is_admin() );

DROP POLICY IF EXISTS "Admins can do all on exam_questions" ON exam_questions;
CREATE POLICY "Admins can do all on exam_questions" ON exam_questions
  FOR ALL USING ( public.is_admin() );
  
DROP POLICY IF EXISTS "Admins can do all on submissions" ON submissions;
CREATE POLICY "Admins can do all on submissions" ON submissions
  FOR ALL USING ( public.is_admin() );
  
DROP POLICY IF EXISTS "Admins can do all on exam_submissions" ON exam_submissions;
CREATE POLICY "Admins can do all on exam_submissions" ON exam_submissions
  FOR ALL USING ( public.is_admin() );
  
DROP POLICY IF EXISTS "Admins can do all on exam_results" ON exam_results;
CREATE POLICY "Admins can do all on exam_results" ON exam_results
  FOR ALL USING ( public.is_admin() );
