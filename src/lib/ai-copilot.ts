"use client";

import { supabase } from "./supabase";
import {
  usesLocalStorage,
  loadStudents,
  addClass,
  addStudent,
  updateStudent,
  deleteStudent,
  deleteClass,
  loadStudentDaily,
  saveStudentDaily,
  loadWrongAnswers,
  loadProgress,
  saveProgress,
  addHandoff,
} from "./report-storage";
import { consumeLocalQuota, notifyQuotaUpdated, type AiQuotaSnapshot } from "./ai-quota-client";
import {
  addOrUpdateAcademyStaffMember,
  fetchAcademyStaffFromDb,
  loadAcademyStaff,
  removeAcademyStaffMember,
  type AcademyStaffMember,
} from "./academy-staff";
import { fetchAiPersonaFromDb, loadAiPersonaConfig, resolveActivePersonaPrompt } from "./ai-personas";
import { renderMathGeoPngDataUrl, type MathGeoSpec } from "./math-geometry-engine";
import { isTemplate, type Template, type Block, type Kind, type Period, type Theme } from "../app/report/new/templates";
import { unitProgressPercent, syncUnitStatesFromPage, type ProgressBook } from "../types/progress";
import type { MockExamProblemToken } from "../types/mock-exam";

export interface GeneratedMathProblem {
  id: string;
  title: string;
  grade: number;
  subject: string;
  unit: string;
  points?: string;
  intent?: string;
  difficulty: "하" | "중" | "상" | "킬러";
  sourceLabel: string;
  sourceTokenId?: string;
  sourceOrigin?: MockExamProblemToken;
  question: string;
  boxContent: string;
  choices: string[];
  answer: string;
  solution: string;
  figure?: string;
  geoSpec?: MathGeoSpec;
  createdAt: string;
}

export interface ExamPaperStyle {
  title?: string;
  subtitle?: string;
  headerLeft?: string;
  headerRight?: string;
  footerText?: string;
  columns?: number;
  perPage?: number;
  headerStyle?: "suneung" | "modern" | "academy" | "minimal" | "banner" | "none" | string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  problemGap?: number;
  solutionSpace?: number;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderStyle?: "double" | "solid" | "dashed" | "box" | "none" | string;
  showColumnDivider?: boolean;
  showStudentInfoBox?: boolean;
  showPoints?: boolean;
  showDifficulty?: boolean;
  showSource?: boolean;
  showAnswerKey?: boolean;
  showSolutions?: boolean;
  choiceColumns?: number;
  pagePadding?: number;
  watermark?: string;
  customNote?: string;
  customCss?: Record<string, string | number>;
}

export const DEFAULT_EXAM_PAPER_STYLE: ExamPaperStyle = {
  title: "2026 수학 실전 모의고사",
  subtitle: "2026학년도 대학수학능력시험 대비 수학 영역",
  headerLeft: "제 2 교시",
  headerRight: "홀수형",
  footerText: "유니데스크 AI 수학 연구소",
  columns: 2,
  perPage: 0,
  headerStyle: "suneung",
  fontFamily: "'Noto Serif KR', 'Batang', Georgia, serif",
  fontSize: 13.5,
  lineHeight: 1.68,
  problemGap: 22,
  solutionSpace: 40,
  accentColor: "#111827",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  borderStyle: "double",
  showColumnDivider: true,
  showStudentInfoBox: true,
  showPoints: true,
  showDifficulty: false,
  showSource: false,
  showAnswerKey: true,
  showSolutions: true,
  choiceColumns: 0,
  pagePadding: 24,
  watermark: "",
  customNote: "",
  customCss: {},
};

const LOCAL_EXAM_STYLE_KEY = "cosmath:ai-exam-style:v1";

export function loadAiExamStyle(): ExamPaperStyle {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_EXAM_STYLE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_EXAM_PAPER_STYLE, ...parsed };
      }
    }
  } catch {
    // Ignore
  }
  return { ...DEFAULT_EXAM_PAPER_STYLE };
}

export function saveAiExamStyle(style: ExamPaperStyle, reset = false): ExamPaperStyle {
  const base = reset ? DEFAULT_EXAM_PAPER_STYLE : loadAiExamStyle();
  const merged: ExamPaperStyle = {
    ...base,
    ...style,
    customCss: {
      ...(reset ? {} : base.customCss || {}),
      ...(style.customCss || {}),
    },
  };
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_EXAM_STYLE_KEY, JSON.stringify(merged));
    }
  } catch {
    // Ignore
  }
  return merged;
}

export type AiCopilotAction =
  | {
      type: "add_class";
      name: string;
    }
  | {
      type: "delete_class";
      name: string;
    }
  | {
      type: "add_student";
      className: string;
      name: string;
      grade: string;
    }
  | {
      type: "update_student";
      targetName: string;
      newName?: string;
      newGrade?: string;
    }
  | {
      type: "delete_student";
      name: string;
      className?: string;
    }
  | {
      type: "record_daily";
      date?: string;
      className?: string;
      studentName: string;
      attendance?: "출석" | "지각" | "결석" | "조퇴";
      homework?: "O" | "△" | "X";
      totalWrong?: number;
      correctedCount?: number;
      wrongCompleted?: boolean;
      examName?: string;
      examScore?: number;
      examMaxScore?: number;
      memo?: string;
    }
  | {
      type: "record_progress";
      date?: string;
      className?: string;
      studentName: string;
      bookTitle?: string;
      scope?: string;
      homework?: string;
      completedPage?: number;
      memo?: string;
    }
  | {
      type: "add_handoff";
      date?: string;
      author?: string;
      title: string;
      content: string;
    }
  | {
      type: "upsert_staff";
      name: string;
      role?: "원장님" | "선생님" | "조교쌤" | "실장님" | string;
      assignedClasses?: string;
      duties?: string;
    }
  | {
      type: "delete_staff";
      name: string;
    }
  | {
      type: "typing_update_problems";
      mode: "append" | "replace_all" | "update_by_number";
      title?: string;
      problems: Array<{
        number: string;
        points?: string;
        question: string;
        boxContent?: string;
        choices?: string[];
        answer?: string;
        solution?: string;
        figure?: string;
        geoSpec?: MathGeoSpec;
      }>;
    }
  | {
      type: "generate_report_feedbacks";
      feedbacks: Array<{
        studentId?: string;
        studentName: string;
        feedback: string;
      }>;
    }
  | {
      type: "update_geo_spec";
      geoSpec: MathGeoSpec;
      description?: string;
    }
  | {
      type: "update_exam_style";
      style: ExamPaperStyle;
      reset?: boolean;
    }
  | {
      type: "generate_problems";
      problems: Array<{
        title?: string;
        grade?: number;
        subject?: string;
        unit?: string;
        points?: string;
        intent?: string;
        difficulty?: "하" | "중" | "상" | "킬러";
        sourceLabel?: string;
        sourceTokenId?: string;
        sourceOrigin?: MockExamProblemToken;
        question: string;
        boxContent?: string;
        choices?: string[];
        answer?: string;
        solution?: string;
        figure?: string;
        geoSpec?: MathGeoSpec;
      }>;
    }
  | {
      type: "update_report_template";
      template: {
        name: string;
        orientation?: "portrait" | "landscape";
        theme?: Theme;
        period?: Period;
        illustrations?: boolean;
        blocks: Array<{
          kind: Kind;
          view: Block["view"];
          wide?: boolean;
          emphasis?: boolean;
        }>;
      };
    };

export interface AiCopilotResponse {
  reply: string;
  actions: AiCopilotAction[];
  appliedSummary: string[];
  createdProblems?: GeneratedMathProblem[];
  reportFeedbacks?: Array<{ studentId?: string; studentName: string; feedback: string }>;
  updatedGeoSpec?: MathGeoSpec;
  updatedExamStyle?: ExamPaperStyle;
  modelUsed?: string;
  webSearchSources?: Array<{ title: string; url: string }>;
  quota?: AiQuotaSnapshot;
}

const LOCAL_PROBLEMS_KEY = "cosmath:generated-problems:v1";
let generatedProblemsTableMissing = false;

function readLocalGeneratedProblems(): GeneratedMathProblem[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_PROBLEMS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as GeneratedMathProblem[];
    }
  } catch {
    // Ignore
  }
  return [];
}

export async function loadGeneratedProblems(): Promise<GeneratedMathProblem[]> {
  const localItems = readLocalGeneratedProblems();
  const localById = new Map(localItems.map(item => [item.id, item]));

  if (!usesLocalStorage() && !generatedProblemsTableMissing) {
    try {
      const { data, error } = await supabase
        .from("cosmath_generated_problems")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        generatedProblemsTableMissing = true;
      } else if (Array.isArray(data) && data.length > 0) {
        const remoteItems: GeneratedMathProblem[] = data.map(row => {
          const id = String(row.id);
          const localMatch = localById.get(id);
          return {
            id,
            title: String(row.title || localMatch?.title || "AI 생성 문항"),
            grade: Number(row.grade || localMatch?.grade || 1),
            subject: String(row.subject || localMatch?.subject || "공통수학"),
            unit: String(row.unit || localMatch?.unit || ""),
            points: localMatch?.points,
            intent: localMatch?.intent,
            difficulty: (["하", "중", "상", "킬러"].includes(row.difficulty)
              ? row.difficulty
              : localMatch?.difficulty || "중") as GeneratedMathProblem["difficulty"],
            sourceLabel: String(row.source_label || localMatch?.sourceLabel || "AI 출제"),
            sourceTokenId: localMatch?.sourceTokenId,
            sourceOrigin: localMatch?.sourceOrigin,
            question: String(row.question || localMatch?.question || ""),
            boxContent: String(row.box_content ?? localMatch?.boxContent ?? ""),
            choices: Array.isArray(row.choices) ? row.choices.map(String) : localMatch?.choices || [],
            answer: String(row.answer ?? localMatch?.answer ?? ""),
            solution: String(row.solution ?? localMatch?.solution ?? ""),
            figure: localMatch?.figure,
            geoSpec: localMatch?.geoSpec,
            createdAt: String(row.created_at || localMatch?.createdAt || new Date().toISOString()),
          };
        });
        const remoteIds = new Set(remoteItems.map(r => r.id));
        return [...remoteItems, ...localItems.filter(l => !remoteIds.has(l.id))].slice(0, 200);
      }
    } catch {
      // Fallback to localStorage
    }
  }
  return localItems;
}

export async function saveGeneratedProblems(items: Omit<GeneratedMathProblem, "id" | "createdAt">[]): Promise<GeneratedMathProblem[]> {
  const now = new Date().toISOString();
  const created: GeneratedMathProblem[] = items.map(item => ({
    ...item,
    id: crypto.randomUUID(),
    createdAt: now,
  }));

  try {
    const existing = readLocalGeneratedProblems();
    const merged = [...created, ...existing.filter(e => !created.some(c => c.id === e.id))].slice(0, 200);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_PROBLEMS_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("cosmath-ai-problems-generated", { detail: created }));
    }
  } catch {
    // Ignore
  }

  if (!usesLocalStorage() && !generatedProblemsTableMissing) {
    try {
      const rows = created.map(p => ({
        id: p.id,
        title: p.title,
        grade: Math.min(3, Math.max(1, p.grade || 1)),
        subject: p.subject || "공통수학",
        unit: p.unit || "",
        difficulty: p.difficulty || "중",
        source_label: p.sourceLabel || "AI 출제",
        question: p.question,
        box_content: p.boxContent || "",
        choices: p.choices || [],
        answer: p.answer || "",
        solution: p.solution || "",
      }));
      const { error } = await supabase.from("cosmath_generated_problems").insert(rows);
      if (error) generatedProblemsTableMissing = true;
    } catch {
      generatedProblemsTableMissing = true;
    }
  }

  return created;
}

export async function deleteGeneratedProblem(id: string): Promise<void> {
  if (!usesLocalStorage() && !generatedProblemsTableMissing) {
    try {
      const { error } = await supabase.from("cosmath_generated_problems").delete().eq("id", id);
      if (error) generatedProblemsTableMissing = true;
    } catch {
      generatedProblemsTableMissing = true;
    }
  }
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_PROBLEMS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as GeneratedMathProblem[];
      const next = parsed.filter(p => p.id !== id);
      localStorage.setItem(LOCAL_PROBLEMS_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore
  }
}

const LOCAL_REPORT_TEMPLATES_KEY = "cosmath:ai-report-templates:v1";
const ACTIVE_REPORT_TEMPLATE_KEY = "cosmath:ai-report-template:active:v1";

export function loadAiReportTemplates(): Template[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_REPORT_TEMPLATES_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(isTemplate);
      }
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveAiReportTemplate(template: Template): Template[] {
  const normalized: Template = {
    ...template,
    id: template.id || crypto.randomUUID(),
    name: (template.name || "AI 맞춤 템플릿").trim().slice(0, 40) || "AI 맞춤 템플릿",
  };
  const existing = loadAiReportTemplates();
  const next = [normalized, ...existing.filter(t => t.id !== normalized.id)].slice(0, 12);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_REPORT_TEMPLATES_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore
  }
  return next;
}

export function deleteAiReportTemplate(id: string): Template[] {
  const next = loadAiReportTemplates().filter(t => t.id !== id);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_REPORT_TEMPLATES_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore
  }
  return next;
}

export function loadActiveAiReportTemplate(): Template | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_REPORT_TEMPLATE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isTemplate(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function saveActiveAiReportTemplate(template: Template | null): void {
  try {
    if (typeof window !== "undefined") {
      if (!template) {
        localStorage.removeItem(ACTIVE_REPORT_TEMPLATE_KEY);
      } else {
        localStorage.setItem(ACTIVE_REPORT_TEMPLATE_KEY, JSON.stringify(template));
      }
    }
  } catch {
    // Ignore
  }
}

function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function executeCopilotActions(
  actions: AiCopilotAction[],
  outCreatedProblems?: GeneratedMathProblem[]
): Promise<string[]> {
  const summaries: string[] = [];
  if (!actions?.length) return summaries;

  for (const action of actions) {
    try {
      if (action.type === "add_class" && action.name) {
        const groups = await loadStudents();
        const exists = groups.find(g => g.group.trim() === action.name.trim());
        if (!exists) {
          await addClass(action.name.trim());
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          summaries.push(`새 반 '${action.name.trim()}' 생성 완료`);
        } else {
          summaries.push(`'${action.name.trim()}' 반이 이미 존재합니다`);
        }
      } else if (action.type === "delete_class" && action.name) {
        const groups = await loadStudents();
        const target = groups.find(g => g.group.trim() === action.name.trim() || g.group.includes(action.name.trim()));
        if (target) {
          await deleteClass(target.id);
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          summaries.push(`'${target.group}' 반 삭제 완료`);
        } else {
          summaries.push(`삭제할 '${action.name}' 반을 찾지 못했습니다`);
        }
      } else if (action.type === "add_student" && action.name) {
        const groups = await loadStudents();
        let targetGroup = groups.find(g => g.group.includes(action.className || "")) ?? groups[0];
        if (!targetGroup) {
          targetGroup = await addClass(action.className || "기본반");
        }
        await addStudent(targetGroup.id, action.name.trim(), action.grade || "고1");
        window.dispatchEvent(new Event("cosmath-roster-changed"));
        summaries.push(`'${targetGroup.group}'에 학생 '${action.name.trim()}' (${action.grade || "고1"}) 등록 완료`);
      } else if (action.type === "update_student" && action.targetName) {
        const groups = await loadStudents();
        const all = groups.flatMap(g => g.students);
        const target = all.find(s => s.name === action.targetName.trim() || s.name.includes(action.targetName.trim()));
        if (target) {
          const nextName = (action.newName || target.name).trim();
          const nextGrade = (action.newGrade || target.grade).trim();
          await updateStudent(target.id, nextName, nextGrade, target.version);
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          summaries.push(`학생 '${target.name}' 정보를 '${nextName} (${nextGrade})'(으)로 수정 완료`);
        } else {
          summaries.push(`수정할 학생 '${action.targetName}'을(를) 찾지 못했습니다`);
        }
      } else if (action.type === "delete_student" && action.name) {
        const groups = await loadStudents();
        const all = groups.flatMap(g => g.students.map(s => ({ ...s, className: g.group })));
        const target = all.find(
          s =>
            (s.name === action.name.trim() || s.name.includes(action.name.trim())) &&
            (!action.className || s.className.includes(action.className))
        );
        if (target) {
          await deleteStudent(target.id);
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          summaries.push(`'${target.className}'의 '${target.name}' 학생 삭제 완료`);
        } else {
          summaries.push(`삭제할 학생 '${action.name}'을(를) 찾지 못했습니다`);
        }
      } else if (action.type === "record_daily") {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(action.date || "") ? action.date! : kstToday();
        const month = date.slice(0, 7);
        const [groups, dailyRows, wrongRows] = await Promise.all([
          loadStudents(),
          loadStudentDaily(month),
          loadWrongAnswers(month),
        ]);
        const allStudents = groups.flatMap(g => g.students.map(s => ({ ...s, className: g.group })));
        const targets = allStudents.filter(s => {
          if (action.studentName === "전체" || action.studentName === "전원") {
            return action.className ? s.className.includes(action.className) : true;
          }
          return s.name.includes(action.studentName) || (action.className && s.className.includes(action.className) && !action.studentName);
        });

        if (targets.length > 0) {
          const saves = targets.map(student => {
            const existingDaily = dailyRows.find(d => d.student_id === student.id && d.record_date === date);
            const existingWrong = wrongRows.find(w => w.student_id === student.id && w.record_date === date);
            const exams = [...(existingDaily?.exams ?? [])];
            if (action.examName && typeof action.examScore === "number") {
              exams.push({
                id: crypto.randomUUID(),
                name: action.examName,
                score: action.examScore,
                max_score: action.examMaxScore && action.examMaxScore > 0 ? action.examMaxScore : 100,
                scope: "",
                memo: "",
              });
            }
            const totalWrong = typeof action.totalWrong === "number" ? action.totalWrong : (existingWrong?.total_wrong ?? 0);
            const correctedCount =
              action.wrongCompleted === true
                ? totalWrong
                : typeof action.correctedCount === "number"
                  ? Math.min(totalWrong, action.correctedCount)
                  : Math.min(totalWrong, existingWrong?.corrected_count ?? 0);
            const isCompleted =
              action.wrongCompleted !== undefined
                ? action.wrongCompleted
                : (totalWrong > 0 && correctedCount >= totalWrong) || Boolean(existingWrong?.completed);

            return {
              daily: {
                id: existingDaily?.id ?? crypto.randomUUID(),
                student_id: student.id,
                record_date: date,
                attendance: action.attendance ?? existingDaily?.attendance ?? "",
                reason: action.memo ?? existingDaily?.reason ?? "",
                exams,
                version: existingDaily?.version ?? 0,
              },
              wrong: {
                id: existingWrong?.id ?? crypto.randomUUID(),
                student_id: student.id,
                record_date: date,
                total_wrong: totalWrong,
                corrected_count: correctedCount,
                homework_status: action.homework ?? existingWrong?.homework_status ?? null,
                completed: isCompleted,
                memo: action.memo ?? existingWrong?.memo ?? "",
                version: existingWrong?.version ?? 0,
              },
            };
          });
          await saveStudentDaily(saves);
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          window.dispatchEvent(new Event("cosmath-records-changed"));
          summaries.push(`${date} 기준 ${targets.map(t => t.name).join(", ")} 학생 일일 출결·숙제·오답·성적 반영 완료`);
        }
      } else if (action.type === "record_progress") {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(action.date || "") ? action.date! : kstToday();
        const groups = await loadStudents();
        const allStudents = groups.flatMap(g => g.students.map(s => ({ ...s, className: g.group })));
        const targets = allStudents.filter(s => {
          if (action.studentName === "전체" || action.studentName === "전원") {
            return action.className ? s.className.includes(action.className) : true;
          }
          return s.name.includes(action.studentName) || (action.className && s.className.includes(action.className) && !action.studentName);
        });

        if (targets.length > 0) {
          for (const student of targets) {
            const prog = await loadProgress(student.id);
            let targetBook: ProgressBook | undefined =
              (action.bookTitle ? prog.books.find(b => b.title.includes(action.bookTitle!)) : undefined) ??
              prog.books[0];
            if (!targetBook) {
              targetBook = {
                id: crypto.randomUUID(),
                student_id: student.id,
                title: action.bookTitle?.trim() || "프린트 · 유인물",
                curriculum: action.bookTitle ? "수학" : "프린트",
                course: action.bookTitle || "개별·보충 프린트",
                units: [{ id: crypto.randomUUID(), group: "단원", name: action.scope || "단원 진도 학습" }],
                states: {},
                total_pages: 0,
                completed_page: 0,
                version: 0,
              };
            }
            if (typeof action.completedPage === "number" && action.completedPage >= 0) {
              const clamped = targetBook.total_pages
                ? Math.min(targetBook.total_pages, Math.round(action.completedPage))
                : Math.round(action.completedPage);
              targetBook = {
                ...targetBook,
                completed_page: clamped,
                states: syncUnitStatesFromPage(targetBook.units, targetBook.states, clamped),
              };
            }
            const latestEntry = prog.entries
              .filter(e => e.book_id === targetBook!.id && e.record_date === date)
              .pop();
            await saveProgress(targetBook, {
              id: latestEntry?.id ?? crypto.randomUUID(),
              book_id: targetBook.id,
              record_date: date,
              unit_ids: targetBook.units.filter(u => targetBook!.states[u.id] === "진행 중").map(u => u.id),
              scope: action.scope !== undefined ? action.scope : (latestEntry?.scope ?? ""),
              homework: action.homework !== undefined ? action.homework : (latestEntry?.homework ?? ""),
              due_date: latestEntry?.due_date ?? null,
              memo: action.memo !== undefined ? action.memo : (latestEntry?.memo ?? ""),
              states: targetBook.states,
              completed_page: targetBook.completed_page,
              created_at: new Date().toISOString(),
            });
          }
          window.dispatchEvent(new Event("cosmath-records-changed"));
          summaries.push(`${date} 기준 ${targets.map(t => t.name).join(", ")} 학생 진도·과제 기록 반영 완료`);
        }
      } else if (action.type === "add_handoff" && action.title && action.content) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(action.date || "") ? action.date! : kstToday();
        await addHandoff({
          id: crypto.randomUUID(),
          handoff_date: date,
          author: action.author || "AI 코파일럿",
          title: action.title.slice(0, 200),
          content: action.content.slice(0, 5000),
          created_at: new Date().toISOString(),
        });
        window.dispatchEvent(new CustomEvent("cosmath-ai-handoff-added"));
        summaries.push(`인수인계 메모 '${action.title}' 등록 완료`);
      } else if (action.type === "upsert_staff" && action.name) {
        addOrUpdateAcademyStaffMember({
          name: action.name,
          role: action.role,
          assignedClasses: action.assignedClasses,
          duties: action.duties,
        });
        summaries.push(`학원 구성원 '${action.name} (${action.role || "선생님"})' 등록/수정 완료`);
      } else if (action.type === "delete_staff" && action.name) {
        removeAcademyStaffMember(action.name);
        summaries.push(`학원 구성원 '${action.name}' 삭제 완료`);
      } else if (action.type === "typing_update_problems" && Array.isArray(action.problems)) {
        const enriched = await Promise.all(
          action.problems.map(async p => {
            if (!p.figure && p.geoSpec) {
              try {
                const png = await renderMathGeoPngDataUrl(p.geoSpec);
                return { ...p, figure: png };
              } catch {
                return p;
              }
            }
            return p;
          })
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cosmath-ai-typing-action", { detail: { ...action, problems: enriched } }));
        }
        summaries.push(`시험지 타이핑 문항 ${enriched.length}건 AI 편집 및 그래프 작도 적용`);
      } else if (action.type === "generate_problems" && Array.isArray(action.problems)) {
        const enriched = await Promise.all(
          action.problems.map(async (p, idx) => {
            let figure = p.figure;
            if (!figure && p.geoSpec) {
              try {
                figure = await renderMathGeoPngDataUrl(p.geoSpec);
              } catch {
                // Ignore render error
              }
            }
            return {
              title: p.title || `AI 제작 문항 #${idx + 1}`,
              grade: Number(p.grade || 1),
              subject: p.subject || "공통수학",
              unit: p.unit || "함수와 방정식",
              points: p.points,
              intent: p.intent,
              difficulty: p.difficulty || "중",
              sourceLabel: p.sourceLabel || "AI 변형·신규 출제",
              sourceTokenId: p.sourceTokenId,
              sourceOrigin: p.sourceOrigin,
              question: p.question,
              boxContent: p.boxContent || "",
              choices: Array.isArray(p.choices) ? p.choices : [],
              answer: p.answer || "",
              solution: p.solution || "",
              figure,
              geoSpec: p.geoSpec,
            };
          })
        );
        const saved = await saveGeneratedProblems(enriched);
        if (outCreatedProblems) {
          outCreatedProblems.push(...saved);
        }
        summaries.push(`새 수학 문항 ${saved.length}건(알지오매스/지오지브라형 그래프 포함)을 제작하여 보관함에 저장했습니다`);
      } else if (action.type === "update_report_template" && action.template) {
        const rawBlocks = Array.isArray(action.template.blocks) && action.template.blocks.length > 0
          ? action.template.blocks
          : [
              { kind: "grades" as Kind, view: "chart" as const, wide: true, emphasis: true },
              { kind: "progress" as Kind, view: "chart" as const, wide: true, emphasis: false },
              { kind: "attendance" as Kind, view: "card" as const, wide: false, emphasis: false },
              { kind: "homework" as Kind, view: "card" as const, wide: false, emphasis: false },
              { kind: "wrong" as Kind, view: "table" as const, wide: true, emphasis: true },
              { kind: "feedback" as Kind, view: "chart" as const, wide: true, emphasis: true },
            ];
        const built: Template = {
          id: crypto.randomUUID(),
          name: (action.template.name || "AI 맞춤 템플릿").trim().slice(0, 40) || "AI 맞춤 템플릿",
          orientation: action.template.orientation === "landscape" ? "landscape" : "portrait",
          theme: action.template.theme || "unidesk",
          period: action.template.period || "month",
          illustrations: action.template.illustrations ?? true,
          blocks: rawBlocks.slice(0, 12).map(b => ({
            id: crypto.randomUUID(),
            kind: b.kind,
            view: b.view,
            wide: Boolean(b.wide),
            emphasis: Boolean(b.emphasis),
          })),
        };
        saveAiReportTemplate(built);
        saveActiveAiReportTemplate(built);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cosmath-ai-template-updated", { detail: built }));
        }
        summaries.push(`보고서 템플릿 '${built.name}' (${built.blocks.length}개 블록) 생성 및 보관함 저장 완료`);
      } else if (action.type === "update_geo_spec" && action.geoSpec) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cosmath-ai-geospec-updated", { detail: action.geoSpec }));
        }
        summaries.push(`AI 도형 작도('${action.geoSpec.title || "맞춤 수학 도형"}') 적용 완료`);
      } else if (action.type === "update_exam_style" && action.style) {
        const merged = saveAiExamStyle(action.style, Boolean(action.reset));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cosmath-ai-exam-style-updated", { detail: merged }));
        }
        summaries.push(`시험지 스타일(${merged.columns || 2}단 · ${merged.headerStyle || "맞춤"} 레이아웃) 실시간 변경 완료`);
      }
    } catch (e) {
      summaries.push(`작업 중 일부 오류: ${e instanceof Error ? e.message : "처리 실패"}`);
    }
  }

  return summaries;
}

export async function sendAiCopilotMessage(params: {
  prompt: string;
  mode?: "general" | "typing" | "problem_studio" | "report_template" | "report_feedback" | "geometry";
  pathname?: string;
  contextData?: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
  imageBase64?: string;
  imageMimeType?: string;
  useWebSearch?: boolean;
}): Promise<AiCopilotResponse> {
  const units = params.mode === "problem_studio" || params.mode === "report_template" ? 3 : 1;

  // Gather rich student/class/daily/progress snapshot so AI has full read & edit knowledge of student management
  let rosterSummary: Array<{
    group: string;
    students: Array<{
      id: string;
      name: string;
      grade: string;
      attendance?: string;
      homework?: string | null;
      wrongSummary?: string;
      examsSummary?: string;
      bookTitle?: string;
      progressPct?: number;
      latestScope?: string;
      latestHomework?: string;
    }>;
  }> = [];
  try {
    const today = kstToday();
    const month = today.slice(0, 7);
    const [groups, dailyRows, wrongRows] = await Promise.all([
      loadStudents(),
      loadStudentDaily(month).catch(() => []),
      loadWrongAnswers(month).catch(() => []),
    ]);
    const allStudents = groups.flatMap(g => g.students);
    const progressEntries = await Promise.all(
      allStudents.slice(0, 60).map(s =>
        loadProgress(s.id)
          .then(p => [s.id, p] as const)
          .catch(() => [s.id, null] as const)
      )
    );
    const progressMap = new Map(progressEntries);

    rosterSummary = groups.map(g => ({
      group: g.group,
      students: g.students.map(s => {
        const todayDaily = dailyRows.find(d => d.student_id === s.id && d.record_date === today);
        const todayWrong = wrongRows.find(w => w.student_id === s.id && w.record_date === today);
        const prog = progressMap.get(s.id);
        const mainBook = prog?.books?.[0];
        const latestEntry = prog?.entries?.[prog.entries.length - 1];
        return {
          id: s.id,
          name: s.name,
          grade: s.grade,
          attendance: todayDaily?.attendance || "",
          homework: todayWrong?.homework_status ?? null,
          wrongSummary: todayWrong
            ? todayWrong.completed
              ? "오답완료"
              : todayWrong.total_wrong > 0
                ? `${todayWrong.corrected_count}/${todayWrong.total_wrong}문항`
                : ""
            : "",
          examsSummary:
            todayDaily?.exams?.length
              ? todayDaily.exams.map(e => `${e.name}:${e.score}/${e.max_score}`).join(", ")
              : "",
          bookTitle: mainBook?.title || "",
          progressPct: mainBook ? unitProgressPercent(mainBook) : undefined,
          latestScope: latestEntry?.scope || "",
          latestHomework: latestEntry?.homework || "",
        };
      }),
    }));
  } catch {
    // Ignore if unavailable
  }

  let token = "";
  if (!usesLocalStorage()) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? "";
    } catch {
      // Ignore
    }
  }

  let personaCfg = loadAiPersonaConfig();
  let staffDirectory: AcademyStaffMember[] = loadAcademyStaff();
  if (!usesLocalStorage()) {
    try {
      const [remotePersona, remoteStaff] = await Promise.all([
        fetchAiPersonaFromDb().catch(() => personaCfg),
        staffDirectory.length === 0 ? fetchAcademyStaffFromDb().catch(() => staffDirectory) : Promise.resolve(staffDirectory),
      ]);
      personaCfg = remotePersona;
      staffDirectory = remoteStaff;
    } catch {
      // Use local cache
    }
  }
  const resolvedPersona = resolveActivePersonaPrompt(personaCfg);

  const res = await fetch("/api/ai/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt: params.prompt,
      mode: params.mode ?? "general",
      pathname: params.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
      roster: rosterSummary,
      staff: staffDirectory,
      contextData: {
        personaId: resolvedPersona.preset.id,
        personaName: resolvedPersona.preset.name,
        personaPrompt: resolvedPersona.effectivePrompt,
        ...(params.contextData ?? {}),
      },
      history: params.history ?? [],
      imageBase64: params.imageBase64,
      imageMimeType: params.imageMimeType,
      useWebSearch: params.useWebSearch,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `AI 요청을 처리하지 못했습니다 (${res.status}).`);
  }

  let quota: AiQuotaSnapshot | undefined = data?.quota;
  if (usesLocalStorage() || !quota) {
    quota = consumeLocalQuota(units);
  } else {
    notifyQuotaUpdated(quota);
  }

  const actions: AiCopilotAction[] = Array.isArray(data?.actions) ? data.actions : [];
  const createdProblems: GeneratedMathProblem[] = [];
  const appliedSummary = await executeCopilotActions(actions, createdProblems);
  const feedbackAction = actions.find(a => a.type === "generate_report_feedbacks") as
    | Extract<AiCopilotAction, { type: "generate_report_feedbacks" }>
    | undefined;
  const geoAction = actions.find(a => a.type === "update_geo_spec") as
    | Extract<AiCopilotAction, { type: "update_geo_spec" }>
    | undefined;
  const styleAction = actions.find(a => a.type === "update_exam_style") as
    | Extract<AiCopilotAction, { type: "update_exam_style" }>
    | undefined;
  const probGeo = createdProblems.find(p => p.geoSpec)?.geoSpec;

  return {
    reply: String(data?.reply || "요청하신 작업을 처리했습니다."),
    actions,
    appliedSummary,
    createdProblems,
    reportFeedbacks: feedbackAction?.feedbacks,
    updatedGeoSpec: geoAction?.geoSpec ?? probGeo,
    updatedExamStyle: styleAction ? loadAiExamStyle() : undefined,
    modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
    webSearchSources: Array.isArray(data?.webSearchSources) ? data.webSearchSources : undefined,
    quota,
  };
}
