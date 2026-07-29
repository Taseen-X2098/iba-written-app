-- Give Admins full access to submissions and exam_submissions

-- Submissions (Question Bank)
CREATE POLICY "Admins can do all on submissions" ON submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Exam Submissions
CREATE POLICY "Admins can do all on exam_submissions" ON exam_submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Exam Results
CREATE POLICY "Admins can do all on exam_results" ON exam_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Profiles (so Admins can see all users on the users page)
CREATE POLICY "Admins can do all on profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles admin_prof WHERE admin_prof.id = auth.uid() AND admin_prof.is_admin = true)
  );
