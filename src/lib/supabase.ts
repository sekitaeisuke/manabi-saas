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
  created_at: string;
};

export type Question = {
  id: string;
  test_id: string;
  type: "multiple-choice" | "short-answer";
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
