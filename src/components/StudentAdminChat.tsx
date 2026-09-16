"use client";

import { useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { addClass, addStudent, archiveStudent } from "../lib/report-storage";
import { parseStudentAiReply } from "../lib/student-ai";
import type { StudentGroup } from "../types/student";
import styles from "./report-chat.module.css";
import AiLauncher from "./AiLauncher";

type Message = { role: "user" | "assistant"; text: string };
type Props = { groups: StudentGroup[]; disabled: boolean; onChanged: () => Promise<void> };

export default function StudentAdminChat({ groups, disabled, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);

  async function send() {
    if (!input.trim() || !password || busy || disabled) return;
    const question = input.trim();
    const history: Message[] = [...messages, { role: "user", text: question }];
    const snapshot = structuredClone(groups);
    const permitted = allowEdit;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice(""); setMessages(history); setInput("");
    try {
      const response = await fetch("/api/student-chat", { method: "POST", headers: { "Content-Type": "application/json", "x-ai-password": encodeURIComponent(password) }, body: JSON.stringify({ messages: history.slice(-19), groups: snapshot, allowEdit: permitted }), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 요청에 실패했습니다.");
      const result = parseStudentAiReply(data);
      setMessages([...history, { role: "assistant", text: result.reply }]);
      if (permitted && result.actions.length) {
        for (const action of result.actions) {
          if (action.type === "add_class") await addClass(action.className);
          if (action.type === "add_student") {
            if (!snapshot.some(group => group.id === action.classId)) throw new Error("AI가 선택한 반이 더 이상 존재하지 않습니다. 목록을 새로고침하고 다시 요청해 주세요.");
            await addStudent(action.classId, action.name, action.grade);
          }
          if (action.type === "archive_student") {
            const student = snapshot.flatMap(group => group.students).find(item => item.id === action.studentId && item.version === action.expectedVersion);
            if (!student) throw new Error("해당 학생 정보가 변경되었습니다. 목록을 새로고침하고 다시 요청해 주세요.");
            if (!window.confirm(`[${student.name}] 학생을 AI 요청대로 퇴원 처리할까요?\n기존 보고서는 보존됩니다.`)) { setNotice("퇴원 처리를 취소했습니다."); continue; }
            await archiveStudent(student.id, student.version);
          }
        }
        await onChanged();
        setNotice("AI 변경사항을 학생 목록에 반영했습니다.");
      }
    } catch (e) {
      if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "AI 요청에 실패했습니다."); setInput(question); }
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }

  return <>
    <AiLauncher open={open} onClick={() => setOpen(value => !value)} offset />
    {open && <section className={styles.panel} aria-label="AI 학생 관리 도우미">
      <header className={styles.header}><div><strong>COSMATH AI</strong><small>학생 관리 · 현재 반과 재원생</small></div><button onClick={() => setOpen(false)} aria-label="채팅 닫기"><X size={20} /></button></header>
      <div className={styles.settings}>
        <label><input type="checkbox" checked={allowEdit} onChange={event => setAllowEdit(event.target.checked)} /> AI의 학생 목록 편집 허용</label>
        <small>반 추가, 학생 등록, 퇴원 처리를 요청할 수 있습니다. 퇴원 기록은 삭제되지 않습니다.</small>
        <label className={styles.password}>AI 이용 암호<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="관리자가 설정한 암호" autoComplete="off" /></label>
      </div>
      <div className={styles.messages} role="log" aria-live="polite">
        {!messages.length && <div className={styles.empty}><Bot size={30} /><p>학생 관리를 요청해 보세요.</p><small>“중등 A반에 김코스 중2 학생을 추가해 줘”처럼 말할 수 있습니다.</small></div>}
        {messages.map((message, index) => <div key={index} className={message.role === "user" ? styles.user : styles.assistant}><small>{message.role === "user" ? "나" : "Gemini"}</small>{message.text}</div>)}
        {busy && <p className={styles.loading}><Loader2 size={16} className="animate-spin" /> 처리 중…</p>}
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.tools}><span /><button disabled={busy} onClick={() => { setMessages([]); setError(""); setNotice(""); }}>새 대화</button></div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}><textarea autoFocus value={input} onChange={event => setInput(event.target.value)} maxLength={4000} disabled={busy || disabled} placeholder="학생 관리 요청을 입력하세요" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><button type="submit" disabled={!input.trim() || !password || busy || disabled} aria-label="메시지 전송"><Send size={18} /></button></form>
    </section>}
  </>;
}
