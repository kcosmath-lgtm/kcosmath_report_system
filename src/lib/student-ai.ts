export const studentActionTypes = ["add_class", "add_student", "archive_student"] as const;
export type StudentAction =
  | { type: "add_class"; className: string }
  | { type: "add_student"; classId: string; name: string; grade: string }
  | { type: "archive_student"; studentId: string; expectedVersion: number };

export function parseStudentAiReply(value: unknown): { reply: string; actions: StudentAction[] } {
  if (!value || typeof value !== "object") throw new Error("AI 응답 형식이 올바르지 않습니다.");
  const { reply, actions } = value as Record<string, unknown>;
  if (typeof reply !== "string" || !reply.trim() || reply.length > 12000 || !Array.isArray(actions) || actions.length > 5) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  for (const action of actions as Array<Record<string, unknown>>) {
    if (!action || !studentActionTypes.includes(action.type as typeof studentActionTypes[number])) throw new Error("허용되지 않은 학생 관리 작업입니다.");
    if (action.type === "add_class" && (typeof action.className !== "string" || !action.className.trim() || action.className.length > 100)) throw new Error("반 추가 정보가 올바르지 않습니다.");
    if (action.type === "add_student" && (typeof action.classId !== "string" || !action.classId || typeof action.name !== "string" || !action.name.trim() || action.name.length > 100 || typeof action.grade !== "string" || !action.grade.trim() || action.grade.length > 30)) throw new Error("학생 추가 정보가 올바르지 않습니다.");
    if (action.type === "archive_student" && (typeof action.studentId !== "string" || !action.studentId || !Number.isInteger(action.expectedVersion) || Number(action.expectedVersion) < 1)) throw new Error("퇴원 처리 정보가 올바르지 않습니다.");
  }
  return { reply, actions: actions as StudentAction[] };
}
