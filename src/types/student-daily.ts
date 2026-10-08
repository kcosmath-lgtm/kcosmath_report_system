import type { WrongAnswerRecord } from './wrong-answer';

export type Attendance = '' | '출석' | '지각' | '결석' | '조퇴';
export interface DailyExam { id: string; name: string; score: number; max_score: number; scope: string; memo: string }
export interface StudentDailyRecord {
  id: string; student_id: string; record_date: string; attendance: Attendance;
  reason: string; exams: DailyExam[]; version: number;
}
export interface StudentDailySave { daily: StudentDailyRecord; wrong: WrongAnswerRecord }
export function validateDailySave({ daily, wrong }: StudentDailySave) {
  if (daily.student_id !== wrong.student_id || daily.record_date !== wrong.record_date ||
    !['', '출석', '지각', '결석', '조퇴'].includes(daily.attendance) || daily.reason.length > 2000 ||
    !Number.isInteger(wrong.total_wrong) || !Number.isInteger(wrong.corrected_count) ||
    wrong.corrected_count < 0 || wrong.total_wrong < wrong.corrected_count || daily.exams.length > 20 ||
    daily.exams.some(e => !e.name.trim() || !Number.isFinite(e.score) || !Number.isFinite(e.max_score) ||
      e.score < 0 || e.max_score <= 0 || e.score > e.max_score)) throw new Error('오답 개수와 시험명·점수·만점을 확인해 주세요.');
}
