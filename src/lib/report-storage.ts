export type { ReportSaveBatch } from "./supabase-report-storage";
import type { ReportSaveBatch } from "./supabase-report-storage";

export function usesLocalStorage(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host === "[::1]" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

async function storage() {
  // Never initialize the Supabase client in local mode, even with real keys in .env.local.
  return usesLocalStorage() ? import("./indexeddb-report-storage") : import("./supabase-report-storage");
}

export async function loadStudents() { return (await storage()).loadStudents(); }
export async function addClass(name: string) { return (await storage()).addClass(name); }
export async function addStudent(classId: string, name: string, grade: string) { return (await storage()).addStudent(classId, name, grade); }
export async function archiveStudent(id: string, version: number) { return (await storage()).archiveStudent(id, version); }
export async function deleteStudent(id: string) { return (await storage()).deleteStudent(id); }
export async function deleteClass(id: string) { return (await storage()).deleteClass(id); }
export async function loadReportDay(date: string) { return (await storage()).loadReportDay(date); }
export async function saveReportBatch(batch: ReportSaveBatch) { return (await storage()).saveReportBatch(batch); }
export async function loadWrongAnswers(month: string) { return (await storage()).loadWrongAnswers(month); }
export async function saveWrongAnswer(record: import("../types/wrong-answer").WrongAnswerRecord) { return (await storage()).saveWrongAnswer(record); }
export async function loadHandoffs(month: string) { return (await storage()).loadHandoffs(month); }
export async function addHandoff(record: import("../types/handoff").HandoffRecord) { return (await storage()).addHandoff(record); }
export async function deleteHandoff(id: string) { return (await storage()).deleteHandoff(id); }
