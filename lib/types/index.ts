// ─── Enums ────────────────────────────────────────────────────────────────────

export type PlanType = "plan_1" | "plan_2" | "plan_3";

export type QuestionCategory =
  | "argumentative_essay"
  | "basic_paragraph"
  | "creative_writing"
  | "personal_reflection"
  | "quote_analysis"
  | "translation";

export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";
export type PaymentType = "subscription" | "upgrade" | "extra_tests";

export type GradedBy = "ai" | "admin";

export type NotificationType =
  | "exam_available"
  | "results_published"
  | "subscription_expiring"
  | "inactivity_reminder";

// ─── Database Row Types ───────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  institute: string;
  phone: string | null;
  free_tests_remaining: number;
  tips_enabled: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: PlanType;
  tests_remaining: number;
  extra_tests_purchased: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount: number;
  payment_type: PaymentType;
  plan_type: PlanType | null;
  bkash_trx_id: string | null;
  bkash_payment_id: string | null;
  status: PaymentStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Question {
  id: string;
  category: QuestionCategory;
  marks: number;
  difficulty: Difficulty;
  source: string | null;
  prompt: string;
  space_hint: string | null;
  max_images: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Submission {
  id: string;
  user_id: string;
  question_id: string;
  ocr_text: string;
  edited_text: string;
  time_taken_seconds: number;
  grading_result: GradingResultJSON;
  graded_by: GradedBy;
  is_exam_submission: boolean;
  created_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  time_limit_minutes: number;
  starts_at: string;
  ends_at: string;
  is_published: boolean;
  results_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  order_index: number;
  marks: number;
  /** Joined from questions table when needed */
  question?: Question;
}

export interface ExamSubmission {
  id: string;
  exam_id: string;
  user_id: string;
  question_id: string;
  ocr_text: string | null;
  edited_text: string | null;
  started_at: string;
  submitted_at: string | null;
  grading_result: GradingResultJSON | null;
  graded_by: GradedBy | null;
  created_at: string;
}

export interface ExamResult {
  id: string;
  exam_id: string;
  user_id: string;
  total_score: number;
  max_score: number;
  rank: number | null;
  created_at: string;
  /** Joined profile for leaderboard display */
  profile?: Pick<Profile, "name" | "institute">;
}

export interface Tip {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ─── Grading Types (mirrors lib/grading/grade.ts) ─────────────────────────────

export interface GradingCriterion {
  criterion: string;
  marksAwarded: number;
  marksPossible: number;
  reasoning: string;
}

export interface Highlight {
  quote: string;
  comment: string;
  type: "strength" | "improvement";
}

export interface GradingResultJSON {
  internal: {
    total: number;
    max: number;
    criteria: GradingCriterion[];
  };
  studentFeedback: {
    score: string;
    summary: string;
    highlights: Highlight[];
  };
}

// ─── Plan Constants ───────────────────────────────────────────────────────────

export const PLAN_CONFIG = {
  plan_1: {
    name: "Practice Plan",
    price: 499,
    testsPerMonth: 300,
    weeklyExams: false,
    description: "300 AI-graded tests per month",
  },
  plan_2: {
    name: "Complete Plan",
    price: 699,
    testsPerMonth: 300,
    weeklyExams: true,
    description: "300 tests + Weekly Exams",
  },
  plan_3: {
    name: "Exam Plan",
    price: 299,
    testsPerMonth: 0,
    weeklyExams: true,
    description: "Weekly Exams only",
  },
} as const;

export const EXTRA_TEST_PRICE = 5; // taka per extra test
export const FREE_TESTS_ON_SIGNUP = 3;

// ─── Category Display Names ──────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  argumentative_essay: "Argumentative Essay",
  basic_paragraph: "Paragraph Writing",
  creative_writing: "Creative Writing",
  personal_reflection: "Personal Reflection",
  quote_analysis: "Quote Analysis",
  translation: "Translation",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  very_hard: "Very Hard",
};
