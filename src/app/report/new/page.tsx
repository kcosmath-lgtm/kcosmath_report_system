"use client";
/* eslint-disable @next/next/no-img-element */
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dayjs from 'dayjs';
import JSZip from 'jszip';
import {
 Download,
 Menu,
 RefreshCw,
 Users,
 ClipboardCheck,
 LayoutList,
 BarChart3,
 Sparkles,
 SlidersHorizontal,
 ZoomIn,
 ZoomOut,
 Maximize2,
 X,
 Upload,
 Check,
 ArrowUp,
 ArrowDown,
 ChevronLeft,
 ChevronRight,
} from 'lucide-react';
import StudentSidebar from '../../../components/layout/Sidebar';
import LandingMenu from '../../../components/LandingMenu';
import {useAuth} from '../../../components/AuthProvider';
import {loadStudentDaily,loadWrongAnswerRange,loadProgress,saveStudentDaily,saveProgress} from '../../../lib/report-storage';
import {loadActiveAiReportTemplate,loadAiReportTemplates,saveActiveAiReportTemplate} from '../../../lib/ai-copilot';
import {reportMonths} from '../../../lib/wrong-answer-report';
import type {ReportStudent} from '../../../types/report';
import type {StudentDailyRecord} from '../../../types/student-daily';
import type {WrongAnswerRecord} from '../../../types/wrong-answer';
import type {ProgressBook,ProgressEntry} from '../../../types/progress';
import ReportSheets,{type Preview,type ReportEditHandlers} from './ReportSheets';
import {
 periodStart,
 isTemplate,
 reportCycles,
 kinds as kindLabels,
 academyQuickPresets,
 buildStructuredTemplate,
 type Kind,
 type Theme,
 type ReportCycle,
 type Template,
 type BlockSpan,
 type BlockHeight,
} from './templates';
import logo from '../../../../public/logo.png';
import styles from './report.module.css';

const ALL_KINDS: Kind[] = ['attendance', 'homework', 'wrong', 'grades', 'progress', 'feedback'];

const studioThemes:{key:Theme;label:string;Icon:typeof ClipboardCheck;badge?:string}[] = [
 {key:'saebom',label:'기본형',Icon:Sparkles,badge:'기본'},
 {key:'miricheck',label:'하늘색 체크리스트',Icon:ClipboardCheck},
 {key:'mirireport',label:'노란색 인포그래픽',Icon:LayoutList},
 {key:'mirigraph',label:'파스텔 성취도',Icon:BarChart3},
];

const SPAN_OPTIONS: { value: BlockSpan; label: string }[] = [
 { value: 4, label: '1/3칸' },
 { value: 6, label: '1/2칸' },
 { value: 8, label: '2/3칸' },
 { value: 12, label: '전체칸' },
];

const HEIGHT_OPTIONS: { value: BlockHeight; label: string }[] = [
 { value: 'sm', label: '작게' },
 { value: 'md', label: '보통' },
 { value: 'lg', label: '크게' },
];

const safeName=(value:string)=>value.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70)||'학생';

async function resizeLogoToDataUrl(file: File): Promise<{ dataUrl: string; dominantHex: string }> {
 const bitmapUrl = URL.createObjectURL(file);
 try {
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
   img.onload = () => resolve();
   img.onerror = () => reject(new Error('로고 이미지를 읽지 못했습니다.'));
   img.src = bitmapUrl;
  });
  const maxW = 320;
  const maxH = 110;
  const ratio = Math.min(1, maxW / Math.max(1, img.width), maxH / Math.max(1, img.height));
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 오류');
  ctx.drawImage(img, 0, 0, w, h);

  // Sample non-white, non-transparent pixels to extract brand color
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 16) {
   const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
   if (a < 128) continue;
   if (r > 235 && g > 235 && b > 235) continue;
   rSum += r; gSum += g; bSum += b; count++;
  }
  const hex = count > 0
   ? `#${[Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)]
      .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')}`
   : '#2563eb';

  return { dataUrl: canvas.toDataURL('image/png', 0.9), dominantHex: hex };
 } finally {
  URL.revokeObjectURL(bitmapUrl);
 }
}

export default function NewReportPage(){
 const {workspace,user}=useAuth();
 const [students,setStudents]=useState<ReportStudent[]>([]),[sidebar,setSidebar]=useState(true),[active,setActive]=useState('');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const [end,setEnd]=useState(today);
 const [cycle,setCycle]=useState<ReportCycle>('day');
 const [theme,setTheme]=useState<Theme>('saebom');
 const [orientation,setOrientation]=useState<'portrait'|'landscape'>('portrait');
 const [customTemplate,setCustomTemplate]=useState<Template|null>(null);
 const [aiTemplates,setAiTemplates]=useState<Template[]>([]);

 // 학원별 맞춤 요소 ON/OFF 및 칸 크기/브랜딩 상태
 const [enabledKinds, setEnabledKinds] = useState<Kind[]>(ALL_KINDS);
 const [showNextHomework, setShowNextHomework] = useState(true);
 const [hideEmpty, setHideEmpty] = useState(false);
 const [spanOverrides, setSpanOverrides] = useState<Partial<Record<Kind, BlockSpan>>>({
  attendance: 12,
  homework: 6,
  grades: 6,
  progress: 12,
  feedback: 12,
 });
 const [heightOverrides, setHeightOverrides] = useState<Partial<Record<Kind, BlockHeight>>>({});
 const [academyName, setAcademyName] = useState('');
 const [customTitle, setCustomTitle] = useState('');
 const [logoDataUrl, setLogoDataUrl] = useState('');
 const [logoPosition, setLogoPosition] = useState<'left'|'right'|'center'>('left');
 const [accentColor, setAccentColor] = useState('');
 const [footerNotice, setFooterNotice] = useState('');
 const [showCustomizer, setShowCustomizer] = useState(false);

 // 미리보기 확대/축소 & 전체화면 크게 보기 모달 상태
 const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
 const [largeModalOpen, setLargeModalOpen] = useState(false);
 const logoInputRef = useRef<HTMLInputElement>(null);

 const defaultPrefKey = `cosmath-academy-report-default:v1:${workspace?.id || 'local'}`;

 useEffect(() => {
  if (workspace?.name && !academyName) {
   setAcademyName(workspace.name);
  }
 }, [workspace?.name, academyName]);

 useEffect(() => {
  try {
   const savedPref = JSON.parse(localStorage.getItem(defaultPrefKey) || 'null');
   if (savedPref && typeof savedPref === 'object') {
    if (savedPref.theme) setTheme(savedPref.theme);
    if (savedPref.cycle) setCycle(savedPref.cycle);
    if (savedPref.orientation) setOrientation(savedPref.orientation);
    if (Array.isArray(savedPref.enabledKinds) && savedPref.enabledKinds.length > 0) {
     setEnabledKinds(savedPref.enabledKinds);
    }
    if (typeof savedPref.showNextHomework === 'boolean') setShowNextHomework(savedPref.showNextHomework);
    if (typeof savedPref.hideEmpty === 'boolean') setHideEmpty(savedPref.hideEmpty);
    if (savedPref.spanOverrides) setSpanOverrides(savedPref.spanOverrides);
    if (savedPref.heightOverrides) setHeightOverrides(savedPref.heightOverrides);
    if (typeof savedPref.academyName === 'string') setAcademyName(savedPref.academyName);
    if (typeof savedPref.customTitle === 'string') setCustomTitle(savedPref.customTitle);
    if (typeof savedPref.logoDataUrl === 'string') setLogoDataUrl(savedPref.logoDataUrl);
    if (savedPref.logoPosition) setLogoPosition(savedPref.logoPosition);
    if (typeof savedPref.accentColor === 'string') setAccentColor(savedPref.accentColor);
    if (typeof savedPref.footerNotice === 'string') setFooterNotice(savedPref.footerNotice);
   }
  } catch {
   // ignore storage read error
  }
 }, [defaultPrefKey]);

 const template:Template=useMemo(()=>{
  if(customTemplate){
   return {
    ...customTemplate,
    orientation,
    hideEmpty,
    showNextHomework,
    academyName: academyName || customTemplate.academyName,
    customTitle: customTitle || customTemplate.customTitle,
    logoDataUrl: logoDataUrl || customTemplate.logoDataUrl,
    logoPosition,
    accentColor: accentColor || customTemplate.accentColor,
    footerNotice: footerNotice || customTemplate.footerNotice,
   };
  }
  const built = buildStructuredTemplate({
   cycle,
   focus:'balanced',
   theme,
   orientation,
   enabledKinds,
   hideEmpty,
   showNextHomework,
   academyName,
   customTitle,
   logoDataUrl,
   logoPosition,
   accentColor,
   footerNotice,
   spanOverrides,
   heightOverrides,
  });
  // Preserve user-specified order in enabledKinds
  const orderedBlocks = enabledKinds
   .map(k => built.blocks.find(b => b.kind === k))
   .filter((b): b is NonNullable<typeof b> => Boolean(b));
  return {
   ...built,
   blocks: orderedBlocks.length > 0 ? orderedBlocks : built.blocks,
  };
 },[
  customTemplate,
  orientation,
  cycle,
  theme,
  enabledKinds,
  hideEmpty,
  showNextHomework,
  academyName,
  customTitle,
  logoDataUrl,
  logoPosition,
  accentColor,
  footerNotice,
  spanOverrides,
  heightOverrides,
 ]);

 const start=periodStart(customTemplate?.period??cycle,end,today);
 const [reports,setReports]=useState<Preview[]>([]),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);

 const selectCycle=(nextCycle:ReportCycle)=>{
  setCustomTemplate(null);
  setCycle(nextCycle);
 };

 const toggleKind = (k: Kind) => {
  setCustomTemplate(null);
  setEnabledKinds(prev => {
   if (prev.includes(k)) {
    if (prev.length <= 1) return prev; // 최소 1개 항목은 유지
    return prev.filter(item => item !== k);
   }
   return [...prev, k];
  });
 };

 const moveKindOrder = (k: Kind, dir: -1 | 1) => {
  setCustomTemplate(null);
  setEnabledKinds(prev => {
   const idx = prev.indexOf(k);
   if (idx === -1) return prev;
   const targetIdx = idx + dir;
   if (targetIdx < 0 || targetIdx >= prev.length) return prev;
   const copy = [...prev];
   const [item] = copy.splice(idx, 1);
   copy.splice(targetIdx, 0, item);
   return copy;
  });
 };

 const saveAsAcademyDefault = () => {
  try {
   localStorage.setItem(
    defaultPrefKey,
    JSON.stringify({
     theme,
     cycle,
     orientation,
     enabledKinds,
     showNextHomework,
     hideEmpty,
     spanOverrides,
     heightOverrides,
     academyName,
     customTitle,
     logoDataUrl,
     logoPosition,
     accentColor,
     footerNotice,
    })
   );
   setMessage('현재 보고서 구성(항목 ON/OFF·칸 크기·로고·테마)을 우리 학원 기본 양식으로 저장했습니다.');
  } catch {
   setMessage('브라우저 저장 공간이 부족하여 기본 양식을 저장하지 못했습니다.');
  }
 };

 const applyAiTemplate=(tpl:Template)=>{
  setCustomTemplate(tpl);
  setOrientation(tpl.orientation);
  if(tpl.period==='day'||tpl.period==='week'||tpl.period==='month')setCycle(tpl.period);
  if(tpl.theme)setTheme(tpl.theme);
  if(Array.isArray(tpl.blocks)&&tpl.blocks.length>0){
   const uniqueKinds = Array.from(new Set(tpl.blocks.map(b => b.kind)));
   setEnabledKinds(uniqueKinds);
  }
  saveActiveAiReportTemplate(tpl);
 };

 useEffect(()=>{
  const loaded=loadAiReportTemplates();
  setAiTemplates(loaded);
  if(typeof window!=='undefined'){
   const params=new URLSearchParams(window.location.search);
   if(params.get('from')==='ai-studio'){
    const activeTpl=loadActiveAiReportTemplate()??loaded[0];
    if(activeTpl){
     applyAiTemplate(activeTpl);
    }
   }
  }
  const onAiTemplate=(e:Event)=>{
   const built=(e as CustomEvent<Template>).detail;
   if(!built||!isTemplate(built))return;
   setAiTemplates(loadAiReportTemplates());
   applyAiTemplate(built);
  };
  window.addEventListener('cosmath-ai-template-updated',onAiTemplate);
  return()=>window.removeEventListener('cosmath-ai-template-updated',onAiTemplate);
 },[]);

 const pageWidth=orientation==='landscape'?1123:794,pageHeight=orientation==='landscape'?794:1123;
 const sheets=useRef<HTMLDivElement>(null);
 const [fitScale,setFitScale]=useState(1);

 useEffect(()=>{
  const canvas=sheets.current;if(!canvas)return;
  const fit=()=>{
   const css=getComputedStyle(canvas);
   const width=canvas.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
   const height=canvas.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
   const pages=Array.from(canvas.querySelectorAll<HTMLElement>('[data-active="true"] [data-sheet]'));
   const fitHeight=Math.max(pageHeight,...pages.map(page=>page.offsetHeight));
   const nextScale=Math.max(0.05,Math.floor(Math.min(1,width/pageWidth,height/fitHeight)*1000)/1000);
   setFitScale(current=>Math.abs(Math.round(current*1000)-Math.round(nextScale*1000))>1?nextScale:current);
  };
  const observer=new ResizeObserver(fit);observer.observe(canvas);
  canvas.querySelectorAll<HTMLElement>('[data-sheet]').forEach(page=>observer.observe(page));
  fit();return()=>observer.disconnect();
 },[reports,active,sidebar,pageWidth,pageHeight,template]);

 const effectiveScale = zoomMode === 'fit' ? fitScale : zoomMode;

 const select=useCallback((next:ReportStudent[])=>{setStudents(next);setActive(current=>next.some(s=>s.id===current)?current:next[0]?.id??'');},[]);

 useEffect(()=>{
  let cancelled=false;
  const months=reportMonths(start,end);
  if(!students.length||!months.length||months.length>12||start>end)return;
  async function load(){
   setLoading(true);setReports([]);setMessage('');
   try{
    const [daily,wrong]=await Promise.all([Promise.all(months.map(loadStudentDaily)),loadWrongAnswerRange(start,end,students.map(s=>s.id))]);
    const output:Preview[]=[];
    for(let offset=0;offset<students.length;offset+=4){
     const batch=await Promise.all(students.slice(offset,offset+4).map(async student=>{const progress=await loadProgress(student.id);return {...student,start,end,daily:daily.flat().filter(r=>r.student_id===student.id&&r.record_date>=start&&r.record_date<=end).sort((a,b)=>a.record_date.localeCompare(b.record_date)),wrong:wrong.filter(r=>r.student_id===student.id&&r.record_date>=start&&r.record_date<=end),books:progress.books,entries:progress.entries.filter(e=>e.record_date<=end).sort((a,b)=>a.record_date.localeCompare(b.record_date)||a.created_at.localeCompare(b.created_at))};}));
     if(cancelled)return;output.push(...batch);
    }
    if(!cancelled)setReports(output);
   }catch{if(!cancelled)setMessage('기록을 불러오지 못했습니다. 기록 새로고침으로 다시 시도해 주세요.');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[students,start,end,revision]);

 const valid=dayjs(start).isValid()&&dayjs(end).isValid()&&start<=end&&reportMonths(start,end).length>0&&reportMonths(start,end).length<=12;
 const current=reports.filter(r=>students.some(s=>s.id===r.id)&&r.start===start&&r.end===end);
 const ready=valid&&!loading&&students.length>0&&current.length===students.length;
 const activeReport = current.find(r => r.id === active) ?? current[0];
 const activeIdx = current.findIndex(r => r.id === (activeReport?.id ?? ''));

 const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
 const isSelfSavingRef = useRef(false);
 const reportsRef = useRef(reports);
 useEffect(() => {
  reportsRef.current = reports;
 }, [reports]);

 // 학생관리 탭(/students) 등 외부에서 기록이 저장되었을 때 보고서 자동 새로고침
 useEffect(() => {
  const onExternalRecordsChanged = () => {
   if (isSelfSavingRef.current) return;
   setRevision(v => v + 1);
  };
  window.addEventListener('cosmath-records-changed', onExternalRecordsChanged);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cosmath-records') : null;
  if (channel) channel.onmessage = onExternalRecordsChanged;
  return () => {
   window.removeEventListener('cosmath-records-changed', onExternalRecordsChanged);
   channel?.close();
  };
 }, []);

 // 보고서 위에서 출결·숙제·오답·진도·피드백을 클릭/입력했을 때 학생관리 DB와 상호 저장하는 핸들러
 const editHandlers: ReportEditHandlers = useMemo(() => ({
  onUpdateDailyWrong: async (studentId, recordDate, patch) => {
   const targetReport = reportsRef.current.find(r => r.id === studentId);
   if (!targetReport) return;

   const existingDaily = targetReport.daily.find(d => d.record_date === recordDate);
   const existingWrong = targetReport.wrong.find(w => w.record_date === recordDate);

   const baseDaily: StudentDailyRecord = existingDaily ?? {
    id: crypto.randomUUID(),
    student_id: studentId,
    record_date: recordDate,
    attendance: '출석',
    reason: '',
    exams: [],
    version: 0,
   };
   const baseWrong: WrongAnswerRecord = existingWrong ?? {
    id: crypto.randomUUID(),
    student_id: studentId,
    record_date: recordDate,
    total_wrong: 0,
    corrected_count: 0,
    completed: false,
    homework_status: 'O',
    memo: '',
    version: 0,
   };

   const nextTotal = patch.total_wrong !== undefined ? Math.max(0, patch.total_wrong) : baseWrong.total_wrong;
   const rawFixed = patch.corrected_count !== undefined ? Math.max(0, patch.corrected_count) : baseWrong.corrected_count;
   const nextFixed = Math.min(nextTotal, rawFixed);

   const nextDaily: StudentDailyRecord = {
    ...baseDaily,
    ...(patch.attendance !== undefined ? { attendance: patch.attendance } : {}),
    ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
   };
   const nextWrong: WrongAnswerRecord = {
    ...baseWrong,
    ...(patch.homework_status !== undefined ? { homework_status: patch.homework_status } : {}),
    total_wrong: nextTotal,
    corrected_count: nextFixed,
    completed: nextTotal > 0 && nextFixed === nextTotal,
    ...(patch.memo !== undefined ? { memo: patch.memo } : {}),
   };

   // 1) Optimistic UI update
   setReports(prev =>
    prev.map(r => {
     if (r.id !== studentId) return r;
     const nextDailyList = existingDaily
      ? r.daily.map(d => (d.record_date === recordDate ? nextDaily : d))
      : [...r.daily, nextDaily].sort((a, b) => a.record_date.localeCompare(b.record_date));
     const nextWrongList = existingWrong
      ? r.wrong.map(w => (w.record_date === recordDate ? nextWrong : w))
      : [...r.wrong, nextWrong].sort((a, b) => a.record_date.localeCompare(b.record_date));
     return { ...r, daily: nextDailyList, wrong: nextWrongList };
    })
   );

   // 2) Persist to Student Management storage
   try {
    isSelfSavingRef.current = true;
    setSyncState('saving');
    const saved = await saveStudentDaily([{ daily: nextDaily, wrong: nextWrong }]);
    if (saved[0]) {
     setReports(prev =>
      prev.map(r => {
       if (r.id !== studentId) return r;
       return {
        ...r,
        daily: r.daily.map(d => (d.record_date === recordDate ? saved[0].daily : d)),
        wrong: r.wrong.map(w => (w.record_date === recordDate ? saved[0].wrong : w)),
       };
      })
     );
    }
    setSyncState('saved');
   } catch {
    setSyncState('error');
    setMessage('변경사항 저장 중 충돌이 발생했습니다. [기록 새로고침] 후 다시 시도해 주세요.');
   } finally {
    setTimeout(() => {
     isSelfSavingRef.current = false;
    }, 150);
   }
  },

  onUpdateProgress: async (studentId, params) => {
   const targetReport = reportsRef.current.find(r => r.id === studentId);
   if (!targetReport) return;

   const existingBook =
    (params.bookId ? targetReport.books.find(b => b.id === params.bookId) : undefined) ??
    targetReport.books.find(b => !b.archived) ??
    targetReport.books[0];

   const baseBook: ProgressBook = existingBook ?? {
    id: crypto.randomUUID(),
    student_id: studentId,
    title: params.newBookTitle || '개념원리 공통수학',
    curriculum: '2022 개정',
    course: '공통수학',
    units: [{ id: 'u1', group: '전범위', name: '수업 진도' }],
    states: { u1: '진행 중' },
    version: 0,
    total_pages: params.totalPages ?? 100,
    completed_page: params.completedPage ?? 0,
    archived: false,
   };

   const nextTotalPages = params.totalPages !== undefined ? params.totalPages : (baseBook.total_pages ?? 100);
   const nextDonePages =
    params.completedPage !== undefined
     ? Math.max(0, Math.min(nextTotalPages || 10000, params.completedPage))
     : (baseBook.completed_page ?? 0);

   const nextBook: ProgressBook = {
    ...baseBook,
    total_pages: nextTotalPages,
    completed_page: nextDonePages,
   };

   const existingEntry =
    (params.entryId ? targetReport.entries.find(e => e.id === params.entryId) : undefined) ??
    targetReport.entries.find(e => e.book_id === nextBook.id && e.record_date === params.recordDate);

   const nextEntry: ProgressEntry = {
    id: existingEntry?.id ?? crypto.randomUUID(),
    book_id: nextBook.id,
    record_date: params.recordDate,
    unit_ids: existingEntry?.unit_ids ?? nextBook.units.slice(0, 1).map(u => u.id),
    scope: params.scope !== undefined ? params.scope : (existingEntry?.scope ?? ''),
    homework: params.homework !== undefined ? params.homework : (existingEntry?.homework ?? ''),
    due_date: params.dueDate !== undefined ? params.dueDate : (existingEntry?.due_date ?? null),
    memo: params.memo !== undefined ? params.memo : (existingEntry?.memo ?? ''),
    states: nextBook.states,
    created_at: existingEntry?.created_at || new Date().toISOString(),
    units_snapshot: nextBook.units,
    total_pages_snapshot: nextTotalPages,
    completed_page: nextDonePages,
   };

   // Optimistic update
   setReports(prev =>
    prev.map(r => {
     if (r.id !== studentId) return r;
     const nextBooks = existingBook
      ? r.books.map(b => (b.id === nextBook.id ? nextBook : b))
      : [...r.books, nextBook];
     const nextEntries = existingEntry
      ? r.entries.map(e => (e.id === nextEntry.id ? nextEntry : e))
      : [...r.entries, nextEntry];
     return { ...r, books: nextBooks, entries: nextEntries };
    })
   );

   try {
    isSelfSavingRef.current = true;
    setSyncState('saving');
    const saved = await saveProgress(nextBook, {
     ...nextEntry,
     // cosmath_save_progress inserts a new snapshot entry id on each save in SQL
     id: crypto.randomUUID(),
    });
    setReports(prev =>
     prev.map(r => {
      if (r.id !== studentId) return r;
      const nextBooks = r.books.some(b => b.id === saved.book.id)
       ? r.books.map(b => (b.id === saved.book.id ? saved.book : b))
       : [...r.books, saved.book];
      const filteredEntries = r.entries.filter(e => e.id !== nextEntry.id);
      return {
       ...r,
       books: nextBooks,
       entries: saved.entry ? [...filteredEntries, saved.entry] : r.entries,
      };
     })
    );
    setSyncState('saved');
   } catch {
    setSyncState('error');
    setMessage('진도 기록 저장 중 오류가 발생했습니다. [기록 새로고침] 후 다시 시도해 주세요.');
   } finally {
    setTimeout(() => {
     isSelfSavingRef.current = false;
    }, 150);
   }
  },

  onUpdateComment: async (studentId, commentId, newText, fallbackDate) => {
   const targetReport = reportsRef.current.find(r => r.id === studentId);
   if (!targetReport) return;

   if (commentId.startsWith('wrong-')) {
    await editHandlers.onUpdateDailyWrong(studentId, fallbackDate, { memo: newText });
    return;
   }
   if (commentId.startsWith('att-')) {
    await editHandlers.onUpdateDailyWrong(studentId, fallbackDate, { reason: newText });
    return;
   }
   if (commentId.startsWith('entry-')) {
    const rawEntryId = commentId.replace(/^entry-/, '');
    const foundEntry = targetReport.entries.find(e => e.id === rawEntryId);
    if (foundEntry) {
     await editHandlers.onUpdateProgress(studentId, {
      bookId: foundEntry.book_id,
      entryId: foundEntry.id,
      recordDate: foundEntry.record_date,
      memo: newText,
     });
     return;
    }
   }
   await editHandlers.onUpdateDailyWrong(studentId, fallbackDate, { memo: newText });
  },
 }), []);

 const snapshotKey=`cosmath-daily-snapshot:v2:${workspace?.id}:${user?.id}:${start}:${end}`;
 function saveReports(){try{localStorage.setItem(snapshotKey,JSON.stringify({version:1,reports:current,template}));setMessage(`${current.length}명 보고서를 현재 브라우저에 저장했습니다. 원본 수업 기록은 변경되지 않습니다.`);}catch{setMessage('브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 이미지 일괄 저장을 이용해 주세요.');}}
 function loadSaved(){
  try{
   const value=JSON.parse(localStorage.getItem(snapshotKey)||'null');
   if(value?.version!==1||!Array.isArray(value.reports))throw new Error();
   const saved=value.reports.filter((r:Preview)=>students.some(s=>s.id===r.id)&&r.start===start&&r.end===end&&[r.daily,r.wrong,r.books,r.entries].every(Array.isArray));
   if(saved.length!==students.length)throw new Error();
   setReports(saved);
   if(isTemplate(value.template)){
    if(value.template.period==='day'||value.template.period==='week'||value.template.period==='month')setCycle(value.template.period);
    if(value.template.theme)setTheme(value.template.theme);
    setOrientation(value.template.orientation);
   }
   setMessage('저장된 보고서를 불러왔습니다. 저장 시점의 기록입니다.');
  }catch{
   setMessage('이 기간과 선택한 학생의 저장본을 찾을 수 없습니다.');
  }
 }
 async function exportAll(){
  if(!ready||exporting)return;setExporting(true);setMessage('이미지를 준비하고 있습니다.');
  try{
   await document.fonts.ready;
   const {toBlob}=await import('html-to-image');const zip=new JSZip();
   const nodes=Array.from(sheets.current?.querySelectorAll<HTMLElement>('[data-report]')??[]);
   if(nodes.length!==students.length)throw new Error('Missing reports');
   let completed=0;const total=nodes.reduce((n,node)=>n+node.querySelectorAll('[data-sheet]').length,0);
   for(const node of nodes){const report=current.find(r=>r.id===node.dataset.report);if(!report)throw new Error('Missing student');const pages=Array.from(node.querySelectorAll<HTMLElement>('[data-sheet]'));
    for(let index=0;index<pages.length;index++){
     await Promise.all(Array.from(pages[index].querySelectorAll('img')).map(img=>img.decode()));
     const blob=await toBlob(pages[index],{pixelRatio:2,width:pageWidth,height:pages[index].offsetHeight,style:{zoom:'1'},backgroundColor:'#ffffff',cacheBust:false});if(!blob)throw new Error('Image failed');
     zip.file(`${safeName(report.group)}_${safeName(report.name)}_${safeName(report.id)}/${String(index+1).padStart(2,'0')}_${end}_${orientation}.png`,blob);
     completed++;setMessage(`이미지 생성 중 ${completed} / ${total}`);
    }
   }
   const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${reportCycles[cycle].label.replace(/\s+/g,'')}_${end}_${current.length}명_${orientation}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage(`${current.length}명 · ${completed}장의 이미지를 ZIP으로 저장했습니다.`);
  }catch{setMessage('이미지 일괄 저장에 실패했습니다. 파일은 저장되지 않았습니다. 다시 시도해 주세요.');}finally{setExporting(false);}
 }

 return <main className={styles.workspace} data-orientation={orientation} style={{'--report-width':`${pageWidth}px`,'--report-height':`${pageHeight}px`} as CSSProperties}>
  <StudentSidebar isOpen={sidebar} onClose={()=>setSidebar(false)} onBatchSelect={select} disabled={exporting}/>
  <div className={styles.main}>
   <header className={styles.workspaceHeader}>
    <div>
     {!sidebar&&<button aria-label="학생 목록 열기" onClick={()=>setSidebar(true)}><Menu size={20}/></button>}
     <Link href="/" aria-label="UNIDESK 홈"><Image src={logo} alt="UNIDESK" width={150} priority/></Link>
     <div>
      <h1>{reportCycles[cycle].label} <small>(new)</small></h1>
      <span>{reportCycles[cycle].badge}</span>
     </div>
    </div>
    <LandingMenu/>
   </header>

   <div className={styles.workspaceToolbar}>
    <div className={styles.range}>
     <label>기준 날짜<input type="date" value={end} disabled={exporting} onChange={e=>setEnd(e.target.value)}/></label>
     <span className={styles.rangeBadge}>조회 기간: {start===end?end:`${start} ~ ${end}`}</span>
     <button disabled={loading||exporting||!students.length} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/> 기록 새로고침</button>
     <span
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:5,
       padding:'4px 10px',
       borderRadius:999,
       fontSize:11,
       fontWeight:800,
       background:syncState==='saving'?'#fef3c7':syncState==='saved'?'#dcfce7':'#eff6ff',
       color:syncState==='saving'?'#b45309':syncState==='saved'?'#166534':'#1d4ed8',
       border:`1px solid ${syncState==='saving'?'#fde68a':syncState==='saved'?'#bbf7d0':'#bfdbfe'}`,
      }}
      title="보고서에서 출석·숙제·오답·진도·피드백을 클릭하거나 입력하면 학생관리 탭과 실시간 상호 저장됩니다."
     >
      {syncState==='saving'?'⏳ 학생관리 저장 중...':syncState==='saved'?'✅ 학생관리 저장 완료':'🔗 보고서 직접 편집 · 학생관리 실시간 연동'}
     </span>
    </div>

    <div className={styles.toolbarActions}>
     {/* 미리보기 배율 및 크게 보기 컨트롤 */}
     <div style={{display:'inline-flex',alignItems:'center',gap:4,background:'#f1f5f9',padding:'3px 5px',borderRadius:9,border:'1px solid #dbe5f2'}}>
      <button
       type="button"
       title="축소"
       onClick={()=>setZoomMode(prev => Math.max(0.5, Number(((prev === 'fit' ? fitScale : prev) - 0.15).toFixed(2))))}
       style={{padding:'5px 7px',border:0,background:'transparent'}}
      >
       <ZoomOut size={14}/>
      </button>
      <button
       type="button"
       onClick={()=>setZoomMode('fit')}
       style={{padding:'4px 8px',fontSize:11,fontWeight:700,border:0,borderRadius:6,background:zoomMode==='fit'?'#ffffff':'transparent',color:zoomMode==='fit'?'#1d4ed8':'#475569'}}
      >
       화면맞춤 ({Math.round(fitScale*100)}%)
      </button>
      <button
       type="button"
       onClick={()=>setZoomMode(1)}
       style={{padding:'4px 8px',fontSize:11,fontWeight:700,border:0,borderRadius:6,background:zoomMode===1?'#ffffff':'transparent',color:zoomMode===1?'#1d4ed8':'#475569'}}
      >
       100%
      </button>
      <button
       type="button"
       onClick={()=>setZoomMode(1.2)}
       style={{padding:'4px 8px',fontSize:11,fontWeight:700,border:0,borderRadius:6,background:zoomMode===1.2?'#ffffff':'transparent',color:zoomMode===1.2?'#1d4ed8':'#475569'}}
      >
       120%
      </button>
      <button
       type="button"
       title="확대"
       onClick={()=>setZoomMode(prev => Math.min(1.6, Number(((prev === 'fit' ? fitScale : prev) + 0.15).toFixed(2))))}
       style={{padding:'5px 7px',border:0,background:'transparent'}}
      >
       <ZoomIn size={14}/>
      </button>
      <button
       type="button"
       disabled={!activeReport}
       onClick={()=>setLargeModalOpen(true)}
       style={{padding:'5px 10px',fontSize:11.5,fontWeight:800,border:'1px solid #1e40af',borderRadius:7,background:'#1e40af',color:'#ffffff'}}
      >
       <Maximize2 size={13}/> 크게 미리보기
      </button>
     </div>

     <label className={styles.orientation}>
      보고서 방향
      <select aria-label="보고서 방향" value={orientation} disabled={exporting} onChange={e=>setOrientation(e.target.value as 'portrait'|'landscape')}>
       <option value="portrait">세로형</option>
       <option value="landscape">가로형</option>
      </select>
     </label>
     <button disabled={!students.length||loading||exporting||!valid} onClick={loadSaved}>저장본 불러오기</button>
     <button disabled={!ready||exporting} onClick={saveReports}>보고서 저장</button>
     <button disabled={!ready||exporting} onClick={()=>window.print()}>PDF 저장</button>
     <button className={styles.batchDownload} disabled={!ready||exporting} onClick={()=>void exportAll()}>
      <Download size={16}/>{exporting?'이미지 생성 중…':`이미지 일괄 저장${students.length?` (${students.length}명)`:''}`}
     </button>
    </div>
   </div>

   <section className={styles.presetBar} aria-label="보고서 템플릿 설정">
    <div className={styles.presetGroup}>
     <span className={styles.presetLabel}>템플릿 스타일</span>
     <div className={styles.segmented} role="group" aria-label="템플릿 분위기 선택">
      {studioThemes.map(({key,label,Icon,badge})=>(
       <button key={key} type="button" disabled={exporting} aria-pressed={!customTemplate&&theme===key} onClick={()=>{setCustomTemplate(null);setTheme(key);}} className={styles.themeTabBtn}>
        <Icon size={14}/>
        {label}
        {badge&&<span style={{fontSize:9.5,fontWeight:800,padding:'1px 5px',borderRadius:999,background:'#dcfce7',color:'#15803d'}}>{badge}</span>}
       </button>
      ))}
     </div>
    </div>

    <div className={styles.presetDivider} aria-hidden="true"/>

    <div className={styles.presetGroup}>
     <span className={styles.presetLabel}>보고 주기</span>
     <div className={styles.segmented} role="group" aria-label="보고 주기 선택">
      {(Object.entries(reportCycles) as [ReportCycle,typeof reportCycles[ReportCycle]][]).map(([key,item])=>(
       <button key={key} type="button" disabled={exporting} aria-pressed={!customTemplate&&cycle===key} onClick={()=>selectCycle(key)} title={item.desc}>
        {item.label}
       </button>
      ))}
     </div>
    </div>

    <div className={styles.presetDivider} aria-hidden="true"/>

    {/* 1초 항목 ON/OFF 체크칩 & 빠른 학원 프리셋 */}
    <div className={styles.presetGroup}>
     <span className={styles.presetLabel}>포함 요소</span>
     <div className={styles.kindPills} role="group" aria-label="보고서 포함 요소 선택">
      {ALL_KINDS.map(k => {
       const on = enabledKinds.includes(k);
       return (
        <button
         key={k}
         type="button"
         disabled={exporting}
         aria-pressed={on}
         onClick={() => toggleKind(k)}
         className={styles.kindPill}
         title={`${kindLabels[k]} 영역 표시/숨김`}
        >
         {on ? '✓ ' : '+ '}{kindLabels[k]}
        </button>
       );
      })}
      <button
       type="button"
       disabled={exporting}
       aria-pressed={showNextHomework}
       onClick={() => setShowNextHomework(v => !v)}
       className={styles.kindPill}
      >
       {showNextHomework ? '✓ ' : '+ '}다음과제
      </button>
      <button
       type="button"
       disabled={exporting}
       aria-pressed={hideEmpty}
       onClick={() => setHideEmpty(v => !v)}
       className={styles.kindPill}
       title="해당 학생에게 기록이 없는 항목(예: 미응시 시험, 오답 0건)을 자동으로 숨깁니다"
      >
       {hideEmpty ? '✓ ' : ''}빈 항목 자동숨김
      </button>
     </div>
    </div>

    <div className={styles.presetGroupRight}>
     <button
      type="button"
      onClick={() => setShowCustomizer(v => !v)}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       height:34,
       padding:'0 12px',
       borderRadius:10,
       border:showCustomizer?'1.5px solid #2563eb':'1px solid #cbd5e1',
       background:showCustomizer?'#eff6ff':'#ffffff',
       color:showCustomizer?'#1d4ed8':'#1e293b',
       fontSize:12,
       fontWeight:700,
       cursor:'pointer',
      }}
     >
      <SlidersHorizontal size={13}/> 칸 크기 · 로고 · 문구 설정 {showCustomizer ? '▲' : '▼'}
     </button>

     {aiTemplates.length>0&&(
      <select
       aria-label="AI 스튜디오 템플릿 선택"
       disabled={exporting}
       value={customTemplate?.id??''}
       onChange={e=>{
        const found=aiTemplates.find(t=>t.id===e.target.value);
        if(found)applyAiTemplate(found);
        else setCustomTemplate(null);
       }}
       style={{height:34,borderRadius:10,border:'1px solid #cbd5e1',padding:'0 10px',fontSize:12,fontWeight:600,background:customTemplate?'#eff6ff':'#ffffff',color:customTemplate?'#1d4ed8':'#334155'}}
      >
       <option value="">저장된 AI 템플릿 ({aiTemplates.length})</option>
       {aiTemplates.map(t=>(
        <option key={t.id} value={t.id}>{t.name}</option>
       ))}
      </select>
     )}
     <Link
      href="/ai-studio?mode=report"
      style={{display:'inline-flex',alignItems:'center',gap:6,height:34,padding:'0 12px',borderRadius:10,background:'#0f172a',color:'#ffffff',fontSize:12,fontWeight:700,textDecoration:'none'}}
     >
      <Sparkles size={13}/> AI 템플릿 스튜디오 ↗
     </Link>
    </div>
   </section>

   {/* 상세 커스터마이저 드로어 (칸 비율 조절 · 순서 변경 · 학원 로고 · 문구 · 기본값 저장) */}
   {showCustomizer && (
    <section className={styles.templateEditor} aria-label="보고서 상세 커스텀 설정">
     <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:20,alignItems:'start'}}>
      {/* 좌측: 학원별 빠른 프리셋 & 요소별 칸 너비/세로 크기/순서 조절 */}
      <div>
       <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8}}>
        <strong style={{fontSize:13,color:'#0f172a'}}>1. 요소별 칸 크기(너비·분량) 및 배치 순서 조절</strong>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
         {academyQuickPresets.map(preset => (
          <button
           key={preset.id}
           type="button"
           onClick={() => {
            setCustomTemplate(null);
            setEnabledKinds(preset.kinds);
            setShowNextHomework(preset.showNextHomework);
           }}
           style={{padding:'4px 9px',fontSize:11,fontWeight:700,borderRadius:999,border:'1px solid #cbd5e1',background:'#ffffff'}}
           title={preset.desc}
          >
           ⚡ {preset.label}
          </button>
         ))}
        </div>
       </div>

       <div style={{display:'grid',gap:6}}>
        {enabledKinds.map((k, idx) => {
         const curSpan = spanOverrides[k] ?? (k === 'attendance' || k === 'progress' || k === 'feedback' ? 12 : 6);
         const curHeight = heightOverrides[k] ?? 'md';
         return (
          <div
           key={k}
           style={{
            display:'flex',
            alignItems:'center',
            justifyContent:'space-between',
            gap:8,
            padding:'7px 10px',
            background:'#ffffff',
            border:'1px solid #dbe5f2',
            borderRadius:8,
            flexWrap:'wrap',
           }}
          >
           <div style={{display:'flex',alignItems:'center',gap:6,minWidth:110}}>
            <span style={{fontSize:11,fontWeight:800,color:'#2563eb',width:18}}>{idx + 1}.</span>
            <strong style={{fontSize:12.5,color:'#1e293b'}}>{kindLabels[k]}</strong>
            <button
             type="button"
             disabled={idx === 0}
             onClick={() => moveKindOrder(k, -1)}
             title="위로 이동"
             style={{padding:'2px 5px'}}
            >
             <ArrowUp size={12}/>
            </button>
            <button
             type="button"
             disabled={idx === enabledKinds.length - 1}
             onClick={() => moveKindOrder(k, 1)}
             title="아래로 이동"
             style={{padding:'2px 5px'}}
            >
             <ArrowDown size={12}/>
            </button>
           </div>

           <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:3}}>
             <span style={{fontSize:11,color:'#64748b',marginRight:3}}>가로칸:</span>
             {SPAN_OPTIONS.map(opt => (
              <button
               key={opt.value}
               type="button"
               onClick={() => setSpanOverrides(prev => ({ ...prev, [k]: opt.value }))}
               style={{
                padding:'3px 7px',
                fontSize:11,
                fontWeight:curSpan === opt.value ? 800 : 500,
                background:curSpan === opt.value ? '#1e40af' : '#f8fafc',
                color:curSpan === opt.value ? '#ffffff' : '#475569',
                border:curSpan === opt.value ? '1px solid #1e40af' : '1px solid #cbd5e1',
                borderRadius:6,
               }}
              >
               {opt.label}
              </button>
             ))}
            </div>

            <div style={{display:'inline-flex',alignItems:'center',gap:3}}>
             <span style={{fontSize:11,color:'#64748b',marginRight:3}}>세로분량:</span>
             {HEIGHT_OPTIONS.map(opt => (
              <button
               key={opt.value}
               type="button"
               onClick={() => setHeightOverrides(prev => ({ ...prev, [k]: opt.value }))}
               style={{
                padding:'3px 7px',
                fontSize:11,
                fontWeight:curHeight === opt.value ? 800 : 500,
                background:curHeight === opt.value ? '#0f766e' : '#f8fafc',
                color:curHeight === opt.value ? '#ffffff' : '#475569',
                border:curHeight === opt.value ? '1px solid #0f766e' : '1px solid #cbd5e1',
                borderRadius:6,
               }}
              >
               {opt.label}
              </button>
             ))}
            </div>
           </div>
          </div>
         );
        })}
       </div>
      </div>

      {/* 우측: 학원 로고 업로드 · 학원명/제목 · 포인트 컬러 · 하단 공지 · 기본값 저장 */}
      <div style={{display:'flex',flexDirection:'column',gap:10,background:'#ffffff',padding:12,borderRadius:10,border:'1px solid #dbe5f2'}}>
       <strong style={{fontSize:13,color:'#0f172a'}}>2. 우리 학원 로고 · 타이틀 · 테마 색상 · 공지란</strong>

       <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <input
         ref={logoInputRef}
         type="file"
         accept="image/*"
         hidden
         onChange={async e => {
          const f = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!f) return;
          try {
           const { dataUrl, dominantHex } = await resizeLogoToDataUrl(f);
           setLogoDataUrl(dataUrl);
           if (!accentColor) setAccentColor(dominantHex);
           setMessage('학원 로고를 적용하고 대표 브랜드 색상을 추출했습니다.');
          } catch {
           setMessage('로고 이미지를 불러오지 못했습니다.');
          }
         }}
        />
        <button
         type="button"
         onClick={() => logoInputRef.current?.click()}
         style={{display:'inline-flex',alignItems:'center',gap:6,padding:'6px 11px',fontWeight:700,background:'#f8fafc'}}
        >
         <Upload size={13}/> {logoDataUrl ? '학원 로고 변경' : '학원 로고 업로드'}
        </button>
        {logoDataUrl && (
         <>
          <img src={logoDataUrl} alt="학원 로고 미리보기" style={{height:28,width:'auto',objectFit:'contain',border:'1px solid #e2e8f0',borderRadius:4,padding:2,background:'#fff'}}/>
          <select
           value={logoPosition}
           onChange={e => setLogoPosition(e.target.value as 'left'|'right'|'center')}
           aria-label="로고 위치"
          >
           <option value="left">로고 좌측</option>
           <option value="right">로고 우측</option>
          </select>
          <button type="button" onClick={() => setLogoDataUrl('')} style={{padding:'5px 8px',color:'#dc2626'}}>
           로고 삭제
          </button>
         </>
        )}
       </div>

       <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr auto',gap:8,alignItems:'center'}}>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>학원명 표기</span>
         <input
          value={academyName}
          onChange={e => setAcademyName(e.target.value)}
          placeholder="예: 코스매스 수학학원"
          style={{maxWidth:'none',width:'100%'}}
         />
        </label>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>보고서 상단 제목 (비우면 자동)</span>
         <input
          value={customTitle}
          onChange={e => setCustomTitle(e.target.value)}
          placeholder="예: 11월 수학 성취도 종합 리포트"
          style={{maxWidth:'none',width:'100%'}}
         />
        </label>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>포인트 색상</span>
         <div style={{display:'flex',alignItems:'center',gap:4}}>
          <input
           type="color"
           value={accentColor || (theme === 'saebom' ? '#2563eb' : '#2b6cb0')}
           onChange={e => setAccentColor(e.target.value)}
           style={{width:34,height:32,padding:2,cursor:'pointer'}}
          />
          {accentColor && (
           <button type="button" onClick={() => setAccentColor('')} style={{padding:'5px 7px',fontSize:11}}>
            기본색
           </button>
          )}
         </div>
        </label>
       </div>

       <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
        <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>하단 학원 안내 / 가정통신 한 줄 공지 (비우면 숨김)</span>
        <input
         value={footerNotice}
         onChange={e => setFooterNotice(e.target.value)}
         placeholder="예: 다음 주 월요일은 정기 모의평가가 진행됩니다. · 문의: 02-000-0000"
         style={{maxWidth:'none',width:'100%'}}
        />
       </label>

       <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:2}}>
        <button
         type="button"
         onClick={saveAsAcademyDefault}
         style={{
          display:'inline-flex',
          alignItems:'center',
          gap:6,
          background:'#15803d',
          color:'#ffffff',
          borderColor:'#15803d',
          fontWeight:800,
          padding:'7px 14px',
         }}
        >
         <Check size={14}/> 우리 학원 기본 양식으로 저장
        </button>
       </div>
      </div>
     </div>
    </section>
   )}

   {!valid&&<p role="alert" className={styles.message}>시작일과 종료일을 확인해 주세요. 한 번에 최대 12개 월의 기록을 조회할 수 있습니다.</p>}
   {message&&<p role="status" className={styles.message}>{message}</p>}
   {students.length>0&&(
    <nav aria-label="보고서 학생 선택" className={styles.studentTabs}>
     {students.map(s=>(
      <button key={s.id} aria-label={`${s.name} 보고서`} disabled={exporting} aria-pressed={active===s.id} onClick={()=>setActive(s.id)}>
       {s.name}<small>{s.grade}</small>
      </button>
     ))}
     <span>이미지 저장 시 선택한 학생 전체를 포함합니다.</span>
    </nav>
   )}

   <div className={styles.workspaceCanvas} ref={sheets} style={{'--preview-scale':effectiveScale} as CSSProperties}>
    {!students.length?(
     <div className={styles.welcome}>
      <Users size={38}/>
      <span>READY TO WRITE</span>
      <h2>학생의 성장 기록을 만나볼까요?</h2>
      <p>왼쪽 목록에서 학생이나 반을 선택하면<br/>저장된 기록으로 보고서가 자동 생성됩니다.</p>
     </div>
    ):loading?(
     <p role="status" className={styles.welcome}>선택한 {students.length}명의 보고서를 불러오는 중…</p>
    ):(
     current.map(report=>(
      <div key={report.id} data-report={report.id} data-active={active===report.id} className={styles.reportStack}>
       <ReportSheets preview={report} template={template} onEdit={editHandlers}/>
      </div>
     ))
    )}
   </div>

   {/* 전체화면 크게 미리보기 모달 */}
   {largeModalOpen && activeReport && (
    <div
     role="dialog"
     aria-modal="true"
     aria-label="보고서 크게 미리보기"
     style={{
      position:'fixed',
      inset:0,
      zIndex:100,
      background:'rgba(15, 23, 42, 0.78)',
      backdropFilter:'blur(4px)',
      display:'flex',
      flexDirection:'column',
     }}
    >
     <div
      style={{
       height:58,
       background:'#0f172a',
       color:'#ffffff',
       display:'flex',
       alignItems:'center',
       justifyContent:'space-between',
       padding:'0 24px',
       flexShrink:0,
      }}
     >
      <div style={{display:'flex',alignItems:'center',gap:12}}>
       <strong style={{fontSize:15}}>
        🔍 크게 미리보기 — {activeReport.name} ({activeReport.grade} · {activeReport.group})
       </strong>
       {current.length > 1 && (
        <div style={{display:'inline-flex',alignItems:'center',gap:6,marginLeft:10}}>
         <button
          type="button"
          disabled={activeIdx <= 0}
          onClick={() => activeIdx > 0 && setActive(current[activeIdx - 1].id)}
          style={{padding:'4px 10px',borderRadius:6,border:'1px solid #334155',background:'#1e293b',color:'#fff',fontSize:12,cursor:'pointer'}}
         >
          <ChevronLeft size={13}/> 이전 학생
         </button>
         <span style={{fontSize:12,color:'#94a3b8'}}>{activeIdx + 1} / {current.length}</span>
         <button
          type="button"
          disabled={activeIdx >= current.length - 1}
          onClick={() => activeIdx < current.length - 1 && setActive(current[activeIdx + 1].id)}
          style={{padding:'4px 10px',borderRadius:6,border:'1px solid #334155',background:'#1e293b',color:'#fff',fontSize:12,cursor:'pointer'}}
         >
          다음 학생 <ChevronRight size={13}/>
         </button>
        </div>
       )}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:10}}>
       <button
        type="button"
        onClick={() => window.print()}
        style={{padding:'6px 14px',borderRadius:8,border:'1px solid #475569',background:'#1e293b',color:'#ffffff',fontSize:12.5,fontWeight:700,cursor:'pointer'}}
       >
        인쇄 / PDF 저장
       </button>
       <button
        type="button"
        onClick={() => setLargeModalOpen(false)}
        aria-label="크게 미리보기 닫기"
        style={{padding:'6px 12px',borderRadius:8,border:0,background:'#ef4444',color:'#ffffff',fontSize:12.5,fontWeight:800,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
       >
        <X size={15}/> 닫기 (ESC)
       </button>
      </div>
     </div>

     <div
      onClick={e => {
       if (e.target === e.currentTarget) setLargeModalOpen(false);
      }}
      style={{
       flex:1,
       overflow:'auto',
       padding:'32px 24px 60px',
       display:'flex',
       justifyContent:'center',
       alignItems:'flex-start',
      }}
     >
      <div style={{ '--preview-scale': 1.15, width: pageWidth * 1.15 } as CSSProperties}>
       <div style={{ zoom: 1.15 } as CSSProperties}>
        <ReportSheets preview={activeReport} template={template} onEdit={editHandlers}/>
       </div>
      </div>
     </div>
    </div>
   )}
  </div>
 </main>;
}
