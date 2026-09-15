"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Undo2 } from "lucide-react";
import type { ReportData } from "../types/report";
import { parseAiReply, type AiPatch, type ChatMessage } from "../lib/report-ai";
import styles from "./report-chat.module.css";

type Props = {
  studentId: string;
  report: ReportData;
  disabled: boolean;
  onApply: (studentId: string, expected: ReportData, patch: AiPatch) => boolean;
};

export default function ReportChat({ studentId, report, disabled, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ expected: ReportData; patch: AiPatch } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ report, disabled, allowEdit, onApply });
  const end = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { latest.current = { report, disabled, allowEdit, onApply }; });
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);

  function close() { setOpen(false); trigger.current?.focus(); }
  async function send() {
    if (!input.trim() || busy || disabled || !password) return;
    const question = input.trim();
    const history: ChatMessage[] = [...messages, { role: "user", text: question }];
    const snapshot = { ...report };
    const permitted = allowEdit;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setNotice(""); setMessages(history); setInput("");
    try {
      const response = await fetch("/api/report-chat", {
        method: "POST", headers: { "Content-Type": "application/json", "x-ai-password": encodeURIComponent(password) },
        body: JSON.stringify({ messages: history.slice(-19), report: snapshot, allowEdit: permitted }), signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 요청에 실패했습니다.");
      const result = parseAiReply(data);
      if (abort.signal.aborted) return;
      setMessages([...history, { role: "assistant", text: result.reply }]);
      if (Object.keys(result.patch).length) {
        const current = latest.current;
        if (permitted && current.allowEdit && !current.disabled && current.onApply(studentId, snapshot, result.patch)) {
          const inverse = Object.fromEntries(Object.keys(result.patch).map(key => [key, snapshot[key as keyof ReportData]])) as AiPatch;
          setUndo({ expected: { ...snapshot, ...result.patch }, patch: inverse });
          setNotice("현재 학생의 보고서에 반영했습니다. 내용을 확인한 뒤 상단의 보고서 저장을 눌러 주세요.");
        } else setNotice("보고서 또는 편집 권한이 바뀌어 수정을 적용하지 않았습니다. 다시 요청해 주세요.");
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "AI 요청에 실패했습니다.");
        setMessages(messages); setInput(question);
      }
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }

  return <>
    <button ref={trigger} className={styles.launcher} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="report-ai-chat" aria-label="AI 보고서 도우미 열기"><MessageCircle size={23} /></button>
    {open && <section id="report-ai-chat" className={styles.panel} aria-label="AI 보고서 도우미" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header className={styles.header}><div><strong>AI 보고서 도우미</strong><small>{report.name} · 현재 보고서</small></div><button onClick={close} aria-label="채팅 닫기"><X size={20} /></button></header>
      <div className={styles.settings}>
        <label><input type="checkbox" checked={allowEdit} onChange={e => { latest.current.allowEdit = e.target.checked; setAllowEdit(e.target.checked); }} /> AI의 현재 보고서 수정 허용</label>
        <small>과목·교재·진도·과제·전달사항을 수정할 수 있어요. 일괄 편집 모드에서도 현재 학생에게만 적용돼요.</small>
        <label className={styles.password}>AI 이용 암호<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="관리자가 설정한 암호" autoComplete="off" /></label>
      </div>
      <div className={styles.messages} role="log" aria-live="polite" aria-busy={busy}>
        {!messages.length && <div className={styles.empty}><MessageCircle size={30} /><p>어떤 작성을 도와드릴까요?</p><small>예: “현재 진도를 바탕으로 전달사항을 다듬어 줘.”<br />전송하면 보고서의 학년·학습 내용과 대화가 Gemini에 전달됩니다. 대화는 이 화면에서만 유지됩니다.</small></div>}
        {messages.map((message, i) => <div key={i} className={message.role === "user" ? styles.user : styles.assistant}><small>{message.role === "user" ? "나" : "Gemini"}</small>{message.text}</div>)}
        {busy && <p className={styles.loading}><Loader2 size={16} className="animate-spin" /> 작성 중…</p>}
        <div ref={end} />
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.tools}>
        <button disabled={!undo || disabled || busy} onClick={() => {
          if (undo && onApply(studentId, undo.expected, undo.patch)) { setUndo(null); setNotice("AI 수정 전으로 되돌렸습니다. 보고서 저장을 눌러 주세요."); }
          else setNotice("이후 보고서가 수정되어 되돌릴 수 없습니다. 내용을 직접 확인해 주세요.");
        }}><Undo2 size={14} /> 수정 되돌리기</button>
        <button disabled={busy} onClick={() => { setMessages([]); setError(""); setNotice(""); }}>새 대화</button>
      </div>
      <form className={styles.composer} onSubmit={e => { e.preventDefault(); void send(); }}>
        <textarea autoFocus aria-label="AI에게 요청할 내용" placeholder="보고서 작성 요청을 입력하세요" value={input} maxLength={4000} disabled={busy || disabled} onChange={e => setInput(e.target.value)} onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
        }} />
        <button type="submit" disabled={!input.trim() || !password || busy || disabled} aria-label="메시지 전송"><Send size={18} /></button>
      </form>
    </section>}
  </>;
}
