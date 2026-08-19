-- The application and grading rubrics have always exposed five AI-gradable
-- writing categories, but the original PostgreSQL enum omitted the dedicated
-- argumentative-essay value. Keep this enum change in its own migration: a
-- newly added PostgreSQL enum value must be committed before later migrations
-- can safely use it in UPDATE or INSERT statements.

ALTER TYPE public.question_category
  ADD VALUE IF NOT EXISTS 'argumentative_essay';
