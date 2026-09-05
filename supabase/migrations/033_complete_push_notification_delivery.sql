-- Make account and Magnus approvals first-class in-app/push notifications and
-- remember successful push work separately from email delivery retries.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'account_approved';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'magnus_approved';

ALTER TABLE public.retention_notification_jobs
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;
