"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type PointerEvent } from "react";
import { cropFigure, imageData, readSource, type SourcePage } from "../lib/typing-upload";
import type { ExamProblem, FigureBox } from "../lib/typing-model";
import { supabase } from "../lib/supabase";
import styles from "./TypingFigureEditor.module.css";

export default function TypingFigureEditor({ problem, sources, onSources, onChange, onError }: {
  problem: ExamProblem; sources: SourcePage[];
  onSources: (pages: SourcePage[]) => void;
  onChange: (patch: Partial<ExamProblem>) => void; onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [candidate, setCandidate] = useState<{ original: string; image: string } | null>(null);
  const [box, setBox] = useState<FigureBox>(problem.figureBox ?? [200, 100, 600, 900]);
  const start = useRef<[number, number] | null>(null);
  const source = sources.find(s => s.id === (sourceId || problem.figureSourceId)) ?? sources[(problem.sourcePage ?? 1) - 1] ?? sources[0];
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
    try { onChange({ figure: await cropFigure(source.image, box), figureBox: box, figureSourceId: source.id }); setOpen(false); }
    catch (e) { onError(e instanceof Error ? e.message : "그림을 자르지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function cleanFigure() {
    const original = problem.figure;
    if (!original || busy) return;
    setBusy(true); setCandidate(null); onError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다.");
      const response = await fetch("/api/typing/clean-figure", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ image: original.split(",")[1], mimeType: original.slice(5, original.indexOf(";")) }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.image !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(result.image)) throw new Error(result?.error ?? `그림 AI 요청이 실패했습니다 (HTTP ${response.status}).`);
      const file = new File([await (await fetch(result.image)).blob()], "cleaned.png");
      setCandidate({ original, image: await imageData(file, 1200) });
    } catch (e) { onError(e instanceof Error ? e.message : "그림 정리에 실패했습니다. 원본을 유지했습니다."); }
    finally { setBusy(false); }
  }
  return <div className={styles.editor}>
    <label className={styles.upload}><strong>{problem.figure ? "그림 교체" : "그림 별도 첨부"}</strong><span>다른 도형·그래프 이미지로 교체할 수 있습니다.</span>
      <input type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setBusy(true);
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error("그림은 10MB 이하로 올려 주세요.");
          onChange({ figure: await imageData(file, 1200), figureBox: undefined, figureSourceId: undefined }); setOpen(false);
        } catch (e) { onError(e instanceof Error ? e.message : "그림을 읽지 못했습니다."); }
        finally { setBusy(false); }
      }}/>
    </label>
    {problem.figure && <div className={styles.attachment}><img src={problem.figure} alt={`${problem.number}번 첨부 그림 미리보기`}/><button type="button" disabled={busy} onClick={() => { onChange({ figure: undefined, figureBox: undefined, figureSourceId: undefined }); setOpen(false); }}>첨부 그림 삭제</button></div>}
    {problem.figure && <><button type="button" className={styles.aiButton} disabled={busy} onClick={() => void cleanFigure()}>{busy ? "그림 처리 중…" : "AI로 손글씨 지우고 재생성"}</button><p>선택한 그림만 AI로 정리합니다. 별도 이미지 생성 API 비용이 발생합니다.</p></>}
    {candidate && candidate.original === problem.figure && <div className={styles.comparison}>
      <strong>AI 정리 결과 비교</strong><div className={styles.compareImages}><div>원본<img src={candidate.original} alt={`${problem.number}번 AI 정리 전`}/></div><div>AI 정리<img src={candidate.image} alt={`${problem.number}번 AI 정리 결과`}/></div></div>
      <p>숫자·각도·눈금·글자가 원본과 같은지 확인한 후 적용하세요.</p>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => { onChange({ figure: candidate.image }); setCandidate(null); }}>정리된 그림 적용</button><button type="button" disabled={busy} onClick={() => setCandidate(null)}>원본 유지</button></div>
    </div>}
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
