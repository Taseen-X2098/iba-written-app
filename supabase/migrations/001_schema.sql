-- IBA Written — Full Database Schema
-- Run this in Supabase SQL Editor or as a migration

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── Custom Types ────────────────────────────────────────────────────────────

create type plan_type as enum ('plan_1', 'plan_2', 'plan_3');
create type payment_status as enum ('pending', 'completed', 'failed', 'refunded');
create type payment_type as enum ('subscription', 'upgrade', 'extra_tests');
create type question_category as enum (
  'essay', 'quote_analysis', 'creative_writing', 'personal_reflection',
  'translation', 'basic_paragraph', 'comprehension', 'precis', 'grammar'
);
create type difficulty_level as enum ('easy', 'medium', 'hard');
create type graded_by_type as enum ('ai', 'admin');
create type notification_type as enum (
  'exam_available', 'results_published', 'subscription_expiring', 'inactivity_reminder'
);

-- ─── Profiles ────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  institute text not null,
  phone text,
  free_tests_remaining int not null default 3,
  tips_enabled boolean not null default true,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile when a user signs up via a trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, institute, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'institute', ''),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Subscriptions ──────────────────────────────────────────────────────────

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_type plan_type not null,
  tests_remaining int not null default 0,
  extra_tests_purchased int not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_subscriptions_user_active on subscriptions(user_id, is_active);

-- ─── Payments ───────────────────────────────────────────────────────────────

create table payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount decimal(10, 2) not null,
  payment_type payment_type not null,
  plan_type plan_type,
  bkash_trx_id text,
  bkash_payment_id text,
  status payment_status not null default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_payments_user on payments(user_id);
create index idx_payments_bkash on payments(bkash_payment_id);

-- ─── Questions ──────────────────────────────────────────────────────────────

create table questions (
  id uuid primary key default uuid_generate_v4(),
  category question_category not null,
  marks int not null,
  difficulty difficulty_level not null default 'medium',
  source text,  -- only shown if non-empty
  prompt text not null,
  space_hint text,  -- e.g. "In real IBA exam, you would get approximately 20 lines"
  max_images int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index idx_questions_category on questions(category);
create index idx_questions_active on questions(is_active);

-- ─── Submissions (Single AI-Graded Tests) ───────────────────────────────────

create table submissions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references questions(id),
  ocr_text text not null,
  edited_text text not null,
  time_taken_seconds int not null default 0,
  grading_result jsonb not null,
  graded_by graded_by_type not null default 'ai',
  is_exam_submission boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_submissions_user on submissions(user_id);
create index idx_submissions_user_date on submissions(user_id, created_at desc);

-- ─── Exams ──────────────────────────────────────────────────────────────────

create table exams (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  time_limit_minutes int not null default 30,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default false,
  results_published boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_exams_published on exams(is_published, starts_at);

-- ─── Exam Questions ─────────────────────────────────────────────────────────

create table exam_questions (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid not null references exams(id) on delete cascade,
  question_id uuid not null references questions(id),
  order_index int not null default 0,
  marks int not null
);

create index idx_exam_questions_exam on exam_questions(exam_id);

-- ─── Exam Submissions ───────────────────────────────────────────────────────

create table exam_submissions (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid not null references exams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references exam_questions(id),
  ocr_text text,
  edited_text text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  grading_result jsonb,
  graded_by graded_by_type,
  created_at timestamptz not null default now()
);

create index idx_exam_submissions_exam_user on exam_submissions(exam_id, user_id);
create unique index idx_exam_submissions_unique on exam_submissions(exam_id, user_id, question_id);

-- ─── Exam Results (Materialized per-user summary) ──────────────────────────

create table exam_results (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid not null references exams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  total_score decimal(6, 2) not null default 0,
  max_score int not null default 0,
  rank int,
  created_at timestamptz not null default now()
);

create unique index idx_exam_results_unique on exam_results(exam_id, user_id);
create index idx_exam_results_exam_rank on exam_results(exam_id, rank);

-- ─── Tips ───────────────────────────────────────────────────────────────────

create table tips (
  id uuid primary key default uuid_generate_v4(),
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Notifications ──────────────────────────────────────────────────────────

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on notifications(user_id, is_read, created_at desc);

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table questions enable row level security;
alter table submissions enable row level security;
alter table exams enable row level security;
alter table exam_questions enable row level security;
alter table exam_submissions enable row level security;
alter table exam_results enable row level security;
alter table tips enable row level security;
alter table notifications enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Subscriptions: users can view their own
create policy "Users can view own subscriptions"
  on subscriptions for select using (auth.uid() = user_id);

-- Payments: users can view their own
create policy "Users can view own payments"
  on payments for select using (auth.uid() = user_id);

-- Questions: all authenticated users can read active questions
create policy "Authenticated users can read active questions"
  on questions for select using (is_active = true);

-- Submissions: users can view and insert their own
create policy "Users can view own submissions"
  on submissions for select using (auth.uid() = user_id);
create policy "Users can insert own submissions"
  on submissions for insert with check (auth.uid() = user_id);

-- Exams: all authenticated users can view published exams
create policy "Users can view published exams"
  on exams for select using (is_published = true);

-- Exam questions: viewable for published exams
create policy "Users can view exam questions for published exams"
  on exam_questions for select using (
    exists (select 1 from exams where exams.id = exam_id and exams.is_published = true)
  );

-- Exam submissions: users can view/insert their own
create policy "Users can view own exam submissions"
  on exam_submissions for select using (auth.uid() = user_id);
create policy "Users can insert own exam submissions"
  on exam_submissions for insert with check (auth.uid() = user_id);
create policy "Users can update own exam submissions"
  on exam_submissions for update using (auth.uid() = user_id);

-- Exam results: viewable when results are published
create policy "Users can view exam results when published"
  on exam_results for select using (
    exists (select 1 from exams where exams.id = exam_id and exams.results_published = true)
  );

-- Tips: all authenticated users can read active tips
create policy "Authenticated users can read active tips"
  on tips for select using (is_active = true);

-- Notifications: users can view/update their own
create policy "Users can view own notifications"
  on notifications for select using (auth.uid() = user_id);
create policy "Users can update own notifications"
  on notifications for update using (auth.uid() = user_id);

-- ─── Helper Functions ──────────────────────────────────────────────────────

-- Automatically update updated_at timestamp
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

create trigger exams_updated_at
  before update on exams
  for each row execute procedure update_updated_at();
