"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import styles from "./TypingPreviewEditor.module.css";
import type { FigureDiagram } from "../lib/typing-diagram";

export default function TypingPreviewEditor({ label, value, image = false, required = false, onSave, onClose, onAi, onApplyImage }: {
  label: string; value: string; image?: boolean; required?: boolean;
  onSave: (value: string) => void; onClose: () => void;
  onAi?: () => Promise<{ image: string; diagram: FigureDiagram }>;
  onApplyImage?: (result: { image: string; diagram: FigureDiagram }) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [candidate, setCandidate] = useState<{ image: string; diagram: FigureDiagram } | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={styles.dialog} onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} aria-label={`미리보기 ${label} 편집`}>
    <form onSubmit={e => { e.preventDefault(); if (!required || text.trim()) onSave(text); }}>
      <h2>{label}</h2>
      {image ? <img className={styles.image} src={value} alt="선택한 그림"/> : <><p>글자와 수식을 수정하거나 지울 수 있습니다. 수식은 $…$로 입력하세요.</p><textarea autoFocus aria-label="미리보기 편집 내용" required={required} maxLength={20000} rows={7} value={text} onChange={e => setText(e.target.value)}/></>}
      {image && onAi && <><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); setCandidate(null); try { setCandidate(await onAi()); } catch (e) { setError(e instanceof Error ? e.message : "AI 출력에 실패했습니다."); } finally { setBusy(false); } }}>{busy ? "AI 출력 중…" : "AI로 출력하기"}</button><p>추가 토큰 비용이 발생합니다. 결과의 숫자·각도·눈금을 원본과 비교한 뒤 적용하세요.</p></>}
      {error && <p role="alert">{error}</p>}
      {candidate && <><h3>AI 출력 결과</h3><img className={styles.image} src={candidate.image} alt="미리보기 AI 출력 결과"/><div className={styles.actions}><button type="button" onClick={() => onApplyImage?.(candidate)}>AI 출력 적용</button><button type="button" onClick={() => setCandidate(null)}>원본 유지</button></div></>}
      <div className={styles.actions}>{image ? <button type="button" disabled={busy} className={styles.danger} onClick={() => onSave("")}>이미지 삭제</button> : <button type="submit">적용</button>}<button type="button" disabled={busy} onClick={onClose}>취소</button></div>
    </form>
  </dialog>;
}
