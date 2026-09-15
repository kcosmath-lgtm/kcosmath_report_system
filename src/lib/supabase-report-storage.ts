import { supabase } from "./supabase";
import type { StudentGroup } from "../types/student";
import type { LessonRecord, ReportRecord } from "../types/report";

export function storageError(error: { message: string; code?: string }): Error {
  if (error.code === "40001" || error.code === "23505") {
    return new Error("다른 창에서 데이터가 변경되었거나 이미 등록되어 있습니다. 현재 작성 내용을 별도로 복사한 뒤 새로고침하여 다시 확인해 주세요.");
  }
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")) {
    return new Error("새 저장 구조가 아직 준비되지 않았습니다. Supabase에서 마이그레이션 SQL을 먼저 실행해 주세요.");
  }
  return new Error(`데이터를 처리하지 못했습니다. 변경 내용은 저장되지 않았습니다. (${error.message})`);
}

export async function loadStudents(): Promise<StudentGroup[]> {
  const { data, error } = await supabase.from("cosmath_classes")
    .select("id, name, cosmath_students(id, name, grade, version, active)").order("name");
  if (error) throw storageError(error);
  return (data ?? []).map(group => ({ id: group.id, group: group.name,
    students: group.cosmath_students.filter(student => student.active)
      .map(({ id, name, grade, version }) => ({ id, name, grade, version }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  }));
}

export async function addClass(name: string) {
  const { data, error } = await supabase.from("cosmath_classes").insert({ name }).select("id, name").single();
  if (error) throw storageError(error);
  return { id: data.id as string, group: data.name as string, students: [] } satisfies StudentGroup;
}

export async function addStudent(classId: string, name: string, grade: string) {
  const { data, error } = await supabase.from("cosmath_students")
    .insert({ id: crypto.randomUUID(), class_id: classId, name, grade })
    .select("id, name, grade, version").single();
  if (error) throw storageError(error);
  return data as StudentGroup["students"][number];
}

export async function archiveStudent(id: string, version: number) {
  const { data, error } = await supabase.from("cosmath_students")
    .update({ active: false, version: version + 1 }).eq("id", id).eq("version", version)
    .eq("active", true).select("id").maybeSingle();
  if (error) throw storageError(error);
  if (!data) throw storageError({ code: "40001", message: "Student changed" });
}

export async function loadReportDay(date: string) {
  // One RPC gives a consistent snapshot of both tables in the same transaction.
  const { data, error } = await supabase.rpc("cosmath_load_report_day", { p_date: date });
  if (error) throw storageError(error);
  return data as { lessons: LessonRecord[]; reports: ReportRecord[] };
}

export interface ReportSaveBatch {
  lessons: Array<Omit<LessonRecord, "version"> & { expected_version: number }>;
  reports: Array<Omit<ReportRecord, "version"> & { expected_version: number }>;
}

export async function saveReportBatch(batch: ReportSaveBatch) {
  const { data, error } = await supabase.rpc("cosmath_save_report_batch", {
    p_lessons: batch.lessons, p_reports: batch.reports,
  });
  if (error) throw storageError(error);
  return data as { lessons: LessonRecord[]; reports: ReportRecord[] };
}
