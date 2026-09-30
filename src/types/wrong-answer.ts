export type HomeworkStatus = "O" | "△" | "X";

export interface WrongAnswerRecord {
  id: string;
  student_id: string;
  record_date: string;
  total_wrong: number;
  corrected_count: number;
  memo: string;
  version: number;
  completed?: boolean;
  homework_status?: HomeworkStatus | null;
}
