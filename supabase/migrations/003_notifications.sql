-- Trigger to create notifications for all eligible users when an exam is published
CREATE OR REPLACE FUNCTION notify_exam_published()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false) THEN
    INSERT INTO notifications (user_id, type, title, message)
    SELECT 
      user_id, 
      'exam_available', 
      'New Weekly Exam!', 
      'A new exam "' || NEW.title || '" is now available. You have ' || NEW.time_limit_minutes || ' minutes to complete it.'
    FROM subscriptions
    WHERE is_active = true AND plan_type IN ('plan_2', 'plan_3');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_exam_published
  AFTER INSERT OR UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION notify_exam_published();

-- Trigger for Results Published
CREATE OR REPLACE FUNCTION notify_results_published()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.results_published = true AND (OLD IS NULL OR OLD.results_published = false) THEN
    INSERT INTO notifications (user_id, type, title, message)
    SELECT 
      user_id, 
      'results_published', 
      'Exam Results Published', 
      'The results for "' || NEW.title || '" are now available. Check the leaderboard!'
    FROM exam_results
    WHERE exam_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_results_published
  AFTER UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION notify_results_published();
