'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './student-progress.module.css';
export default function ProgressDialog({ title, children, onClose, locked = false }: { title: string; children: ReactNode; onClose: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ locked, onClose });
  useEffect(() => { handlers.current = { locked, onClose }; }, [locked,onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!handlers.current.locked) handlers.current.onClose(); }
      if (e.key === 'Tab') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return createPortal(<div className={styles.modalBackdrop}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={styles.modal}><header><h3>{title}</h3><button disabled={locked} onClick={onClose} aria-label={`${title} 닫기`}>닫기</button></header>{children}</div></div>, document.body);
}
