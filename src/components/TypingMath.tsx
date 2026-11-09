"use client";
import { memo, useMemo } from "react";
import katex from "katex";
import { splitMath } from "../lib/typing-model";

function repairLatexExpr(raw: string): string {
  let m = String(raw || "").trim();
  if (!m) return "";
  m = m.replace(/\\sqrt\s*\^\s*\{?([234n])\}?\s*(\\[a-zA-Z]+\{[^}]+\}\{[^}]+\}|[0-9a-zA-Z]+)/g, "\\sqrt[$1]{$2}");
  m = m.replace(/\\frac\{\\sqrt\}\{([^}]+)\}\s*\^?\s*([0-9a-zA-Z]+)/g, "\\frac{\\sqrt{$2}}{$1}");
  m = m.replace(/\\sqrt(?!\s*[\[{])\s*([0-9a-zA-Z]+)/g, "\\sqrt{$1}");
  m = m.replace(/\\sqrt(?!\s*[\[{])/g, "");
  m = m.replace(/\\vec\s*([A-Za-z]{1,3})/g, "\\overrightarrow{$1}");
  m = m.replace(/\\vec(?![A-Za-z{])/g, "");
  return m;
}

const TypingMath = memo(function TypingMath({ text }: { text: string }) {
  const renderedParts = useMemo(() => {
    return splitMath(text).map((part, i) => {
      if (!part.math) return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part.value}</span>;
      const expr = repairLatexExpr(part.value);
      try {
        return (
          <span
            key={i}
            style={part.display ? { display: "block", textAlign: "center", margin: "12px 0" } : undefined}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(expr, {
                displayMode: part.display,
                throwOnError: true,
                trust: false,
                strict: "ignore",
              }),
            }}
          />
        );
      } catch {
        return <mark key={i} title="수식 문법을 확인해 주세요">{part.value}</mark>;
      }
    });
  }, [text]);

  return <>{renderedParts}</>;
});

export default TypingMath;
