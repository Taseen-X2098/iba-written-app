-- Database-level limits for values that can enter through Supabase Auth or the
-- browser client. NOT VALID preserves historical rows while enforcing every
-- new insert and update.

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_name_input_length
    CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT profiles_institute_input_length
    CHECK (char_length(institute) <= 300) NOT VALID,
  ADD CONSTRAINT profiles_phone_input_length
    CHECK (phone IS NULL OR char_length(phone) <= 50) NOT VALID;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_prompt_input_length
    CHECK (char_length(prompt) <= 20000) NOT VALID,
  ADD CONSTRAINT questions_source_input_length
    CHECK (source IS NULL OR char_length(source) <= 500) NOT VALID,
  ADD CONSTRAINT questions_space_hint_input_length
    CHECK (space_hint IS NULL OR char_length(space_hint) <= 500) NOT VALID,
  ADD CONSTRAINT questions_marks_input_range
    CHECK (marks BETWEEN 1 AND 100) NOT VALID;

ALTER TABLE public.tips
  ADD CONSTRAINT tips_content_input_length
    CHECK (char_length(content) <= 1000) NOT VALID;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_title_input_length
    CHECK (char_length(title) <= 200) NOT VALID,
  ADD CONSTRAINT notifications_message_input_length
    CHECK (char_length(message) <= 4000) NOT VALID;
