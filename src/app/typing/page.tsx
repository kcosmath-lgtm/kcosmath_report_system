"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../../../public/logo.png";
import { ArrowDown, ArrowUp, FileDown, FileText, Loader2, Plus, Printer, Save, ScanText, Trash2, Upload } from "lucide-react";
import "katex/dist/katex.min.css";
import LandingMenu from "../../components/LandingMenu";
import TypingAccessGate from "../../components/TypingAccessGate";
import TypingFigureEditor from "../../components/TypingFigureEditor";
import TypingPreviewEditor from "../../components/TypingPreviewEditor";
import TypingMath from "../../components/TypingMath";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { storageError } from "../../lib/supabase-report-storage";
import { COLUMN_HEIGHT, hasStatementChoices, formatTableCell, formatChoiceContent, choiceRowsEnabled, formatBoxContent, choiceLabels, examPages, normalizeProblems, sampleProblems, type ExamDocument, type ExamProblem, type ExamTable } from "../../lib/typing-model";
import { cropFigure, paddedFigureBox, imageData, readSource, type SourcePage } from "../../lib/typing-upload";
import { buildDocx, buildHwpx, downloadBlob, prepareExportDocument } from "../../lib/typing-export";
import styles from "./typing.module.css";

function PaperTitle({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const fit = () => {
      let size = 20;
      node.style.fontSize = size + "px";
      while (size > 8 && (node.scrollHeight > 32 || node.scrollWidth > node.clientWidth + 1)) node.style.fontSize = --size + "px";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(node.parentElement!); fit(); void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [text]);
  return <div className={styles.paperTitle}><span ref={ref}>{text}</span></div>;
}
function Choices({ choices, choiceLayout, choiceFigures, measure = false }: Pick<ExamProblem, "choices" | "choiceLayout" | "choiceFigures"> & { measure?: boolean }) {
  const rows = choiceRowsEnabled({ choices, choiceLayout });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current; if (!node || !choices.length) return;
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const width = Math.max(...Array.from(node.children).map(item => {
        const label = item.firstElementChild as HTMLElement;
        const content = item.lastElementChild as HTMLElement;
        const probe = content.cloneNode(true) as HTMLElement;
        Object.assign(probe.style, { position: "absolute", visibility: "hidden", width: "max-content", maxWidth: "none", overflow: "visible" });
        content.appendChild(probe); const naturalWidth = probe.scrollWidth; probe.remove();
        return label.offsetWidth + 5 + naturalWidth;
      }));
      const fits = (n: number) => n * width + (n - 1) * 16 <= node.clientWidth;
      const columns = rows ? 1 : choiceFigures?.some(f => f.figure) ? 2 : hasStatementChoices(choices) ? (fits(3) ? 3 : 1) : fits(5) ? 5 : fits(3) ? 3 : 1;
      node.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    };
    const observer = new ResizeObserver(fit); observer.observe(node);
    fit(); void document.fonts.ready.then(fit);
    return () => { cancelled = true; observer.disconnect(); };
  }, [choices, rows, choiceFigures]);
  return <div className={styles.choices} data-prose={rows} ref={ref}>{choices.map((c, n) => <div key={n}><span>{choiceLabels[n]}</span><div className={styles.choiceContent}><span {...previewField(`choice:${n}`, `${choiceLabels[n]} 선지`, measure)}><TypingMath text={formatChoiceContent(c)}/></span>{choiceFigures?.[n]?.figure && <img {...previewField(`choiceFigure:${n}`, `${choiceLabels[n]} 선지 그림`, measure)} className={styles.choiceFigure} src={choiceFigures[n].figure} alt={`${choiceLabels[n]} 선지 그림`}/>}</div></div>)}</div>;
}
function previewField(field: string, label: string, measure: boolean) {
  return measure ? {} : { "data-preview-field": field, "data-preview-label": label, role: "button", tabIndex: 0, "aria-label": label + " 편집", title: "클릭하여 편집" };
}
function ProblemView({ p, measure = false }: { p: ExamProblem; measure?: boolean }) {
  return <section className={styles.problem} data-problem={measure ? undefined : true} data-problem-id={measure ? undefined : p.id}>
    <div className={styles.question}><strong>{p.number}.</strong><div><span {...previewField("question", "문항 " + p.number + " 본문", measure)}><TypingMath text={p.question}/></span>{p.points && <small> [{p.points}]</small>}</div></div>
    {p.boxContent && <div className={styles.box}><div className={styles.boxLabel}>〈보기〉</div><span {...previewField("boxContent", "보기 및 조건", measure)}><span className={styles.boxParagraphs}>{formatBoxContent(p.boxContent).split("\n").map((line, i) => <span key={i} className={/^(?:[ㄱㄴㄷㄹㅁ][.)]|[㉠-㉤])/.test(line) ? styles.boxStatement : styles.boxParagraph}><TypingMath text={line}/></span>)}</span></span></div>}
    {p.tables?.map((table, ti) => <table className={styles.examTable} key={ti}>{table.caption && <caption>{table.caption}</caption>}<tbody>{table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} {...previewField("table:" + ti + ":" + ri + ":" + ci, "표 " + (ti+1) + " " + (ri+1) + "행 " + (ci+1) + "열", measure)}><TypingMath text={formatTableCell(cell)}/></td>)}</tr>)}</tbody></table>)}
    {p.figure && <img {...previewField("figure", "문항 " + p.number + " 그림", measure)} className={styles.figure} src={p.figure} alt={p.number + "번 문항 그림"}/>}
    <Choices choices={p.choices} choiceLayout={p.choiceLayout} choiceFigures={p.choiceFigures} measure={measure}/>
  </section>;
}
function cleanDocument(doc: ExamDocument): ExamDocument {
  return { ...doc, problems: normalizeProblems(doc.problems).map((p, i) => ({ ...p, id: doc.problems[i].id || p.id, figure: doc.problems[i].figure, sourcePage: doc.problems[i].sourcePage })) };
}
type Saved = { id: string; title: string; version: number };
const empty = (): ExamDocument => ({ title: "MATHTYPING", perPage: 4, problems: [] });
function TypingWorkspace() {
  const { user, workspace } = useAuth();
  const [doc, setDoc] = useState<ExamDocument>(empty);
  const [previewEdit, setPreviewEdit] = useState<{ id: string; field: string; label: string; value: string; image: boolean } | null>(null);
  const [sources, setSources] = useState<SourcePage[]>([]), [sourceId, setSourceId] = useState("");
  const [tab, setTab] = useState<"edit" | "source">("source");
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]), [active, setActive] = useState<Saved | null>(null);
  const [dirty, setDirty] = useState(false), [draftReady, setDraftReady] = useState(false);
  const measurement = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const preview = useRef<HTMLDivElement>(null), stop = useRef(false), mounted = useRef(true);
  const draftKey = `cosmath:typing:${workspace?.id}:${user?.id}`;
  const currentSource = sources.find(s => s.id === sourceId) ?? sources[0];
  function change(fn: (current: ExamDocument) => ExamDocument) { setDoc(fn); setDirty(true); setError(""); }
  function update(id: string, patch: Partial<ExamProblem>) { change(d => ({ ...d, problems: d.problems.map(p => p.id === id ? { ...p, ...patch } : p) })); }
  function openPreviewEdit(target: HTMLElement) {
    if (busy) return;
    const node = target.closest<HTMLElement>("[data-preview-field]");
    const id = node?.closest<HTMLElement>("[data-problem-id]")?.dataset.problemId;
    const problem = doc.problems.find(p => p.id === id), field = node?.dataset.previewField;
    if (!problem || !field) return;
    const [kind, a, b, c] = field.split(":");
    const value = kind === "question" ? problem.question : kind === "boxContent" ? problem.boxContent : kind === "figure" ? problem.figure : kind === "choice" ? problem.choices[Number(a)] : kind === "choiceFigure" ? problem.choiceFigures?.[Number(a)]?.figure : problem.tables?.[Number(a)]?.rows[Number(b)]?.[Number(c)];
    setPreviewEdit({ id: problem.id, field, label: node!.dataset.previewLabel ?? "내용", value: value ?? "", image: kind === "figure" || kind === "choiceFigure" });
  }
  function savePreviewEdit(value: string) {
    if (!previewEdit) return;
    const problem = doc.problems.find(p => p.id === previewEdit.id);
    if (problem) {
      const [kind, a, b, c] = previewEdit.field.split(":");
      if (kind === "question" || kind === "boxContent") update(problem.id, { [kind]: value });
      else if (kind === "figure") update(problem.id, value ? { figureDiagram: undefined, figure: value } : { figureDiagram: undefined, figure: undefined, figureBox: undefined, figureSourceId: undefined });
      else if (kind === "choice") update(problem.id, { choices: problem.choices.map((choice, i) => i === Number(a) ? value : choice) });
      else if (kind === "choiceFigure") update(problem.id, { choiceFigures: problem.choiceFigures?.map((figure, i) => i === Number(a) ? value ? { ...figure, figure: value, figureDiagram: undefined } : {} : figure) });
      else if (kind === "table") update(problem.id, { tables: problem.tables?.map((table, ti) => ti === Number(a) ? { ...table, rows: table.rows.map((row, ri) => ri === Number(b) ? row.map((cell, ci) => ci === Number(c) ? value.slice(0,2000) : cell) : row) } : table) });
    }
    setPreviewEdit(null);
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => {
    const node = preview.current; if (!node) return;
    const observer = new ResizeObserver(entries => node.style.setProperty("--paper-scale", String(Math.min(1, entries[0].contentRect.width / 794))));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      const text = localStorage.getItem(draftKey);
      if (text) {
        const draft = JSON.parse(text);
        if (draft.doc && Array.isArray(draft.doc.problems)) { setDoc(cleanDocument(draft.doc)); setActive(draft.active ?? null); setDirty(true); setMessage("이 브라우저의 작성 중인 시험지를 복원했습니다."); }
      }
    } catch { setError("임시 저장본을 복원하지 못했습니다. 저장된 시험지나 편집본 JSON을 열어 주세요."); }
    setDraftReady(true);
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    const timeout = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ doc, active })); }
      catch { setError("브라우저 임시 저장 공간이 부족합니다. 학원 저장 또는 편집본 JSON 다운로드를 해 주세요."); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [doc, active, draftKey, draftReady]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const node = measurement.current; if (!node) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next = Object.fromEntries(Array.from(node.children).map((child, i) => [doc.problems[i].id, Math.ceil(child.getBoundingClientRect().height)]));
      setHeights(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    Array.from(node.children).forEach(child => observer.observe(child));
    measure(); void document.fonts.ready.then(measure);
    return () => { cancelled = true; observer.disconnect(); };
  }, [doc.problems]);
  const oversized = doc.problems.filter(p => (heights[p.id] ?? 0) > COLUMN_HEIGHT);
  async function refreshSaved() {
    const { data, error } = await supabase.from("cosmath_typing_documents").select("id,title,version").order("updated_at", { ascending: false }).limit(100);
    if (error) throw storageError(error); setSaved(data ?? []);
  }
  useEffect(() => { void refreshSaved().catch(() => { /* A new installation can still use local editing and exports. */ }); }, [workspace?.id]);
  async function save() {
    if (!doc.problems.length) return;
    setBusy("저장 중"); setError("");
    try {
      const payload = { title: doc.title.trim() || "MATHTYPING", document: doc, version: (active?.version ?? 0) + 1, updated_at: new Date().toISOString() };
      const result = active
        ? await supabase.from("cosmath_typing_documents").update(payload).eq("id", active.id).eq("version", active.version).select("id,title,version").maybeSingle()
        : await supabase.from("cosmath_typing_documents").insert(payload).select("id,title,version").single();
      if (result.error) throw storageError(result.error);
      if (!result.data) throw new Error("다른 창에서 시험지가 변경되었습니다. 편집본 JSON을 다운로드한 뒤 다시 열어 주세요.");
      setActive(result.data); setDirty(false); setMessage("학원에 저장했습니다. 다른 기기에서도 다시 열 수 있습니다."); await refreshSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(""); }
  }
  async function load(id: string) {
    if (!id || (dirty && !confirm("작성 중인 내용을 저장하지 않고 다른 시험지를 열까요?"))) return;
    setBusy("불러오는 중"); setError("");
    try {
      const { data, error } = await supabase.from("cosmath_typing_documents").select("id,title,version,document").eq("id", id).single();
      if (error) throw storageError(error);
      setDoc(cleanDocument(data.document as ExamDocument)); setActive({ id: data.id, title: data.title, version: data.version }); setDirty(false); setSources([]); setMessage("시험지를 불러왔습니다. 원본 미리보기는 파일을 다시 올리면 볼 수 있습니다."); setTab("edit");
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했습니다."); } finally { setBusy(""); }
  }
  async function upload(files: File[]) {
    setBusy("파일을 읽는 중"); setError("");
    try {
      let added = 0;
      for (const file of files) {
        const pages = await readSource(file);
        if (sources.length + added + pages.length > 30) throw new Error("한 번에 최대 30페이지까지 올릴 수 있습니다.");
        added += pages.length; setSources(prev => [...prev, ...pages]); setSourceId(pages[0]?.id ?? "");
      }
      setTab("source"); setMessage("타이핑할 페이지를 선택하고 ‘선택 페이지 인식’을 눌러 주세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); } finally { setBusy(""); }
  }
  async function extract() {
    const targets = sources.filter(s => s.selected && s.status !== "done");
    if (!targets.length) { setError("인식할 페이지를 선택해 주세요. 완료한 페이지는 중복 인식하지 않습니다."); return; }
    setError(""); stop.current = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다.");
      for (let i = 0; i < targets.length; i++) {
        if (stop.current || !mounted.current) break;
        const source = targets[i]; setBusy(`${i + 1}/${targets.length} 페이지 인식 중`); setSourceId(source.id);
        try {
          const response = await fetch("/api/typing/extract", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ image: source.image.split(",")[1], mimeType: "image/jpeg" }), signal: AbortSignal.timeout(65_000) });
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error(result?.error ? `${result.error}${result.code ? " [" + result.code + "]" : ""}${result.requestId ? " · 오류 번호: " + result.requestId : ""}` : `서버가 OCR 응답을 반환하지 못했습니다 (HTTP ${response.status}). Vercel 실행 로그를 확인해 주세요.`);
          if (!result) throw new Error("서버의 OCR 응답을 읽지 못했습니다. 다시 시도해 주세요.");
          const pageNumber = sources.findIndex(s => s.id === source.id) + 1;
          const problems = normalizeProblems(result.problems, pageNumber);
          for (const problem of problems) {
            for (const figure of problem.choiceFigures ?? []) {
              figure.figureDiagram = undefined;
              if (!figure.figureBox) continue;
              figure.figureBox = paddedFigureBox(figure.figureBox);
              try { figure.figure = await cropFigure(source.image, figure.figureBox); figure.figureSourceId = source.id; }
              catch { problem.review = [problem.review, "선지 그림 자르기에 실패했습니다. 선지별 그림 영역을 직접 선택해 주세요."].filter(Boolean).join(" / "); }
            }
            problem.figureDiagram = undefined;
            if (!problem.figureBox) continue;
            problem.figureBox = paddedFigureBox(problem.figureBox);
            try { problem.figure = await cropFigure(source.image, problem.figureBox); problem.figureSourceId = source.id; }
            catch { problem.review = [problem.review, "그림 자동 자르기에 실패했습니다. 원본에서 영역을 직접 선택해 주세요."].filter(Boolean).join(" / "); }
          }
          if (!problems.length) throw new Error("인식된 문항이 없습니다. 원본을 확인해 주세요.");
          if (!mounted.current) break;
          change(d => ({ ...d, problems: [...d.problems, ...problems] }));
          setSources(prev => prev.map(s => s.id === source.id ? { ...s, status: "done", selected: false, error: undefined } : s));
        } catch (e) {
          const reason = e instanceof Error ? e.message : "인식 실패";
          setSources(prev => prev.map(s => s.id === source.id ? { ...s, status: "error", error: reason } : s)); setError(`${source.name}: ${reason}`);
        }
      }
      setTab("edit"); setMessage("인식 결과를 원본과 대조해 주세요. 실패한 페이지는 다시 선택해 인식할 수 있습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "인식에 실패했습니다."); } finally { if (mounted.current) setBusy(""); }
  }
  async function exportFile(format: "docx" | "hwpx" | "json") {
    if (!doc.problems.length) return;
    if (format !== "json" && oversized.length) { setError("한 단보다 긴 문항이 있습니다. 본문이나 그림 크기를 줄인 후 다운로드해 주세요."); return; }
    setBusy("다운로드 준비 중"); setError("");
    try {
      const choiceColumns = Object.fromEntries(Array.from(preview.current?.querySelectorAll<HTMLElement>('[data-problem]') ?? []).map(node => {
        const choices = node.querySelector<HTMLElement>(`.${styles.choices}`);
        return [node.getAttribute('data-problem-id') ?? '', Number(choices?.style.gridTemplateColumns.match(/repeat\((\d+)/)?.[1] ?? 1)];
      }));
      let blob: Blob;
      const prepared = format === "json" ? { document: doc, warnings: [] } : prepareExportDocument(doc, format);
      const brandImage = format === "json" ? undefined : await imageData(new File([await (await fetch(logo.src)).blob()], "logo.png", { type: "image/png" }), 400);
      if (format === "json") blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      else if (format === "docx") blob = await buildDocx({ ...prepared.document, brandImage, choiceColumns, problemHeights: heights });
      else {
        const response = await fetch("/typing/blank.hwpx"); if (!response.ok) throw new Error("한글 문서 양식을 불러오지 못했습니다.");
        blob = await buildHwpx({ ...prepared.document, brandImage, choiceColumns, problemHeights: heights }, await response.arrayBuffer());
      }
      downloadBlob(blob, `${doc.title || "시험지"}.${format}`); setMessage(`${format.toUpperCase()} 편집본을 내려받았습니다.`);
      if (prepared.warnings.length) setError(`문항 ${prepared.warnings.join(", ")}: 변환할 수 없는 수식은 파일에 편집 가능한 원문으로 보존했습니다. 수식 문법을 확인해 주세요.`);
    } catch (e) { setError(e instanceof Error ? e.message : "내보내기에 실패했습니다."); } finally { setBusy(""); }
  }
  async function importJson(file: File) {
    setBusy("편집본 여는 중"); setError("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("편집본은 20MB 이하로 선택해 주세요.");
      const data = JSON.parse(await file.text());
      const problems = normalizeProblems(data.problems).map((p, i) => ({ ...p, figure: /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data.problems[i].figure ?? "") ? data.problems[i].figure : undefined }));
      if (dirty && !confirm("작성 중인 내용을 편집본으로 바꿀까요?")) return;
      setActive(null); change(() => ({ title: typeof data.title === "string" ? data.title.slice(0, 150) : "MATHTYPING", perPage: [2, 4, 6].includes(data.perPage) ? data.perPage : 4, problems })); setSources([]); setTab("edit");
    } catch (e) { setError(e instanceof Error ? e.message : "올바른 편집본 JSON을 선택해 주세요."); } finally { setBusy(""); }
  }
  async function print() {
    await document.fonts.ready;
    if (oversized.length) { setError("한 단보다 긴 문항이 있습니다. 본문이나 그림 크기를 줄여 주세요."); return; }
    if (preview.current?.querySelector('[data-problem] mark')) { setError("수식 문법을 먼저 확인해 주세요. 노란색으로 표시한 수식을 수정한 뒤 PDF를 저장할 수 있습니다."); return; }
    if (preview.current && Array.from(preview.current.querySelectorAll('[data-problem]')).some(el => el.scrollHeight > el.clientHeight + 2)) {
      setError("문항이 풀이 공간을 넘습니다. 페이지당 문항 수를 줄이거나 긴 문항을 나눈 뒤 PDF를 저장해 주세요."); return;
    }
    window.print();
  }
  function move(index: number, direction: number) {
    change(d => { const next = [...d.problems]; const other = index + direction; if (other >= 0 && other < next.length) [next[index], next[other]] = [next[other], next[index]]; return { ...d, problems: next }; });
  }
  return <main className={styles.app}>
    <header className={styles.header}><Link href="/" className={styles.brand}><Image src={logo} alt="COSMATH MATH ACADEMY" priority/><span>WORKSPACE</span></Link><div className={styles.headerRight}><Link href="/errors/report" className={styles.reportLink}><FileText size={16}/>오답·숙제 보고서</Link><LandingMenu/></div></header>
    <section className={styles.top}><div><p>EXAM STUDIO</p><h1>시험지 타이핑 <span>수학을 선명하게, 준비는 간편하게.</span></h1><small>PDF·이미지를 문항으로 옮기고, 편집 가능한 시험지로 완성하세요.</small></div><div className={styles.exports}>
      <button disabled={!!busy || !doc.problems.length} onClick={() => void save()}><Save size={16}/>학원 저장</button>
      <button disabled={!!busy || !doc.problems.length} onClick={() => void exportFile("docx")}><FileDown size={16}/>Word</button>
      <button disabled={!!busy || !doc.problems.length} onClick={() => void exportFile("hwpx")}><FileDown size={16}/>한글 HWPX</button>
      <button className={styles.primary} disabled={!!busy || !doc.problems.length} onClick={() => void print()}><Printer size={16}/>PDF / 인쇄</button>
    </div></section>
    <div className={styles.notice}>Word·한글은 본문과 수식을 편집할 수 있습니다. PDF는 인쇄용이며, 수식 편집은 Word·한글 파일을 사용해 주세요.</div>
    <div className={styles.status} aria-live="polite">{busy ? <><Loader2 size={14} className="animate-spin"/>{busy}{busy.includes("인식 중") && <button onClick={() => { stop.current = true; }}>현재 페이지 후 중지</button>}</> : error ? <span role="alert">{error}</span> : message || "원본을 올리거나 예시 시험지로 시작해 보세요."}</div>
    <div className={styles.workspace}>
      <aside className={styles.panel}><div className={styles.tabs}><button aria-pressed={tab === "source"} onClick={() => setTab("source")}><Upload size={15}/>원본 업로드</button><button aria-pressed={tab === "edit"} onClick={() => setTab("edit")}><ScanText size={15}/>문항 편집 <b>{doc.problems.length}</b></button></div>
        <fieldset disabled={!!busy} className={styles.panelBody}>
          {tab === "source" ? <>
            <label className={styles.dropzone}><Upload size={26}/><strong>시험지 파일 올리기</strong><span>PDF · JPG · PNG · WebP / 최대 30MB, 30쪽</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }}/></label>
            {!!sources.length && <><div className={styles.sourceToolbar}><strong>{sources.length}쪽</strong><button onClick={() => setSources(prev => prev.map(s => ({ ...s, selected: s.status !== "done" })))}>미인식 모두 선택</button><button onClick={() => { setSources([]); setSourceId(""); }}>원본 비우기</button></div><div className={styles.sourceList}>{sources.map((s, i) => <div key={s.id}><input type="checkbox" aria-label={`${s.name} 인식 선택`} checked={s.selected} disabled={s.status === "done"} onChange={e => setSources(prev => prev.map(p => p.id === s.id ? { ...p, selected: e.target.checked } : p))}/><button data-active={s.id === currentSource?.id} onClick={() => setSourceId(s.id)}>{i + 1}. {s.name}<small>{s.status === "done" ? "인식 완료" : s.status === "error" ? s.error : "인식 대기"}</small></button></div>)}</div><button className={styles.recognize} onClick={() => void extract()}><ScanText size={17}/>선택 페이지 인식</button>{currentSource && <a href={currentSource.image} target="_blank" rel="noreferrer" title="원본 크게 보기"><img className={styles.sourceImage} src={currentSource.image} alt={currentSource.name}/></a>}</>}
            <button className={styles.sample} onClick={() => { if (doc.problems.length && !confirm("현재 문항 뒤에 예시 4문항을 추가할까요?")) return; change(d => ({ ...d, problems: [...d.problems, ...sampleProblems.map(p => ({ ...p, id: crypto.randomUUID() }))] })); setTab("edit"); }}>예시 시험지 4문항으로 시작 →</button>
          </> : <>
            <div className={styles.editTools}><button onClick={() => change(d => ({ ...d, problems: [...d.problems, { id: crypto.randomUUID(), number: String(d.problems.length + 1), points: "", question: "문제 내용을 입력하세요.", boxContent: "", choices: [] }] }))}><Plus size={15}/>문항 추가</button><button onClick={() => change(d => ({ ...d, problems: d.problems.map((p, i) => ({ ...p, number: String(i + 1) })) }))}>번호 정리</button></div>
            <p className={styles.help}>수식은 $x^2$처럼 입력하고, 독립 수식은 $$…$$로 감싸세요. 노란 수식은 문법 확인이 필요합니다.</p>
            {!doc.problems.length && <p className={styles.emptyEditor}>원본을 인식하거나 문항을 직접 추가해 주세요.</p>}
            {doc.problems.map((p, i) => <section className={styles.editor} key={p.id}><div className={styles.editorTitle}><strong>문항 {p.number}</strong><div><button aria-label="문항 위로" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14}/></button><button aria-label="문항 아래로" disabled={i === doc.problems.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14}/></button><button aria-label="문항 삭제" onClick={() => { if (confirm(`${p.number}번 문항을 삭제할까요?`)) change(d => ({ ...d, problems: d.problems.filter(q => q.id !== p.id) })); }}><Trash2 size={14}/></button></div></div>
              {p.review && <p className={styles.review}>확인 필요: {p.review}</p>}
              <div className={styles.row}><label>번호<input value={p.number} maxLength={30} onChange={e => update(p.id, { number: e.target.value })}/></label><label>배점<input value={p.points} maxLength={30} onChange={e => update(p.id, { points: e.target.value })} placeholder="3점"/></label></div>
              <label>문제 본문<textarea value={p.question} rows={5} onChange={e => update(p.id, { question: e.target.value })}/></label>
              <label>보기 / 조건 박스<textarea value={p.boxContent} rows={2} onChange={e => update(p.id, { boxContent: e.target.value })}/></label>
              <label>선택지 · 한 줄에 하나씩, 최대 5개<textarea value={p.choices.join("\n")} rows={3} onChange={e => { const choices = e.target.value ? e.target.value.split("\n").slice(0, 5) : []; const count = Math.max(choices.length, ...(p.choiceFigures ?? []).map((figure, i) => figure.figure ? i + 1 : 0)); update(p.id, { choices: Array.from({ length: count }, (_, i) => choices[i] ?? "") }); }}/></label>
              <label>선택지 배치<select aria-label={`문항 ${p.number} 선택지 배치`} value={p.choiceLayout ?? "auto"} onChange={e => update(p.id, { choiceLayout: e.target.value as ExamProblem["choiceLayout"] })}><option value="auto">자동 · 문장형은 한 줄에 하나</option><option value="rows">한 줄에 하나씩</option><option value="grid">짧은 선지 나란히</option></select></label>
              <div className={styles.tableEditor}><strong>표 편집</strong><button disabled={(p.tables?.length ?? 0) >= 6} onClick={() => update(p.id, { tables: [...(p.tables ?? []), { caption: "", rows: [["", ""], ["", ""]] }] })}><Plus size={13}/>표 추가</button>
                {p.tables?.map((table, ti) => {
                  const changeTable = (patch: Partial<ExamTable>) => update(p.id, { tables: p.tables!.map((t, index) => index === ti ? { ...t, ...patch } : t) });
                  return <div className={styles.tableCard} key={ti}><label>표 제목<input value={table.caption} maxLength={150} onChange={e => changeTable({ caption: e.target.value })}/></label><div className={styles.tableCells}><table><tbody>{table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}><input aria-label={`문항 ${p.number} 표 ${ti + 1} ${ri + 1}행 ${ci + 1}열`} value={cell} maxLength={2000} onChange={e => changeTable({ rows: table.rows.map((r, rowIndex) => rowIndex === ri ? r.map((c, columnIndex) => columnIndex === ci ? e.target.value : c) : r) })}/></td>)}</tr>)}</tbody></table></div><div className={styles.tableActions}><button disabled={table.rows.length >= 20} onClick={() => changeTable({ rows: [...table.rows, table.rows[0].map(() => "")] })}>행 추가</button><button disabled={table.rows.length <= 1} onClick={() => changeTable({ rows: table.rows.slice(0, -1) })}>마지막 행 삭제</button><button disabled={table.rows[0].length >= 10} onClick={() => changeTable({ rows: table.rows.map(row => [...row, ""]) })}>열 추가</button><button disabled={table.rows[0].length <= 1} onClick={() => changeTable({ rows: table.rows.map(row => row.slice(0, -1)) })}>마지막 열 삭제</button><button onClick={() => update(p.id, { tables: p.tables!.filter((_, index) => index !== ti) })}>표 삭제</button></div></div>;
                })}
              </div>
              <TypingFigureEditor problem={p} sources={sources} onSources={pages => setSources(prev => [...prev, ...pages].slice(-30))} onChange={patch => update(p.id, patch)} onError={setError}/>
              <details className={styles.choiceFigureEditor}><summary>객관식 선지별 그림 편집 (①~⑤)</summary>{Array.from({ length: 5 }, (_, index) => <div key={index}><strong>{choiceLabels[index]} 선지 그림</strong><TypingFigureEditor problem={{ ...p, number: p.number + "-" + choiceLabels[index], figureDiagram: p.choiceFigures?.[index]?.figureDiagram, figure: p.choiceFigures?.[index]?.figure, figureBox: p.choiceFigures?.[index]?.figureBox, figureSourceId: p.choiceFigures?.[index]?.figureSourceId }} sources={sources} onSources={pages => setSources(prev => [...prev, ...pages].slice(-30))} onChange={patch => {
                const choiceFigures = Array.from({ length: Math.max(p.choices.length, index + 1) }, (_, i) => i === index ? { figureDiagram: patch.figureDiagram, figure: patch.figure, figureBox: patch.figureBox, figureSourceId: patch.figureSourceId } : (p.choiceFigures?.[i] ?? {}));
                update(p.id, { choiceFigures, choices: Array.from({ length: Math.max(p.choices.length, index + 1) }, (_, i) => p.choices[i] ?? "") });
              }} onError={setError}/></div>)}</details>
            </section>)}
          </>}
        </fieldset>
      </aside>
      <section className={styles.previewArea}><div className={styles.previewControls}><div><span className={styles.liveDot}/>A4 시험지 미리보기 <small>2단 · {doc.problems.length}문항 · 길이에 맞춰 자동 배치</small></div><label>페이지당 <select value={doc.perPage} disabled={!!busy} onChange={e => change(d => ({ ...d, perPage: Number(e.target.value) }))}>{[2, 4, 6].map(n => <option key={n} value={n}>{n}문항</option>)}</select></label></div>
        <div className={styles.documentBar}><label>시험지 제목<input aria-label="시험지 제목" value={doc.title} maxLength={150} disabled={!!busy} onChange={e => change(d => ({ ...d, title: e.target.value }))}/></label><select aria-label="저장된 시험지 열기" disabled={!!busy} value="" onChange={e => void load(e.target.value)}><option value="">저장된 시험지 열기</option>{saved.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select><button disabled={!!busy} onClick={() => { if (dirty && !confirm("저장하지 않은 내용을 비우고 새 시험지를 만들까요?")) return; setActive(null); setDoc(empty()); setSources([]); setDirty(false); }}>새 시험지</button></div>
        <div className={styles.measurement} ref={measurement} aria-hidden="true">{doc.problems.map(p => <ProblemView key={p.id} p={p} measure/>)}</div>
        {!!oversized.length && <p className={styles.layoutWarning}>문항 {oversized.map(p => p.number).join(", ")}: 한 단보다 긴 내용입니다. 본문을 나누거나 그림을 줄여 주세요.</p>}
        <p className={styles.previewHint}>본문·선지·표 셀을 누르면 수정할 수 있고, 그림을 누르면 삭제할 수 있습니다.</p>
        <div className={styles.paperScroll} ref={preview} onClick={e => openPreviewEdit(e.target as HTMLElement)} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).matches("[data-preview-field]")) { e.preventDefault(); openPreviewEdit(e.target as HTMLElement); } }}>
          {!doc.problems.length && <div className={styles.emptyPaper}><FileText size={42}/><h2>첫 시험지를 만들어 보세요</h2><p>파일을 올리면 문항과 수식을 인식해<br/>여백이 넉넉한 시험지로 정리합니다.</p></div>}
          {examPages(doc.problems, doc.perPage, heights).map((page, index) => <article key={index} className={styles.paper}><div className={styles.paperHeader}><div className={styles.paperBrand}><Image src={logo} alt="COSMATH"/></div><PaperTitle text={doc.title === "MATHTYPING" ? "" : doc.title}/><strong>{index + 1}</strong></div><div className={styles.columns}>{[page.left, page.right].map((col, ci) => <div key={ci} className={styles.column} style={{ gridTemplateRows: `repeat(${page.capacity / 2}, minmax(0, 1fr))` }}>{col.map(p => <ProblemView key={p.id} p={p}/>)}</div>)}</div></article>)}
        </div>
        <div className={styles.footer}><span>{dirty ? "작성 중 · 이 브라우저에 임시 저장" : active ? "학원에 저장됨" : "새 시험지"}</span><div><button disabled={!!busy || !doc.problems.length} onClick={() => void exportFile("json")}>편집본 JSON 다운로드</button><label>편집본 열기<input type="file" accept="application/json,.json" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; if (file) void importJson(file); e.target.value = ""; }}/></label></div></div>
      </section>
    </div>
    {previewEdit && <TypingPreviewEditor key={previewEdit.id + previewEdit.field} label={previewEdit.label} value={previewEdit.value} image={previewEdit.image} required={previewEdit.field === "question"} onSave={savePreviewEdit} onClose={() => setPreviewEdit(null)}/>}
  </main>;
}

export default function TypingPage() {
  return <TypingAccessGate><TypingWorkspace/></TypingAccessGate>;
}
