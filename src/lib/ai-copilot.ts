"use client";

import { supabase } from "./supabase";
import {
  usesLocalStorage,
  loadStudents,
  addClass,
  addStudent,
  loadStudentDaily,
  saveStudentDaily,
  loadWrongAnswers,
  addHandoff,
} from "./report-storage";
import { consumeLocalQuota, notifyQuotaUpdated, type AiQuotaSnapshot } from "./ai-quota-client";
import { renderMathGeoPngDataUrl, type MathGeoSpec } from "./math-geometry-engine";
import { isTemplate, type Template, type Block, type Kind, type Period, type Theme } from "../app/report/new/templates";
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

export type AiCopilotAction =
  | {
      type: "add_class";
      name: string;
    }
  | {
      type: "add_student";
      className: string;
      name: string;
      grade: string;
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
      examName?: string;
      examScore?: number;
      examMaxScore?: number;
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
      type: "typing_update_problems";
      mode: "append" | "replace_all" | "update_by_number";
      title?: string;
      problems: Array<{
        number: string;
        points?: string;
        question: string;
        boxContent?: string;
        choices?: string[];
        figure?: string;
        geoSpec?: MathGeoSpec;
      }>;
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
  quota?: AiQuotaSnapshot;
}

const LOCAL_PROBLEMS_KEY = "cosmath:generated-problems:v1";
let generatedProblemsTableMissing = false;

export async function loadGeneratedProblems(): Promise<GeneratedMathProblem[]> {
  if (!usesLocalStorage() && !generatedProblemsTableMissing) {
    try {
      const { data, error } = await supabase
        .from("cosmath_generated_problems")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        generatedProblemsTableMissing = true;
      } else if (Array.isArray(data)) {
        return data.map(row => ({
          id: String(row.id),
          title: String(row.title || "AI 생성 문항"),
          grade: Number(row.grade || 1),
          subject: String(row.subject || "공통수학"),
          unit: String(row.unit || ""),
          difficulty: (["하", "중", "상", "킬러"].includes(row.difficulty) ? row.difficulty : "중") as GeneratedMathProblem["difficulty"],
          sourceLabel: String(row.source_label || "AI 출제"),
          question: String(row.question || ""),
          boxContent: String(row.box_content || ""),
          choices: Array.isArray(row.choices) ? row.choices.map(String) : [],
          answer: String(row.answer || ""),
          solution: String(row.solution || ""),
          createdAt: String(row.created_at || new Date().toISOString()),
        }));
      }
    } catch {
      // Fallback to localStorage
    }
  }
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

export async function saveGeneratedProblems(items: Omit<GeneratedMathProblem, "id" | "createdAt">[]): Promise<GeneratedMathProblem[]> {
  const now = new Date().toISOString();
  const created: GeneratedMathProblem[] = items.map(item => ({
    ...item,
    id: crypto.randomUUID(),
    createdAt: now,
  }));

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

  try {
    const existing = await loadGeneratedProblems();
    const merged = [...created, ...existing.filter(e => !created.some(c => c.id === e.id))].slice(0, 200);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_PROBLEMS_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("cosmath-ai-problems-generated", { detail: created }));
    }
  } catch {
    // Ignore
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

export async function executeCopilotActions(actions: AiCopilotAction[]): Promise<string[]> {
  const summaries: string[] = [];
  if (!actions?.length) return summaries;

  for (const action of actions) {
    try {
      if (action.type === "add_class" && action.name) {
        const groups = await loadStudents();
        const exists = groups.find(g => g.group.trim() === action.name.trim());
        if (!exists) {
          await addClass(action.name.trim());
          summaries.push(`새 반 '${action.name.trim()}' 생성 완료`);
        } else {
          summaries.push(`'${action.name.trim()}' 반이 이미 존재합니다`);
        }
      } else if (action.type === "add_student" && action.name) {
        const groups = await loadStudents();
        let targetGroup = groups.find(g => g.group.includes(action.className || "")) ?? groups[0];
        if (!targetGroup) {
          targetGroup = await addClass(action.className || "기본반");
        }
        await addStudent(targetGroup.id, action.name.trim(), action.grade || "고1");
        summaries.push(`'${targetGroup.group}'에 학생 '${action.name.trim()}' (${action.grade || "고1"}) 등록 완료`);
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
              typeof action.correctedCount === "number"
                ? Math.min(totalWrong, action.correctedCount)
                : Math.min(totalWrong, existingWrong?.corrected_count ?? 0);

            return {
              daily: {
                id: existingDaily?.id ?? crypto.randomUUID(),
                student_id: student.id,
                record_date: date,
                attendance: action.attendance ?? existingDaily?.attendance ?? "출석",
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
                homework_status: action.homework ?? existingWrong?.homework_status ?? "O",
                completed: totalWrong > 0 && correctedCount >= totalWrong,
                memo: action.memo ?? existingWrong?.memo ?? "",
                version: existingWrong?.version ?? 0,
              },
            };
          });
          await saveStudentDaily(saves);
          window.dispatchEvent(new Event("cosmath-roster-changed"));
          summaries.push(`${date} 기준 ${targets.map(t => t.name).join(", ")} 학생 일일 출결·숙제·성적 반영 완료`);
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
      }
    } catch (e) {
      summaries.push(`작업 중 일부 오류: ${e instanceof Error ? e.message : "처리 실패"}`);
    }
  }

  return summaries;
}

export async function sendAiCopilotMessage(params: {
  prompt: string;
  mode?: "general" | "typing" | "problem_studio" | "report_template";
  pathname?: string;
  contextData?: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<AiCopilotResponse> {
  const units = params.mode === "problem_studio" || params.mode === "report_template" ? 3 : 1;

  // Gather lightweight student/class context so AI knows exact student names
  let rosterSummary: Array<{ group: string; students: Array<{ name: string; grade: string }> }> = [];
  try {
    const groups = await loadStudents();
    rosterSummary = groups.map(g => ({
      group: g.group,
      students: g.students.map(s => ({ name: s.name, grade: s.grade })),
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
      contextData: params.contextData ?? {},
      history: params.history ?? [],
      imageBase64: params.imageBase64,
      imageMimeType: params.imageMimeType,
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
  const appliedSummary = await executeCopilotActions(actions);

  return {
    reply: String(data?.reply || "요청하신 작업을 처리했습니다."),
    actions,
    appliedSummary,
    quota,
  };
}
