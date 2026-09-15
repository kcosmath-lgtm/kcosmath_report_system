"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { getFormattedDate } from "../utils/date";
import { GRADE_REPORT_DATA } from "../constants/reportContents";
import type { LessonRecord, ReportData, ReportRecord, ReportStudent } from "../types/report";
import { loadReportDay, saveReportBatch, type ReportSaveBatch } from "./report-storage";
import { defaultReport, defaultTeacher, isSameSnapshot, studentSnapshot } from "./report-model";

export function useReportEditor() {
  const [reportDate, setReportDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [selectedStudents, setSelectedStudents] = useState<ReportStudent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, ReportData>>({});
  const [savedReports, setSavedReports] = useState<ReportRecord[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [isIndividualMode, setIsIndividualMode] = useState(false);
  const [reload, setReload] = useState(0);
  const lessons = useRef<Record<string, LessonRecord>>({});
  const reports = useRef<Record<string, ReportRecord>>({});
  const students = useRef<Record<string, ReportStudent>>({});
  const draftRef = useRef<Record<string, ReportData>>({});
  const selection = useRef<ReportStudent[]>([]);
  const dirtyStudents = useRef(new Set<string>());
  const dirtyClasses = useRef(new Set<string>());
  const saving = useRef(false);
  const loading = useRef(true);

  const publishDrafts = useCallback((next: Record<string, ReportData>) => {
    draftRef.current = next; setDrafts(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loading.current = true;
    setIsLoading(true); setError(""); setLoadFailed(false);
    loadReportDay(reportDate).then(day => {
      if (cancelled) return;
      lessons.current = Object.fromEntries(day.lessons.map(lesson => [lesson.class_id, lesson]));
      reports.current = Object.fromEntries(day.reports.map(report => [report.student_id, report]));
      students.current = Object.fromEntries(day.reports.map(report => [report.student_id, {
        id: report.student_id, name: report.snapshot.name, grade: report.snapshot.grade,
        group: report.snapshot.group, classId: report.snapshot.classId,
      }]));
      publishDrafts(Object.fromEntries(day.reports.map(report => [report.student_id, {
        ...defaultReport(getFormattedDate(reportDate)), ...report.snapshot,
      }])));
      setSavedReports(day.reports);
      dirtyStudents.current.clear(); dirtyClasses.current.clear();
      setHasUnsavedChanges(false); setSelectedStudents([]); selection.current = []; setCurrentIndex(0);
    }).catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : "보고서를 불러오지 못했습니다."); setLoadFailed(true); } })
      .finally(() => { if (!cancelled) { loading.current = false; setIsLoading(false); setIsInitialized(true); } });
    return () => { cancelled = true; };
  }, [reportDate, reload, publishDrafts]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyStudents.current.size || saving.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const handleBatchSelect = useCallback((values: ReportStudent[]) => {
    if (loading.current || saving.current || loadFailed) return;
    const next = { ...draftRef.current };
    for (const student of values) {
      if (!students.current[student.id]) students.current[student.id] = student;
      if (!next[student.id]) {
        const preset = GRADE_REPORT_DATA[student.grade];
        const defaults = { ...defaultReport(getFormattedDate(reportDate)),
          teacher: defaultTeacher(student.group),
          time: student.grade.includes("중") ? "17:30 ~ 19:30" : student.grade.includes("고") ? "19:00 ~ 22:00" : "15:30 ~ 17:30",
          ...(preset ? { book: preset.book, progress: preset.progress, notes: preset.notes } : {}),
          ...lessons.current[student.classId]?.common_data,
        };
        next[student.id] = studentSnapshot(defaults, student);
      }
    }
    publishDrafts(next); selection.current = values;
    setSelectedStudents(values); setCurrentIndex(0);
  }, [loadFailed, reportDate, publishDrafts]);

  const currentStudent = selectedStudents[currentIndex] ?? null;
  const reportData = (currentStudent && drafts[currentStudent.id]) || defaultReport(getFormattedDate(reportDate));

  const updateField = (key: keyof ReportData, value: string) => {
    if (loading.current || saving.current || loadFailed || key === "date" || key === "name" || key === "grade") return;
    const targets = isIndividualMode ? (currentStudent ? [currentStudent] : []) : selectedStudents;
    const next = { ...draftRef.current };
    for (const student of targets) {
      next[student.id] = { ...next[student.id], [key]: value };
      dirtyStudents.current.add(student.id);
      if (!isIndividualMode && !["attendance", "status", "reason"].includes(key)) {
        const lesson = lessons.current[student.classId] ?? {
          id: crypto.randomUUID(), class_id: student.classId, report_date: reportDate,
          common_data: {}, version: 0,
        };
        lessons.current[student.classId] = { ...lesson, common_data: { ...lesson.common_data, [key]: value } };
        dirtyClasses.current.add(student.classId);
      }
    }
    publishDrafts(next); setHasUnsavedChanges(dirtyStudents.current.size > 0);
  };

  const saveToSupabase = useCallback(async () => {
    if (saving.current || loading.current || loadFailed) return;
    const ids = [...new Set([...dirtyStudents.current, ...selection.current.map(student => student.id)])];
    if (!ids.length) { setError("저장할 학생을 먼저 선택해 주세요."); return; }
    saving.current = true; setIsSaving(true); setError("");
    try {
      const batch: ReportSaveBatch = { lessons: [], reports: [] };
      const classIds = new Set<string>(dirtyClasses.current);
      for (const id of ids) {
        const student = students.current[id];
        const existing = reports.current[id];
        const snapshot = { ...draftRef.current[id], group: student.group, classId: student.classId };
        if (existing && isSameSnapshot(existing.snapshot, snapshot)) continue;
        let lesson = lessons.current[student.classId];
        if (!lesson) {
          lesson = { id: crypto.randomUUID(), class_id: student.classId, report_date: reportDate, common_data: {}, version: 0 };
          lessons.current[student.classId] = lesson;
        }
        classIds.add(student.classId);
        batch.reports.push({ id: existing?.id ?? crypto.randomUUID(), lesson_id: lesson.id, student_id: id,
          snapshot, expected_version: existing?.version ?? 0 });
      }
      for (const classId of classIds) {
        const lesson = lessons.current[classId];
        if (lesson.version === 0 || dirtyClasses.current.has(classId)) {
          batch.lessons.push({ id: lesson.id, class_id: classId, report_date: reportDate,
            common_data: lesson.common_data, expected_version: lesson.version });
        }
      }
      if (batch.reports.length || batch.lessons.length) {
        const saved = await saveReportBatch(batch);
        for (const lesson of saved.lessons) lessons.current[lesson.class_id] = lesson;
        for (const report of saved.reports) reports.current[report.student_id] = report;
        setSavedReports(Object.values(reports.current));
      }
      dirtyStudents.current.clear(); dirtyClasses.current.clear(); setHasUnsavedChanges(false);
      alert("선택한 학생과 수정한 보고서가 저장되었습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "저장에 실패했습니다. 작성 내용은 화면에 유지됩니다."); }
    finally { saving.current = false; setIsSaving(false); }
  }, [loadFailed, reportDate]);

  useEffect(() => {
    const save = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveToSupabase(); } };
    window.addEventListener("keydown", save); return () => window.removeEventListener("keydown", save);
  }, [saveToSupabase]);

  function changeDate(date: string) {
    if (!date || date === reportDate || !dayjs(date).isValid() || saving.current || loading.current) return;
    if (dirtyStudents.current.size && !window.confirm("저장하지 않은 변경사항을 버리고 다른 날짜를 열까요?")) return;
    loading.current = true; setIsLoading(true); setReportDate(date);
  }
  function retryLoad() {
    if (saving.current || loading.current) return;
    if (dirtyStudents.current.size && !window.confirm("작성 내용을 별도로 보관하셨나요? 다시 불러오면 저장하지 않은 변경사항이 사라집니다.")) return;
    loading.current = true; setIsLoading(true); setReload(value => value + 1);
  }
  function openSavedReport(id: string) {
    const student = students.current[id];
    if (student) handleBatchSelect([student]);
  }

  return { reportDate, changeDate, savedReports, openSavedReport, isInitialized, isLoading, loadFailed, error, retryLoad,
    selectedStudents, currentIndex, setCurrentIndex, currentStudent, reportData,
    isSaving, hasUnsavedChanges, isIndividualMode, setIsIndividualMode, handleBatchSelect, updateField, saveToSupabase,
    nextReport: () => setCurrentIndex(index => Math.min(index + 1, selectedStudents.length - 1)),
    prevReport: () => setCurrentIndex(index => Math.max(index - 1, 0)),
  };
}
