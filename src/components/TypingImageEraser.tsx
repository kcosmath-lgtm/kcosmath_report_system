"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./TypingImageEraser.module.css";

export default function TypingImageEraser({ source, onApply, onCancel }: {
  source: string; onApply: (image: string) => void; onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const history = useRef<ImageData[]>([]);
  const stroke = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const [size, setSize] = useState(12), [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(false), [steps, setSteps] = useState(0);
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active || !canvas.current) return;
      const node = canvas.current;
      node.width = image.naturalWidth; node.height = image.naturalHeight;
      const ctx = node.getContext("2d");
      if (!ctx) { setError("이미지 편집을 시작하지 못했습니다."); return; }
      ctx.drawImage(image, 0, 0); original.current = image; setReady(true);
    };
    image.onerror = () => { if (active) setError("이미지를 읽지 못했습니다."); };
    image.src = source;
    return () => { active = false; };
  }, [source]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const node = event.currentTarget, rect = node.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * node.width / rect.width, y: (event.clientY - rect.top) * node.height / rect.height };
  };
  function paint(event: PointerEvent<HTMLCanvasElement>, first = false) {
    const node = event.currentTarget, ctx = node.getContext("2d");
    if (!ctx || !ready || compare) return;
    if (first) {
      if (event.button !== 0) return;
      // Bound undo memory even when a large original is attached.
      const limit = Math.max(1, Math.min(10, Math.floor(64 * 1024 * 1024 / (node.width * node.height * 4))));
      history.current.push(ctx.getImageData(0, 0, node.width, node.height));
      while (history.current.length > limit) history.current.shift();
      setSteps(history.current.length);
      node.focus({ preventScroll: true });
      node.setPointerCapture(event.pointerId);
      stroke.current = { ...point(event), pointer: event.pointerId };
    }
    const previous = stroke.current;
    if (!previous || previous.pointer !== event.pointerId) return;
    event.preventDefault();
    const next = point(event);
    ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff";
    ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(next.x, next.y, size / 2, 0, Math.PI * 2); ctx.fill();
    stroke.current = { ...next, pointer: event.pointerId };
  }
  function undo() {
    if (compare) return;
    const node = canvas.current, ctx = node?.getContext("2d");
    if (!node || !ctx || !history.current.length) return;
    const pointer = stroke.current?.pointer;
    stroke.current = null;
    if (pointer !== undefined && node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
    ctx.putImageData(history.current.pop()!, 0, 0);
    setSteps(history.current.length);
  }
  function restore() {
    const node = canvas.current, ctx = node?.getContext("2d");
    if (!node || !ctx || !original.current) return;
    ctx.clearRect(0, 0, node.width, node.height); ctx.drawImage(original.current, 0, 0);
    history.current = []; stroke.current = null; setSteps(0);
  }
  return <section className={styles.editor} aria-label="손글씨 지우기" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) undo();
    }
  }}>
    <p>지울 손글씨를 드래그해 흰색으로 지웁니다. 도형이나 숫자와 겹친 부분도 함께 지워지므로 결과를 확인해 주세요. API 비용은 들지 않습니다.</p>
    <div className={styles.tools}>
      <label>브러시 크기 <input aria-label="브러시 크기" type="range" min="2" max="60" value={size} onChange={e => setSize(Number(e.target.value))}/><output>{size}px</output></label>
      <label>확대 <select aria-label="그림 확대" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label>
      <button type="button" disabled={!steps || compare} onClick={undo} aria-keyshortcuts="Control+Z Meta+Z" title="되돌리기 (Ctrl+Z / ⌘Z)">되돌리기</button>
      <button type="button" disabled={!ready} onClick={restore}>원본 복원</button>
      <label><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/>원본 비교</label>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className={styles.viewport}>
      <div style={{ width: `${zoom * 100}%` }}>
        <canvas ref={canvas} tabIndex={0} aria-label="손글씨 지우기 캔버스" style={{ display: compare ? "none" : "block" }} onPointerDown={e => paint(e, true)} onPointerMove={e => paint(e)} onPointerUp={e => { if (stroke.current?.pointer === e.pointerId) { paint(e); stroke.current = null; } }} onPointerCancel={() => { stroke.current = null; }} onLostPointerCapture={() => { stroke.current = null; }}/>
        {compare && <img src={source} alt="지우기 전 원본"/>}
      </div>
    </div>
    <div className={styles.actions}>
      <button type="button" disabled={!ready || !!error} onClick={() => { try { if (canvas.current) onApply(canvas.current.toDataURL("image/png")); } catch { setError("이미지를 저장하지 못했습니다."); } }}>지우기 적용</button>
      <button type="button" onClick={onCancel}>지우기 취소</button>
    </div>
  </section>;
}
