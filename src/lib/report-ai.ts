import type { ReportData } from "../types/report";

export const aiFields = ["subject", "book", "progress", "hwLast", "hwCurrent", "notes"] as const;
export type AiField = typeof aiFields[number];
export type AiPatch = Partial<Pick<ReportData, AiField>>;
export type ChatMessage = { role: "user" | "assistant"; text: string };

export function parseAiReply(value: unknown): { reply: string; patch: AiPatch } {
  if (!value || typeof value !== "object") throw new Error("AI 응답 형식이 올바르지 않습니다.");
  const { reply, patch } = value as Record<string, unknown>;
  if (typeof reply !== "string" || !reply.trim() || reply.length > 12000 ||
      !patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  for (const [key, text] of Object.entries(patch)) {
    if (!aiFields.includes(key as AiField) || typeof text !== "string" || text.length > 6000) {
      throw new Error("AI가 허용되지 않은 수정을 반환했습니다.");
    }
  }
  return { reply, patch: patch as AiPatch };
}
