import type { ReportData, ReportStudent } from "../types/report";

export function normalizeHomeworkStatus(value: string): "O" | "△" | "X" {
  if (["△", "세모"].includes(value)) return "△";
  if (value.toUpperCase() === "X" || value === "×") return "X";
  return "O";
}

export function nextHomeworkStatus(value: string): "O" | "△" | "X" {
  const values = ["O", "△", "X"] as const;
  return values[(values.indexOf(normalizeHomeworkStatus(value)) + 1) % values.length];
}

export function defaultReport(date: string): ReportData {
  return { date, type: "정규", teacher: "", name: "", subject: "수학", grade: "", book: "",
    attendance: "o", time: "", status: "-", reason: "-", progress: "", hwLast: "O", hwCurrent: "-", notes: "" };
}

export function defaultTeacher(group: string): string {
  if (group.includes("중1 정규반") || group.includes("초등 심화반")) return "신기정T";
  if (group.includes("중2 정규반") || group.includes("초6 정규반")) return "홍정욱T";
  if (group.includes("중3 정규반") || group.includes("공통수학")) return "김윤재T";
  if (group.includes("초등 기본반") || group.includes("중등 개별반") || group.includes("은애쌤")) return "백금채T";
  return "신기정T";
}

export function studentSnapshot(common: ReportData, student: ReportStudent, saved?: Partial<ReportData>): ReportData {
  // Saved identity and content are historical snapshots, not live student values.
  return { ...common, name: student.name, grade: student.grade, ...saved };
}

export function isSameSnapshot(a: object, b: object): boolean {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every(key => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}
