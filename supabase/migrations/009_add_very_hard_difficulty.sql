-- Add 'very_hard' to the difficulty_level enum
-- This must run BEFORE 008_iba_written_questions_full.sql which uses 'very_hard' values

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'very_hard'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'difficulty_level')
  ) THEN
    ALTER TYPE difficulty_level ADD VALUE 'very_hard';
  END IF;
END
$$;
