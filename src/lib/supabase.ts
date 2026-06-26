import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Test = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  difficulty: string;
  status: string;
  type: "diagnostic" | "lesson";
  created_at: string;
};

export type Question = {
  id: string;
  test_id: string;
  type: "multiple-choice" | "short-answer" | "multi-select";
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  order_index: number;
  points: number;
};

export type TestSession = {
  id: string;
  test_id: string;
  url_token: string;
  expires_at: string | null;
  created_at: string;
};

export type Answer = {
  id: string;
  session_id: string;
  student_name: string;
  question_id: string;
  answer: string;
  is_correct: boolean | null;
};

export type Result = {
  id: string;
  session_id: string;
  student_name: string;
  score: number;
  total: number;
  percentage: number;
  completed_at: string;
};

export type School = {
  id: string;
  name: string;
  group_name: string | null;
  address: string | null;
  phone: string | null;
  admin_name: string | null;
  created_at: string;
};

export type Teacher = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "teacher" | "part-time";
  school_id: string | null;
  created_at: string;
};

export type Student = {
  id: string;
  name: string;
  grade: string;
  school_id: string | null;
  login_id: string | null;
  auth_user_id: string | null;
  attendance_days: string[] | null;
  created_at: string;
};

export type DiagnosisRating = 1 | 2 | 3 | 4; // ×=1 △=2 ○=3 ◎=4

export type VolumeRatings = {
  daily_completion: DiagnosisRating;
  schedule_adherence: DiagnosisRating;
  basic_fluency: DiagnosisRating;
  weak_unit: DiagnosisRating;
  practice_volume: DiagnosisRating;
};

export type QualityRatings = {
  read_problem: DiagnosisRating;
  read_solution: DiagnosisRating;
  read_example: DiagnosisRating;
  write_steps: DiagnosisRating;
  write_notes: DiagnosisRating;
  write_vocab: DiagnosisRating;
  listen_teacher: DiagnosisRating;
  listen_test_info: DiagnosisRating;
  listen_until_understand: DiagnosisRating;
  speak_error: DiagnosisRating;
  speak_resolving: DiagnosisRating;
  speak_balance: DiagnosisRating;
};

export type Textbook = {
  id: string;
  subject: string;
  grade: string;
  name: string;
  publisher: string | null;
  description: string | null;
  type: string;
  created_at: string;
};

export type LearningPlan = {
  id: string;
  student_name: string;
  grade: string;
  subject: string;
  test_score: number | null;
  test_total: number | null;
  test_percentage: number | null;
  diagnosis_session_id: string | null;
  selected_textbooks: { id: string; name: string; publisher: string | null }[] | null;
  plan_html: string;
  teacher_notes: string | null;
  status: "draft" | "shared";
  created_at: string;
};

export type DifficultyResult = { score: number; total: number };

export type Diagnosis = {
  id: string;
  student_id: string;
  created_at: string;
  test_score: number | null;
  test_total: number | null;
  test_rate: number | null;
  test_subject: string | null;
  weak_units: string[] | null;
  difficulty_results: { basic: DifficultyResult; standard: DifficultyResult; advanced: DifficultyResult } | null;
  volume_ratings: VolumeRatings;
  quality_ratings: QualityRatings;
  volume_score: number;
  quality_score: number;
  report_html: string | null;
};

// ── 教材進捗マネジメント ────────────────────────────────────

export type Understanding = "good" | "normal" | "weak";

export type TextbookProgress = {
  id:             string;
  student_id:     string;
  student_name:   string;
  teacher_id:     string;        // 誰が入力したか
  teacher_name:   string | null;
  lesson_date:    string;
  subject:        string | null;
  textbook:       string;
  progress_where: string | null;
  amount:         string | null;
  understanding:  Understanding | null;
  comment:        string | null;
  created_at:     string;
  updated_at:     string;
};

// ── 出勤怠管理 ──────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "early_leave";
export type AttendanceEntryMethod = "face" | "manual";

export type AttendanceRecord = {
  id:                  string;
  teacher_id:          string;
  school_id:           string | null;
  work_date:           string;
  clock_in:            string | null;
  clock_out:           string | null;
  break_minutes:       number;
  transportation_fee:  number;
  transportation_note: string | null;
  notes:               string | null;
  entry_method:        AttendanceEntryMethod;
  status:              AttendanceStatus;
  created_at:          string;
  updated_at:          string;
};

// ── シフト管理 ──────────────────────────────────────────────

export type ShiftAvailability = "available" | "preferred" | "unavailable";
export type AssignmentMode    = "flexible" | "dedicated";
export type ShiftPeriodStatus = "open" | "closed" | "published";

export type ShiftPeriod = {
  id:              string;
  school_id:       string | null;
  label:           string;
  start_date:      string;
  end_date:        string;
  deadline:        string | null;
  assignment_mode: AssignmentMode;
  status:          ShiftPeriodStatus;
  created_by:      string | null;
  created_at:      string;
};

export type ShiftRequest = {
  id:           string;
  period_id:    string;
  teacher_id:   string;
  date:         string;
  slot_start:   string;
  slot_end:     string;
  availability: ShiftAvailability;
  note:         string | null;
  submitted_at: string;
};

export type ShiftAssignment = {
  id:         string;
  period_id:  string;
  teacher_id: string;
  school_id:  string;
  date:       string;
  slot_start: string;
  slot_end:   string;
  status:     "draft" | "confirmed";
  note:       string | null;
  created_at: string;
};

export type EventType = "event" | "exam" | "holiday" | "class" | "info";

export type ShiftEvent = {
  id:                  string;
  school_id:           string | null;
  period_id:           string | null;
  date:                string;
  start_time:          string | null;
  end_time:            string | null;
  title:               string;
  description:         string | null;
  event_type:          EventType;
  visible_to_teachers: boolean;
  visible_to_parents:  boolean;
  visible_to_students: boolean;
  created_by:          string | null;
  created_at:          string;
};

export type ShiftAiRun = {
  id:              string;
  period_id:       string;
  custom_prompt:   string | null;
  assignment_mode: AssignmentMode;
  raw_response:    string | null;
  result_json:     unknown;
  executed_by:     string | null;
  executed_at:     string;
};
