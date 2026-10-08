"use client";
import katex from "katex";
import { splitMath } from "../lib/typing-model";
export default function TypingMath({ text }: { text: string }) {
  return <>{splitMath(text).map((part, i) => {
    if (!part.math) return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part.value}</span>;
    try {
      return <span key={i} style={part.display ? { display: "block", textAlign: "center", margin: "12px 0" } : undefined} dangerouslySetInnerHTML={{ __html: katex.renderToString(part.value, { displayMode: part.display, throwOnError: true, trust: false, strict: "ignore" }) }} />;
    } catch { return <mark key={i} title="수식 문법을 확인해 주세요">{part.value}</mark>; }
  })}</>;
}
