import { supabase } from "./supabase";
import { diagramPng, type FigureDiagram } from "./typing-diagram";
import type { ExamProblem } from "./typing-model";

export async function requestFigure(problem: ExamProblem): Promise<{ image: string; diagram: FigureDiagram }> {
  const original = problem.figure;
  if (!original) throw new Error("그림이 없습니다.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  const response = await fetch("/api/typing/clean-figure", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ image: original.split(",")[1], mimeType: original.slice(5, original.indexOf(";")), context: JSON.stringify({ question: problem.question, conditions: problem.boxContent, choices: problem.choices, tables: problem.tables, figureFor: problem.number }) }) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.diagram) throw new Error(result?.error ?? "그림 구조 추출에 실패했습니다.");
  return { image: await diagramPng(result.diagram), diagram: result.diagram };
}
