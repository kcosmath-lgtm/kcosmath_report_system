import dayjs from "dayjs";
import type { WrongAnswerRecord } from "../types/wrong-answer";

export function reportMonths(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !dayjs(start).isValid() || !dayjs(end).isValid() || dayjs(start).format("YYYY-MM-DD") !== start || dayjs(end).format("YYYY-MM-DD") !== end || start > end) return [];
  const months: string[] = [];
  for (let cursor = dayjs(start).startOf("month"); cursor.format("YYYY-MM") <= end.slice(0, 7); cursor = cursor.add(1, "month")) months.push(cursor.format("YYYY-MM"));
  return months;
}

export function summarize(records: WrongAnswerRecord[]) {
  const wrongRecords = records.filter(r => r.total_wrong > 0 || r.completed);
  const completedDays = wrongRecords.filter(r => r.completed || r.total_wrong === r.corrected_count).length;
  const total = records.reduce((n, r) => n + r.total_wrong, 0);
  const corrected = records.reduce((n, r) => n + r.corrected_count, 0);
  const homework = { O: 0, "△": 0, X: 0, missing: 0 };
  for (const r of records) { if (r.homework_status) homework[r.homework_status]++; else homework.missing++; }
  const homeworkDays = homework.O + homework["△"] + homework.X;
  return { total, corrected, remaining: total - corrected,
    rate: total ? Math.round(corrected / total * 1000) / 10 : null,
    completedDays, wrongDays: wrongRecords.length,
    practiceRate: wrongRecords.length ? Math.round(completedDays / wrongRecords.length * 1000) / 10 : null,
    averageWrong: wrongRecords.length ? Math.round(total / wrongRecords.length * 10) / 10 : null,
    homework, homeworkRate: homeworkDays ? Math.round(homework.O / homeworkDays * 1000) / 10 : null };
}

export function achievement(stats: ReturnType<typeof summarize>): string {
  if (!stats.wrongDays) return "오답 기록이 없어 실천율을 계산하지 않았습니다.";
  const quantity = `기록된 오답 ${stats.total}문제 중 ${stats.corrected}문제를 수정했습니다.`;
  if (stats.wrongDays < 3) return `오답 기록은 ${stats.wrongDays}일입니다. ${quantity}`;
  if (stats.completedDays === stats.wrongDays) return `기록한 ${stats.wrongDays}일 모두 오답을 마무리했어요! ${quantity}`;
  return `${quantity} 남은 ${stats.remaining}문제도 차근차근 복습해요.`;
}
