-- PostgreSQL enum values must be committed before a later migration can use
-- them in inserts. Keep the category change separate from the question seed.

ALTER TYPE public.question_category
  ADD VALUE IF NOT EXISTS 'story_completion';
