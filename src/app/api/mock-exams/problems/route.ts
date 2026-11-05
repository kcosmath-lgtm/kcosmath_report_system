import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function GET() {
  try {
    const filePath = resolve(process.cwd(), "src/data/mock-exam-problems.json");
    if (!existsSync(filePath)) {
      return NextResponse.json({ problems: [], extractedExams: {} });
    }
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    const problems = Array.isArray(raw.problems)
      ? raw.problems.map((p: Record<string, unknown>) => ({
          id: String(p.id || ""),
          title: String(p.title || p.sourceLabel || "모의고사 기출 문항"),
          grade: Number(p.grade || 1),
          subject: String(p.subject || "수학"),
          unit: String(p.unit || "모의고사 기출"),
          difficulty: ["하", "중", "상", "킬러"].includes(String(p.difficulty))
            ? p.difficulty
            : "중",
          sourceLabel: String(p.sourceLabel || p.examTitle || "모의고사 기출"),
          question: String(p.question || ""),
          boxContent: String(p.boxContent || ""),
          choices: Array.isArray(p.choices) ? p.choices.map(String) : [],
          answer: String(p.answer || ""),
          solution: String(p.solution || ""),
          figure: p.figureUrl ? String(p.figureUrl) : undefined,
          createdAt: String(p.createdAt || new Date().toISOString()),
        }))
      : [];

    return NextResponse.json({
      problems,
      extractedExams: raw.extractedExams || {},
    });
  } catch {
    return NextResponse.json({ problems: [], extractedExams: {} });
  }
}
