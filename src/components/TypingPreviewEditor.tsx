"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import styles from "./TypingPreviewEditor.module.css";

export default function TypingPreviewEditor({ label, value, image = false, required = false, onSave, onClose }: {
  label: string; value: string; image?: boolean; required?: boolean;
  onSave: (value: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={styles.dialog} onCancel={onClose} aria-label={`미리보기 ${label} 편집`}>
    <form onSubmit={e => { e.preventDefault(); if (!required || text.trim()) onSave(text); }}>
      <h2>{label}</h2>
      {image ? <img className={styles.image} src={value} alt="선택한 그림"/> : <><p>글자와 수식을 수정하거나 지울 수 있습니다. 수식은 $…$로 입력하세요.</p><textarea autoFocus aria-label="미리보기 편집 내용" required={required} maxLength={20000} rows={7} value={text} onChange={e => setText(e.target.value)}/></>}
      <div className={styles.actions}>{image ? <button type="button" className={styles.danger} onClick={() => onSave("")}>이미지 삭제</button> : <button type="submit">적용</button>}<button type="button" onClick={onClose}>취소</button></div>
    </form>
  </dialog>;
}
