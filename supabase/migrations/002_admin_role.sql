-- Add is_admin to profiles
ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Policy: Anyone can read published exams
CREATE POLICY "Anyone can read published exams" ON exams
  FOR SELECT USING (is_published = true);

-- Policy: Admins can do all on exams
CREATE POLICY "Admins can do all on exams" ON exams
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Policy: Anyone can read exam questions for published exams
CREATE POLICY "Anyone can read exam questions" ON exam_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.is_published = true)
  );

-- Policy: Admins can do all on exam questions
CREATE POLICY "Admins can do all on exam_questions" ON exam_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );
