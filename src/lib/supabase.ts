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
  school_id: string | null;          // 自社の教室
  school_name: string | null;        // 在籍している小中高（つなぐから同期）
  furigana: string | null;
  birthday: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;              // 家庭・生徒の連絡先
  note: string | null;
  login_id: string | null;
  auth_user_id: string | null;
  attendance_days: string[] | null;
  created_at: string;
};

// ── お月謝 ──────────────────────────────────────────────
// つなぐの「契約内容確認・変更」をそのまま受ける。◯月分を前月27日に引き落とす。

export type BillingPlan = {
  id: string;
  tsunagu_plan_id: string | null;
  price_revision_id: string | null;
  kind: string;              // 基本 / オプション / 設備費 / パック / その他
  name: string;
  grades: string[] | null;
  price_excl: number | null;
  price_incl: number | null;
  revised_at: string | null;
  retired: boolean;
  synced_at: string;
};

export type BillingItem = {
  id: string;
  billing_month_id: string;
  kind: string;
  label: string;             // 保護者に見せる名前（プラン名・テキスト代など）
  plan_id: string | null;
  price_revision_id: string | null;
  lesson_count: number | null;
  amount_incl: number;
  amount_excl: number;
  state: string | null;
  tsunagu_price_id: string | null;
  sort_order: number;
};

export type BillingMonth = {
  id: string;
  student_id: string;
  year_month: string;        // 対象月 'YYYY-MM'
  debit_date: string | null; // 引き落とし日（前月27日）
  total_incl: number;
  total_excl: number;
  status: string;            // 未確定 / 確定 / 領収済み
  published: boolean;        // true のときだけ保護者に見える
  published_at: string | null;
  note: string | null;
  source: string;
  synced_at: string | null;
  updated_at: string;
};

// 「2026-10」→「10月分」
export function ymLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? `${Number(m[2])}月分` : ym;
}

export function yen(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return (v < 0 ? "-¥" : "¥") + Math.abs(v).toLocaleString("ja-JP");
}

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
  // ── 講習ビジョン（karte-materials-setup.sql で追加）──
  // 夏期/冬期/春期の目標と成果。面談で使う書類として運用する。
  term_type: TermType | null;
  term_label: string | null;
  term_start: string | null;
  term_end: string | null;
  result_json: unknown | null;
  result_html: string | null;
  meeting_notes: string | null;
};

export type TermType = "summer" | "winter" | "spring" | "regular";

export const TERM_LABEL: Record<TermType, string> = {
  summer: "夏期講習", winter: "冬期講習", spring: "春期講習", regular: "通常期",
};

// ── カルテ（student_karte）──────────────────────────────────
// 素材（報告書 > テスト結果 > 保護者メッセージ > 教材進捗 > 診断）のビュー。
// AIは見立てだけを書き、素材そのものは画面側で素のまま並べる。素材が無い項目は null のまま。
// 生成は /api/karte/build（報告書の保存時・手動再生成・一括）。
export type StudentKarteJson = {
  reached: string | null;          // ① 今の到達点
  stumblePoint: string | null;     // ② つまずきの正体（1つ）
  stumbleEvidence: string | null;  // ②の根拠（設問・報告書からの引用）
  nextStep: string | null;         // ③ 次の一手（今日〜今週）
  family: string | null;           // ④ 家庭の願い・配慮（保護者メッセージ最優先）
  visionProgress: string | null;   // ⑤ 講習ビジョンに対する進み具合
  conflict: string | null;         // 報告書とテストの食い違い
  // ↓ 旧形式（2026-07までに生成された行）。読み出し時の互換のため残す。
  visionSummary?: string;
  currentStatus?: string;
  textbookPace?: string;
  cautions?: string;
  parentNeeds?: string | null;
};

// 素材の充足状況（何が足りなくてカルテが薄いかを画面に出す）
export type KarteMaterialStatus = {
  reports: number;
  tests: number;
  parentMessages: number;
  progress: number;
  diagnosis: number;
};

export type StudentKarte = {
  id: string;
  student_id: string | null;
  student_name: string;
  grade: string | null;
  learning_plan_id: string | null;
  source_snapshot: unknown;
  material_status: KarteMaterialStatus | null;
  built_from: string | null;
  karte_html: string | null;
  karte_json: StudentKarteJson | null;
  status: "draft" | "shared";
  generated_at: string;
  generated_by: string | null;
  created_at: string;
  updated_at: string;
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
