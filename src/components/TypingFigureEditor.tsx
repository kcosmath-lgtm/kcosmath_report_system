"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type PointerEvent } from "react";
import { cropFigure, imageData, readSource, type SourcePage } from "../lib/typing-upload";
import type { ExamProblem, FigureBox } from "../lib/typing-model";
import { sendAiCopilotMessage } from "../lib/ai-copilot";
import { inferMathGeoSpecFromProblem, renderMathGeoPngDataUrl, type MathGeoSpec } from "../lib/math-geometry-engine";
import styles from "./TypingFigureEditor.module.css";

export default function TypingFigureEditor({ problem, sources, onSources, onChange, onError }: {
  problem: ExamProblem; sources: SourcePage[];
  onSources: (pages: SourcePage[]) => void;
  onChange: (patch: Partial<ExamProblem>) => void; onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [box, setBox] = useState<FigureBox>(problem.figureBox ?? [200, 100, 600, 900]);
  const [chatPrompt, setChatPrompt] = useState("");
  const [currentSpec, setCurrentSpec] = useState<MathGeoSpec | null>(null);
  const [chatReply, setChatReply] = useState("");
  const start = useRef<[number, number] | null>(null);
  const source = sources.find(s => s.id === (sourceId || problem.figureSourceId)) ?? sources[(problem.sourcePage ?? 1) - 1] ?? sources[0];

  async function handleAiGeoChat(customInstruction?: string) {
    const instruction = (customInstruction ?? chatPrompt).trim();
    if (!instruction || busy) return;
    setBusy(true);
    try {
      const res = await sendAiCopilotMessage({
        prompt: instruction,
        mode: "geometry",
        pathname: "/typing",
        useWebSearch: false,
        contextData: {
          currentGeoSpec: currentSpec,
          problemQuestion: problem.question,
        },
      });
      const spec =
        res.updatedGeoSpec ??
        inferMathGeoSpecFromProblem(instruction, problem.boxContent, problem.choices, currentSpec);
      setCurrentSpec(spec);
      const pngUrl = await renderMathGeoPngDataUrl(spec);
      onChange({
        figureDiagram: undefined,
        figure: pngUrl,
        figureBox: undefined,
        figureSourceId: undefined,
      });
      setChatReply(res.reply);
      if (!customInstruction) setChatPrompt("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "AI 도형 작도에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const point = (e: PointerEvent<HTMLDivElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round((e.clientY - rect.top) / rect.height * 1000))), Math.max(0, Math.min(1000, Math.round((e.clientX - rect.left) / rect.width * 1000)))];
  };
  function drag(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const [y,x] = point(e), [sy,sx] = start.current;
    setBox([Math.min(y,sy), Math.min(x,sx), Math.max(y,sy), Math.max(x,sx)]);
  }
  async function apply() {
    if (!source) return;
    setBusy(true);
    try { onChange({ figureDiagram: undefined, figure: await cropFigure(source.image, box), figureBox: box, figureSourceId: source.id }); setOpen(false); }
    catch (e) { onError(e instanceof Error ? e.message : "그림을 자르지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className={styles.editor}>
    {problem.figureDiagram && <p>이전에 저장한 AI 그림입니다. 아래에서 원본을 올리고 그림 영역을 다시 선택하면 원본 그림으로 교체됩니다.</p>}
    <div style={{ padding: "8px 10px", borderRadius: 8, background: "#f8fafc", border: "1px solid #bfdbfe", display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 12, color: "#1e40af" }}>💬 AI 채팅으로 도형·함수 그래프 작도</strong>
        <button
          type="button"
          disabled={busy || !problem.question.trim()}
          onClick={() => void handleAiGeoChat(`이 문항 본문에 맞는 수학 도형·함수 그래프를 작도해줘: ${problem.question} ${problem.boxContent || ""}`)}
          style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" }}
        >
          ✦ 문항 본문으로 자동 작도
        </button>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <input
          type="text"
          value={chatPrompt}
          disabled={busy}
          onChange={e => setChatPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAiGeoChat();
            }
          }}
          placeholder="예: '삼차함수 y=x^3-3x+1과 x=1에서의 접선 그려줘', '적분 구간 색칠해줘'"
          aria-label={`문항 ${problem.number} AI 도형 작도 요청`}
          style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
        />
        <button
          type="button"
          disabled={busy || !chatPrompt.trim()}
          onClick={() => void handleAiGeoChat()}
          style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "#2563eb", color: "#ffffff", border: 0, whiteSpace: "nowrap" }}
        >
          {busy ? "작도 중…" : "AI 작도"}
        </button>
      </div>
      {chatReply && <small style={{ fontSize: 11, color: "#0369a1", lineHeight: 1.4 }}>{chatReply}</small>}
    </div>
    <label className={styles.upload}><strong>{problem.figure ? "그림 교체" : "그림 별도 첨부"}</strong><span>다른 도형·그래프 이미지로 교체할 수 있습니다.</span>
      <input type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setBusy(true);
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error("그림은 10MB 이하로 올려 주세요.");
          onChange({ figureDiagram: undefined, figure: await imageData(file, 1200), figureBox: undefined, figureSourceId: undefined }); setOpen(false);
        } catch (e) { onError(e instanceof Error ? e.message : "그림을 읽지 못했습니다."); }
        finally { setBusy(false); }
      }}/>
    </label>
    {problem.figure && <div className={styles.attachment}><img src={problem.figure} alt={`${problem.number}번 첨부 그림 미리보기`}/><button type="button" disabled={busy} onClick={() => { onChange({ figureDiagram: undefined, figure: undefined, figureBox: undefined, figureSourceId: undefined }); setOpen(false); }}>첨부 그림 삭제</button></div>}
    <label className={styles.upload}>그림 자르기용 원본 PDF·이미지 올리기<input type="file" aria-label={`${problem.number}번 그림 자르기용 원본`} disabled={busy} accept="application/pdf,image/png,image/jpeg,image/webp,.pdf" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      setBusy(true);
      try { const pages = await readSource(file); onSources(pages); setSourceId(pages[0]?.id ?? ""); setOpen(true); }
      catch (e) { onError(e instanceof Error ? e.message : "원본을 읽지 못했습니다."); }
      finally { setBusy(false); }
    }}/></label>
    <button type="button" disabled={!sources.length || busy} onClick={() => { setBox(problem.figureBox ?? [200,100,600,900]); setOpen(!open); }}>{problem.figure ? "원본에서 그림 영역 다시 선택" : "원본에서 그림 영역 선택"}</button>
    {!sources.length && <p>원본을 올리면 그림 영역을 직접 선택할 수 있습니다.</p>}
    {open && source && <div className={styles.crop} role="dialog" aria-modal="true" aria-label={`${problem.number}번 그림 영역 편집`}>
      <div className={styles.heading}><strong>그림 영역 선택</strong><button type="button" disabled={busy} onClick={() => setOpen(false)}>닫기</button></div>
      <label>그림 원본 페이지<select value={source.id} disabled={busy} onChange={e => { setSourceId(e.target.value); setBox([200,100,600,900]); }}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <p>그림을 감싸도록 드래그하세요. 축·눈금·글자가 모두 들어가게 선택해 주세요.</p>
      <div className={styles.canvas} onPointerDown={e => { if (busy || e.button !== 0) return; start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={drag} onPointerUp={e => { drag(e); start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        <img draggable={false} src={source.image} alt={`${problem.number}번 그림 자르기 원본`}/>
        <div className={styles.selection} style={{ top: `${box[0]/10}%`, left: `${box[1]/10}%`, width: `${(box[3]-box[1])/10}%`, height: `${(box[2]-box[0])/10}%` }}/>
      </div>
      <div className={styles.bounds}>{["상단", "왼쪽", "하단", "오른쪽"].map((label, i) => <label key={label}>{label} (%)<input type="number" aria-label={`${problem.number}번 그림 ${label} (%)`} min={0} max={100} step={0.1} value={box[i]/10} disabled={busy} onChange={e => setBox(prev => prev.map((v,j) => j === i ? Math.max(0,Math.min(1000,Math.round(Number(e.target.value)*10))) : v) as FigureBox)}/></label>)}</div>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void apply()}>{busy ? "그림 준비 중…" : "선택 영역 적용"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button></div>
    </div>}
  </div>;
}
