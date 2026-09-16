"use client";

import { forwardRef } from "react";
import { Sparkles } from "lucide-react";
import styles from "./ai-launcher.module.css";

type Props = { open: boolean; onClick: () => void; offset?: boolean; controls?: string };

const AiLauncher = forwardRef<HTMLButtonElement, Props>(function AiLauncher({ open, onClick, offset = false, controls }, ref) {
  return <button ref={ref} className={`${styles.launcher} ${offset ? styles.offset : ""}`} onClick={onClick} aria-expanded={open} aria-controls={controls} aria-label={open ? "COSMATH AI 닫기" : "COSMATH AI 열기"} title="COSMATH AI"><Sparkles size={25} /></button>;
});
export default AiLauncher;
