"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Undo2, Paperclip, FileText } from "lucide-react";
import type { ReportData } from "../types/report";
import { attachmentLimits, parseAiReply, supportedAttachmentTypes, type AiPatch, type ChatAttachment, type ChatMessage } from "../lib/report-ai";
import styles from "./report-chat.module.css";
import AiLauncher from "./AiLauncher";

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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ expected: ReportData; patch: AiPatch } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ report, disabled, allowEdit, onApply });
  const end = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { latest.current = { report, disabled, allowEdit, onApply }; });
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);

  function close() { setOpen(false); trigger.current?.focus(); }
  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files];
    let validationError = "";
    let total = next.reduce((sum, file) => sum + file.size, 0);
    for (const file of Array.from(selected)) {
      if (next.length >= attachmentLimits.count) { validationError = `파일은 최대 ${attachmentLimits.count}개까지 첨부할 수 있습니다.`; break; }
      if (!supportedAttachmentTypes.includes(file.type as typeof supportedAttachmentTypes[number])) { validationError = `${file.name}: 지원하지 않는 파일 형식입니다.`; continue; }
      if (total + file.size > attachmentLimits.totalBytes) { validationError = "첨부파일 전체 용량은 3MB 이하여야 합니다."; continue; }
      next.push(file); total += file.size;
    }
    setFiles(next);
    setError(validationError);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function encodeFiles(): Promise<ChatAttachment[]> {
    return Promise.all(files.map(file => new Promise<ChatAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        data: String(reader.result).split(",", 2)[1] || "",
      });
      reader.readAsDataURL(file);
    })));
  }
  async function send() {
    if ((!input.trim() && !files.length) || busy || disabled || !password) return;
    const question = input.trim() || "첨부파일의 내용을 분석해 주세요.";
    const history: ChatMessage[] = [...messages, { role: "user", text: question }];
    const snapshot = { ...report };
    const permitted = allowEdit;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setNotice(""); setMessages(history); setInput("");
    try {
      const response = await fetch("/api/report-chat", {
        method: "POST", headers: { "Content-Type": "application/json", "x-ai-password": encodeURIComponent(password) },
        body: JSON.stringify({ messages: history.slice(-19), report: snapshot, allowEdit: permitted, attachments: await encodeFiles() }), signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 요청에 실패했습니다.");
      const result = parseAiReply(data);
      if (abort.signal.aborted) return;
      setFiles([]);
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
    <AiLauncher ref={trigger} open={open} onClick={() => setOpen(!open)} controls="report-ai-chat" offset />
    {open && <section id="report-ai-chat" className={styles.panel} aria-label="AI 보고서 도우미" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <header className={styles.header}><div><strong>COSMATH AI</strong><small>보고서 편집 · {report.name}</small></div><button onClick={close} aria-label="채팅 닫기"><X size={20} /></button></header>
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
        {!!files.length && <div className={styles.attachments}>{files.map((file, index) => <span key={`${file.name}-${index}`}><FileText size={13} />{file.name}<button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`${file.name} 첨부 취소`}><X size={12} /></button></span>)}</div>}
        <input ref={fileInput} className={styles.fileInput} type="file" multiple accept={supportedAttachmentTypes.join(",")} onChange={e => addFiles(e.target.files)} />
        <button className={styles.attachButton} type="button" disabled={busy || files.length >= attachmentLimits.count} onClick={() => fileInput.current?.click()} aria-label="파일 첨부" title="이미지, PDF, 텍스트, CSV, JSON 첨부"><Paperclip size={18} /></button>
        <textarea autoFocus aria-label="AI에게 요청할 내용" placeholder="보고서 작성 요청을 입력하세요" value={input} maxLength={4000} disabled={busy || disabled} onChange={e => setInput(e.target.value)} onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
        }} />
        <button type="submit" disabled={(!input.trim() && !files.length) || !password || busy || disabled} aria-label="메시지 전송"><Send size={18} /></button>
      </form>
    </section>}
  </>;
}
