-- Every writing question has the same hard upload allowance. Keep the legacy
-- column aligned for existing queries while the application policy remains a
-- server-side constant, independent of marks or category.

UPDATE public.questions
SET max_images = 2
WHERE max_images IS DISTINCT FROM 2;

ALTER TABLE public.questions
  ALTER COLUMN max_images SET DEFAULT 2;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_max_images_fixed;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_max_images_fixed CHECK (max_images = 2);
