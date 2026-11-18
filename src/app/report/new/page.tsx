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
 MessageSquareText,
 AlignLeft,
 AlignCenter,
 AlignRight,
 Send,
} from 'lucide-react';
import StudentSidebar from '../../../components/layout/Sidebar';
import LandingMenu from '../../../components/LandingMenu';
import {useAuth} from '../../../components/AuthProvider';
import {loadStudentDaily,loadWrongAnswerRange,loadProgress,saveWrongAnswer,saveProgress} from '../../../lib/report-storage';
import {reportMonths} from '../../../lib/wrong-answer-report';
import type {ReportStudent} from '../../../types/report';
import {syncUnitStatesFromPage,type ProgressBook,type ProgressEntry} from '../../../types/progress';
import ReportSheets,{type Preview,type HeaderPatch} from './ReportSheets';
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
 type TitlePosition,
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

 // 학원별 맞춤 요소 ON/OFF 및 칸 크기/브랜딩 상태
 const [enabledKinds, setEnabledKinds] = useState<Kind[]>(ALL_KINDS);
 const [showNextHomework, setShowNextHomework] = useState(true);
 const [showMonthlyCompetency, setShowMonthlyCompetency] = useState(true);
 const [hideEmpty, setHideEmpty] = useState(false);
 const [spanOverrides, setSpanOverrides] = useState<Partial<Record<Kind, BlockSpan>>>({});
 const [heightOverrides, setHeightOverrides] = useState<Partial<Record<Kind, BlockHeight>>>({});
 const [academyName, setAcademyName] = useState('');
 const [customTitle, setCustomTitle] = useState<string | undefined>(undefined);
 const [customBadge, setCustomBadge] = useState<string | undefined>(undefined);
 const [customSubTitle, setCustomSubTitle] = useState<string | undefined>(undefined);
 const [titlePosition, setTitlePosition] = useState<TitlePosition>('left');
 const [logoDataUrl, setLogoDataUrl] = useState('');
 const [logoPosition, setLogoPosition] = useState<'left'|'right'|'center'>('left');
 const [logoSize, setLogoSize] = useState<number>(42);
 const [accentColor, setAccentColor] = useState('');
 const [footerNotice, setFooterNotice] = useState('');
 const [showCustomizer, setShowCustomizer] = useState(false);

 const defaultBadgeText =
  cycle === 'day' ? 'DAILY REPORT' : cycle === 'week' ? 'WEEKLY REPORT' : 'MONTHLY REPORT';
 const periodKorText = cycle === 'week' ? '주간' : cycle === 'month' ? '월간' : '일일';
 const defaultSubTitleText = academyName.trim()
  ? `${academyName.trim()} · ${periodKorText} 리포트`
  : `${periodKorText} 리포트`;
 const titlePrefixText = academyName.trim() ? `${academyName.trim()} ` : '';
 const defaultTitleText =
  cycle === 'day'
   ? `${titlePrefixText}일일 수업 결과 리포트`
   : cycle === 'week'
     ? `${titlePrefixText}주간 학습 성취 리포트`
     : `${titlePrefixText}월간 종합 평가 리포트`;

 const handleEditHeader = useCallback((patch: HeaderPatch) => {
  if (patch.customTitle !== undefined) setCustomTitle(patch.customTitle);
  if (patch.customBadge !== undefined) setCustomBadge(patch.customBadge);
  if (patch.customSubTitle !== undefined) setCustomSubTitle(patch.customSubTitle);
  if (patch.titlePosition !== undefined) setTitlePosition(patch.titlePosition);
 }, []);

 // 다중 학생 일괄 피드백 코멘트 작성 상태
 const [bulkFeedbackText, setBulkFeedbackText] = useState('');
 const [bulkFeedbackTargets, setBulkFeedbackTargets] = useState<string[]>([]);
 const [showBulkFeedbackBar, setShowBulkFeedbackBar] = useState(false);

 // 미리보기 확대/축소 & 전체화면 크게 보기 모달 상태
 const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
 const [largeModalOpen, setLargeModalOpen] = useState(false);
 const logoInputRef = useRef<HTMLInputElement>(null);

 // 카카오톡 자동 발송 모달 및 설정 상태
 const [kakaoModalOpen, setKakaoModalOpen] = useState(false);
 const [kakaoTargets, setKakaoTargets] = useState<string[]>([]);
 const [kakaoSearchTemplate, setKakaoSearchTemplate] = useState<string>('{name}');
 const [kakaoTabMode, setKakaoTabMode] = useState<'friends' | 'chats'>('friends');
 const [kakaoDelay, setKakaoDelay] = useState<number>(1.0);
 const [kakaoAliases, setKakaoAliases] = useState<Record<string, string>>({});
 const [kakaoBridgeAlive, setKakaoBridgeAlive] = useState<boolean>(false);
 const [kakaoSending, setKakaoSending] = useState<boolean>(false);
 const [kakaoLogs, setKakaoLogs] = useState<string[]>([]);
 const [kakaoResults, setKakaoResults] = useState<{studentId:string;name:string;searchTerm:string;success:boolean;message:string}[]>([]);

 const kakaoAliasStorageKey = `cosmath-kakao-alias:v1:${workspace?.id || 'local'}`;
 useEffect(() => {
  try {
   const saved = JSON.parse(localStorage.getItem(kakaoAliasStorageKey) || '{}');
   if (saved && typeof saved === 'object') setKakaoAliases(saved);
  } catch {
   // ignore
  }
 }, [kakaoAliasStorageKey]);

 const updateKakaoAlias = useCallback((studentId: string, alias: string) => {
  setKakaoAliases(prev => {
   const next = { ...prev, [studentId]: alias };
   try {
    localStorage.setItem(kakaoAliasStorageKey, JSON.stringify(next));
   } catch {
    // ignore
   }
   return next;
  });
 }, [kakaoAliasStorageKey]);

 const defaultPrefKey = `cosmath-academy-report-default:v1:${workspace?.id || 'local'}`;

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
    if (typeof savedPref.showMonthlyCompetency === 'boolean') setShowMonthlyCompetency(savedPref.showMonthlyCompetency);
    if (typeof savedPref.hideEmpty === 'boolean') setHideEmpty(savedPref.hideEmpty);
    if (savedPref.spanOverrides) setSpanOverrides(savedPref.spanOverrides);
    if (savedPref.heightOverrides) setHeightOverrides(savedPref.heightOverrides);
    if (typeof savedPref.academyName === 'string') setAcademyName(savedPref.academyName);
    if (typeof savedPref.customTitle === 'string') setCustomTitle(savedPref.customTitle);
    if (typeof savedPref.customBadge === 'string') setCustomBadge(savedPref.customBadge);
    if (typeof savedPref.customSubTitle === 'string') setCustomSubTitle(savedPref.customSubTitle);
    if (savedPref.titlePosition === 'left' || savedPref.titlePosition === 'center' || savedPref.titlePosition === 'right') {
     setTitlePosition(savedPref.titlePosition);
    }
    if (typeof savedPref.logoDataUrl === 'string') setLogoDataUrl(savedPref.logoDataUrl);
    if (savedPref.logoPosition) setLogoPosition(savedPref.logoPosition);
    if (typeof savedPref.logoSize === 'number') setLogoSize(savedPref.logoSize);
    if (typeof savedPref.accentColor === 'string') setAccentColor(savedPref.accentColor);
    if (typeof savedPref.footerNotice === 'string') setFooterNotice(savedPref.footerNotice);
   }
  } catch {
   // ignore storage read error
  }
 }, [defaultPrefKey]);

 const template:Template=useMemo(()=>{
  const built = buildStructuredTemplate({
   cycle,
   focus:'balanced',
   theme,
   orientation,
   enabledKinds,
   hideEmpty,
   showNextHomework,
   showMonthlyCompetency,
   academyName,
   customTitle,
   customBadge,
   customSubTitle,
   titlePosition,
   logoDataUrl,
   logoPosition,
   logoSize,
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
  orientation,
  cycle,
  theme,
  enabledKinds,
  hideEmpty,
  showNextHomework,
  showMonthlyCompetency,
  academyName,
  customTitle,
  customBadge,
  customSubTitle,
  titlePosition,
  logoDataUrl,
  logoPosition,
  logoSize,
  accentColor,
  footerNotice,
  spanOverrides,
  heightOverrides,
 ]);

 const start=periodStart(cycle,end,today);
 const [reports,setReports]=useState<Preview[]>([]),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);

 const selectCycle=(nextCycle:ReportCycle)=>{
  setCycle(nextCycle);
 };

 const toggleKind = (k: Kind) => {
  setEnabledKinds(prev => {
   if (prev.includes(k)) {
    if (prev.length <= 1) return prev; // 최소 1개 항목은 유지
    return prev.filter(item => item !== k);
   }
   return [...prev, k];
  });
 };

 const moveKindOrder = (k: Kind, dir: -1 | 1) => {
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
     showMonthlyCompetency,
     hideEmpty,
     spanOverrides,
     heightOverrides,
     academyName,
     customTitle,
     customBadge,
     customSubTitle,
     titlePosition,
     logoDataUrl,
     logoPosition,
     logoSize,
     accentColor,
     footerNotice,
    })
   );
   setMessage('현재 보고서 구성(항목 ON/OFF·제목·위치·칸 크기·로고·테마)을 우리 학원 기본 양식으로 저장했습니다.');
  } catch {
   setMessage('브라우저 저장 공간이 부족하여 기본 양식을 저장하지 못했습니다.');
  }
 };

 const pageWidth=orientation==='landscape'?1123:794,pageHeight=orientation==='landscape'?794:1123;
 const sheets=useRef<HTMLDivElement>(null);
 const [fitScale,setFitScale]=useState(1);

 useEffect(()=>{
  const canvas=sheets.current;if(!canvas)return;
  const fit=()=>{
   const css=getComputedStyle(canvas);
   const width=canvas.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
   const height=canvas.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
   const nextScale=Math.max(0.05,Math.floor(Math.min(1,width/pageWidth,height/pageHeight)*1000)/1000);
   setFitScale(current=>Math.abs(Math.round(current*1000)-Math.round(nextScale*1000))>1?nextScale:current);
  };
  const observer=new ResizeObserver(fit);observer.observe(canvas);
  fit();return()=>observer.disconnect();
 },[active,sidebar,pageWidth,pageHeight]);

 const effectiveScale = zoomMode === 'fit' ? fitScale : zoomMode;

 const select=useCallback((next:ReportStudent[])=>{
  setStudents(next);
  setActive(current=>next.some(s=>s.id===current)?current:next[0]?.id??'');
  setBulkFeedbackTargets(prev => {
   const validPrev = prev.filter(id => next.some(s => s.id === id));
   return validPrev.length > 0 ? validPrev : next.map(s => s.id);
  });
 },[]);

 const feedbackStorageKey = `cosmath-student-feedback:v1:${workspace?.id || 'local'}`;
 const persistStudentFeedback = useCallback((studentId: string, memo: string) => {
  try {
   const currentMap = JSON.parse(localStorage.getItem(feedbackStorageKey) || '{}');
   const nextMap = typeof currentMap === 'object' && currentMap ? { ...currentMap, [studentId]: memo } : { [studentId]: memo };
   localStorage.setItem(feedbackStorageKey, JSON.stringify(nextMap));
  } catch {
   // ignore localStorage errors
  }
 }, [feedbackStorageKey]);

 const feedbackSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
 const handleEditFeedback = useCallback((studentId: string, date: string, memo: string) => {
  persistStudentFeedback(studentId, memo);
  setReports(prev => {
   const next = prev.map(r => {
    if (r.id !== studentId) return r;
    const idx = r.wrong.findIndex(w => w.record_date === date);
    let nextWrong = [...r.wrong];
    let targetRecord;
    if (idx >= 0) {
     targetRecord = { ...nextWrong[idx], memo };
     nextWrong[idx] = targetRecord;
    } else {
     targetRecord = {
      id: `${studentId}_${date}`,
      student_id: studentId,
      record_date: date,
      total_wrong: 0,
      corrected_count: 0,
      completed: false,
      homework_status: null,
      memo,
      version: 1,
     };
     nextWrong.push(targetRecord);
     nextWrong = nextWrong.sort((a, b) => a.record_date.localeCompare(b.record_date));
    }
    const timerKey = `${studentId}:${date}`;
    if (feedbackSaveTimers.current[timerKey]) clearTimeout(feedbackSaveTimers.current[timerKey]);
    const recToSave = targetRecord;
    feedbackSaveTimers.current[timerKey] = setTimeout(() => {
     void saveWrongAnswer(recToSave);
    }, 350);
    return { ...r, wrong: nextWrong };
   });
   return next;
  });
 }, [persistStudentFeedback]);

 const handleBulkEditFeedback = useCallback((date: string, memo: string, customTargetIds?: string[]) => {
  const targetIds = (customTargetIds && customTargetIds.length > 0 ? customTargetIds : bulkFeedbackTargets.length > 0 ? bulkFeedbackTargets : students.map(s => s.id))
   .filter(id => students.some(s => s.id === id));
  if (targetIds.length === 0) return;

  targetIds.forEach(id => persistStudentFeedback(id, memo));

  setReports(prev => {
   return prev.map(r => {
    if (!targetIds.includes(r.id)) return r;
    const idx = r.wrong.findIndex(w => w.record_date === date);
    let nextWrong = [...r.wrong];
    let targetRecord;
    if (idx >= 0) {
     targetRecord = { ...nextWrong[idx], memo };
     nextWrong[idx] = targetRecord;
    } else {
     targetRecord = {
      id: `${r.id}_${date}`,
      student_id: r.id,
      record_date: date,
      total_wrong: 0,
      corrected_count: 0,
      completed: false,
      homework_status: null,
      memo,
      version: 1,
     };
     nextWrong.push(targetRecord);
     nextWrong = nextWrong.sort((a, b) => a.record_date.localeCompare(b.record_date));
    }
    const timerKey = `${r.id}:${date}`;
    if (feedbackSaveTimers.current[timerKey]) clearTimeout(feedbackSaveTimers.current[timerKey]);
    const recToSave = targetRecord;
    feedbackSaveTimers.current[timerKey] = setTimeout(() => {
     void saveWrongAnswer(recToSave);
    }, 200);
    return { ...r, wrong: nextWrong };
   });
  });
  setBulkFeedbackText(memo);
  setMessage(`선택한 ${targetIds.length}명의 학생 보고서에 피드백 코멘트를 일괄 적용했습니다.`);
 }, [bulkFeedbackTargets, students, persistStudentFeedback]);

 const progressSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
 const latestReportsRef = useRef<Preview[]>([]);
 useEffect(() => {
  latestReportsRef.current = reports;
 }, [reports]);

 const handleEditProgress = useCallback((
  studentId: string,
  bookId: string,
  date: string,
  patch: { scope?: string; homework?: string; completedPage?: number }
 ) => {
  setReports(prev => prev.map(r => {
   if (r.id !== studentId) return r;

   let nextBooks = [...r.books];
   let targetBook =
    nextBooks.find(b => b.id === bookId) ??
    (bookId === '__print__'
     ? nextBooks.find(b => b.curriculum === '프린트' || b.title === '프린트 · 유인물')
     : nextBooks[0]);

   if (!targetBook) {
    const newPrintBook: ProgressBook = {
     id: crypto.randomUUID(),
     student_id: studentId,
     title: '프린트 · 유인물',
     curriculum: '프린트',
     course: '개별·보충 프린트',
     total_pages: 0,
     completed_page: 0,
     units: [{ id: crypto.randomUUID(), group: '프린트', name: '프린트 학습 및 오답 정리' }],
     states: {},
     version: 0,
    };
    nextBooks = [...nextBooks, newPrintBook];
    targetBook = newPrintBook;
   }

   let resolvedBook = targetBook;
   if (patch.completedPage !== undefined) {
    const maxPage = resolvedBook.total_pages && resolvedBook.total_pages > 0 ? resolvedBook.total_pages : 9999;
    const clampedPage = Math.max(0, Math.min(maxPage, Math.round(patch.completedPage)));
    const nextStates = syncUnitStatesFromPage(resolvedBook.units, resolvedBook.states, clampedPage);
    resolvedBook = {
     ...resolvedBook,
     completed_page: clampedPage,
     states: nextStates,
    };
    nextBooks = nextBooks.map(b => (b.id === resolvedBook.id ? resolvedBook : b));
   }

   const existingIdx = [...r.entries]
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.book_id === resolvedBook.id && e.record_date === date)
    .pop()?.i ?? -1;

   const latestForBook = [...r.entries]
    .filter(e => e.book_id === resolvedBook.id)
    .sort((a, b) => a.record_date.localeCompare(b.record_date) || a.created_at.localeCompare(b.created_at))
    .pop();

   const activeUnitNames = resolvedBook.units
    .filter(u => resolvedBook.states[u.id] === '진행 중')
    .map(u => u.name);
   const defaultScope = latestForBook?.scope ?? activeUnitNames.slice(0, 2).join(', ') ?? '';
   const defaultHw = latestForBook?.homework ?? '';

   let nextEntries = [...r.entries];
   let updatedEntry: ProgressEntry;

   if (existingIdx >= 0) {
    const cur = nextEntries[existingIdx];
    updatedEntry = {
     ...cur,
     scope: patch.scope !== undefined ? patch.scope : cur.scope,
     homework: patch.homework !== undefined ? patch.homework : cur.homework,
     completed_page: resolvedBook.completed_page,
     states: resolvedBook.states,
    };
    nextEntries[existingIdx] = updatedEntry;
   } else {
    updatedEntry = {
     id: crypto.randomUUID(),
     book_id: resolvedBook.id,
     record_date: date,
     unit_ids: resolvedBook.units.filter(u => resolvedBook.states[u.id] === '진행 중').map(u => u.id),
     scope: patch.scope !== undefined ? patch.scope : defaultScope,
     homework: patch.homework !== undefined ? patch.homework : defaultHw,
     due_date: latestForBook?.due_date ?? null,
     memo: latestForBook?.memo && latestForBook.memo !== '단원 상태 변경' ? latestForBook.memo : '',
     states: resolvedBook.states,
     completed_page: resolvedBook.completed_page,
     created_at: new Date().toISOString(),
    };
    nextEntries.push(updatedEntry);
    nextEntries = nextEntries.sort((a, b) => a.record_date.localeCompare(b.record_date) || a.created_at.localeCompare(b.created_at));
   }

   const timerKey = `${studentId}:${resolvedBook.id}:${date}`;
   if (progressSaveTimers.current[timerKey]) clearTimeout(progressSaveTimers.current[timerKey]);
   progressSaveTimers.current[timerKey] = setTimeout(async () => {
    const latestReport = latestReportsRef.current.find(item => item.id === studentId);
    const currentBook = latestReport?.books.find(b => b.id === resolvedBook.id) ?? resolvedBook;
    const currentEntry =
     latestReport?.entries.filter(e => e.book_id === currentBook.id && e.record_date === date).pop() ?? updatedEntry;
    try {
     const saved = await saveProgress(currentBook, currentEntry);
     setReports(curr => curr.map(rep => {
      if (rep.id !== studentId) return rep;
      return {
       ...rep,
       books: rep.books.map(b => (b.id === saved.book.id ? saved.book : b)),
      };
     }));
     if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('cosmath-records');
      ch.postMessage('changed');
      ch.close();
     }
    } catch {
     // ignore transient save conflict during rapid typing
    }
   }, 400);

   return { ...r, books: nextBooks, entries: nextEntries };
  }));
 }, []);

 useEffect(() => {
  const onRecordsChanged = () => setRevision(v => v + 1);
  window.addEventListener('cosmath-records-changed', onRecordsChanged);
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cosmath-records') : null;
  if (ch) ch.onmessage = onRecordsChanged;
  return () => {
   window.removeEventListener('cosmath-records-changed', onRecordsChanged);
   ch?.close();
  };
 }, []);

 useEffect(()=>{
  let cancelled=false;
  const months=reportMonths(start,end);
  if(!students.length||!months.length||months.length>12||start>end)return;
  const historyStart=dayjs(end).subtract(2,'month').startOf('month').format('YYYY-MM-DD');
  const rangeStart=historyStart<start?historyStart:start;
  const dailyMonths=reportMonths(rangeStart,end);
  async function load(){
   setLoading(true);setReports([]);setMessage('');
   try{
    let savedFeedbackMap: Record<string, string> = {};
    try {
     const parsed = JSON.parse(localStorage.getItem(feedbackStorageKey) || '{}');
     if (parsed && typeof parsed === 'object') savedFeedbackMap = parsed;
    } catch {
     // ignore
    }
    const [daily,wrong]=await Promise.all([Promise.all((dailyMonths.length?dailyMonths:months).map(loadStudentDaily)),loadWrongAnswerRange(rangeStart,end,students.map(s=>s.id))]);
    const output:Preview[]=[];
    for(let offset=0;offset<students.length;offset+=4){
     const batch=await Promise.all(students.slice(offset,offset+4).map(async student=>{
      const progress=await loadProgress(student.id);
      const studentWrong=wrong
       .filter(r=>r.student_id===student.id&&r.record_date<=end)
       .sort((a,b)=>a.record_date.localeCompare(b.record_date));
      const studentEntries=progress.entries
       .filter(e=>e.record_date<=end)
       .sort((a,b)=>a.record_date.localeCompare(b.record_date)||a.created_at.localeCompare(b.created_at));

      const endIdx=studentWrong.findIndex(r=>r.record_date===end);
      const hasEndMemo=endIdx>=0&&Boolean(studentWrong[endIdx].memo?.trim());
      if(!hasEndMemo){
       const latestDbWrongMemo=[...studentWrong].reverse().find(r=>r.memo?.trim())?.memo?.trim();
       const latestDbEntryMemo=[...studentEntries].reverse().find(e=>e.memo?.trim())?.memo?.trim();
       const carriedMemo=(savedFeedbackMap[student.id]?.trim() || latestDbWrongMemo || latestDbEntryMemo || '');
       if(carriedMemo){
        if(endIdx>=0){
         studentWrong[endIdx]={...studentWrong[endIdx],memo:carriedMemo};
        }else{
         studentWrong.push({
          id:`${student.id}_${end}`,
          student_id:student.id,
          record_date:end,
          total_wrong:0,
          corrected_count:0,
          completed:false,
          homework_status:null,
          memo:carriedMemo,
          version:1,
         });
         studentWrong.sort((a,b)=>a.record_date.localeCompare(b.record_date));
        }
       }
      }

      return {
       ...student,
       start,
       end,
       daily:daily.flat().filter(r=>r.student_id===student.id&&r.record_date<=end).sort((a,b)=>a.record_date.localeCompare(b.record_date)),
       wrong:studentWrong,
       books:progress.books,
       entries:studentEntries,
      };
     }));
     if(cancelled)return;output.push(...batch);
    }
    if(!cancelled)setReports(output);
   }catch{if(!cancelled)setMessage('기록을 불러오지 못했습니다. 기록 새로고침으로 다시 시도해 주세요.');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[students,start,end,revision,feedbackStorageKey]);

 const valid=dayjs(start).isValid()&&dayjs(end).isValid()&&start<=end&&reportMonths(start,end).length>0&&reportMonths(start,end).length<=12;
 const current=reports.filter(r=>students.some(s=>s.id===r.id)&&r.start===start&&r.end===end);
 const ready=valid&&!loading&&students.length>0&&current.length===students.length;
 const activeReport = current.find(r => r.id === active) ?? current[0];
 const activeIdx = current.findIndex(r => r.id === (activeReport?.id ?? ''));

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
    if(typeof value.template.customTitle==='string')setCustomTitle(value.template.customTitle);
    if(typeof value.template.customBadge==='string')setCustomBadge(value.template.customBadge);
    if(typeof value.template.customSubTitle==='string')setCustomSubTitle(value.template.customSubTitle);
    if(value.template.titlePosition==='left'||value.template.titlePosition==='center'||value.template.titlePosition==='right')setTitlePosition(value.template.titlePosition);
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
     const blob=await toBlob(pages[index],{pixelRatio:2,width:pageWidth,height:pages[index].offsetHeight,style:{zoom:'1'},backgroundColor:'#ffffff',cacheBust:false,filter:node=>!(node instanceof HTMLElement&&node.dataset.exportHide==='true')});if(!blob)throw new Error('Image failed');
     zip.file(`${safeName(report.group)}_${safeName(report.name)}_${safeName(report.id)}/${String(index+1).padStart(2,'0')}_${end}_${orientation}.png`,blob);
     completed++;setMessage(`이미지 생성 중 ${completed} / ${total}`);
    }
   }
   const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${reportCycles[cycle].label.replace(/\s+/g,'')}_${end}_${current.length}명_${orientation}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage(`${current.length}명 · ${completed}장의 이미지를 ZIP으로 저장했습니다.`);
  }catch{setMessage('이미지 일괄 저장에 실패했습니다. 파일은 저장되지 않았습니다. 다시 시도해 주세요.');}finally{setExporting(false);}
 }

 const duplicateStudentNames = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const s of students) {
   counts[s.name] = (counts[s.name] || 0) + 1;
  }
  return new Set(Object.keys(counts).filter(n => counts[n] > 1));
 }, [students]);

 const formatKakaoPreviewQuery = useCallback((student: ReportStudent) => {
  const custom = (kakaoAliases[student.id] || '').trim();
  if (custom) return custom;
  const isDup = duplicateStudentNames.has(student.name);
  if (kakaoSearchTemplate === '{name}' && isDup && student.grade) {
   return `${student.grade} ${student.name}`.trim();
  }
  return kakaoSearchTemplate
   .replace(/\{name\}/g, student.name)
   .replace(/\{grade\}/g, student.grade || '')
   .replace(/\{group\}/g, student.group || '')
   .replace(/\s+/g, ' ')
   .trim() || student.name;
 }, [kakaoAliases, duplicateStudentNames, kakaoSearchTemplate]);

 const checkKakaoBridge = useCallback(async () => {
  try {
   const res = await fetch('http://127.0.0.1:5005/health', { cache: 'no-store' });
   if (res.ok) {
    setKakaoBridgeAlive(true);
    return true;
   }
  } catch {
   // try local Next.js API route fallback
  }
  try {
   const res = await fetch('/api/kakao-send', { cache: 'no-store' });
   if (res.ok) {
    setKakaoBridgeAlive(true);
    return true;
   }
  } catch {
   // ignore
  }
  setKakaoBridgeAlive(false);
  return false;
 }, []);

 const openKakaoModal = useCallback(() => {
  setKakaoTargets(prev => {
   const validPrev = prev.filter(id => students.some(s => s.id === id));
   return validPrev.length > 0 ? validPrev : students.map(s => s.id);
  });
  setKakaoModalOpen(true);
  void checkKakaoBridge();
 }, [students, checkKakaoBridge]);

 async function sendReportsToKakao(targetStudentIds?: string[]) {
  const ids = (targetStudentIds && targetStudentIds.length > 0 ? targetStudentIds : kakaoTargets)
   .filter(id => current.some(r => r.id === id));
  if (!ready || exporting || kakaoSending || ids.length === 0) return;

  setKakaoSending(true);
  setKakaoLogs([`총 ${ids.length}명의 리포트 고화질 이미지를 생성하고 있습니다...`]);
  setKakaoResults([]);

  try {
   await document.fonts.ready;
   const { toPng } = await import('html-to-image');
   const nodes = Array.from(sheets.current?.querySelectorAll<HTMLElement>('[data-report]') ?? []);
   const items: {
    studentId: string;
    name: string;
    grade: string;
    group: string;
    customSearch: string;
    filename: string;
    imageDataUrl: string;
   }[] = [];

   for (const studentId of ids) {
    const report = current.find(r => r.id === studentId);
    const node = nodes.find(n => n.dataset.report === studentId);
    if (!report || !node) continue;
    const pages = Array.from(node.querySelectorAll<HTMLElement>('[data-sheet]'));
    for (let idx = 0; idx < pages.length; idx++) {
     await Promise.all(Array.from(pages[idx].querySelectorAll('img')).map(img => img.decode()));
     const dataUrl = await toPng(pages[idx], {
      pixelRatio: 2,
      width: pageWidth,
      height: pages[idx].offsetHeight,
      style: { zoom: '1' },
      backgroundColor: '#ffffff',
      cacheBust: false,
      filter: el => !(el instanceof HTMLElement && el.dataset.exportHide === 'true'),
     });
     items.push({
      studentId: report.id,
      name: report.name,
      grade: report.grade,
      group: report.group,
      customSearch: (kakaoAliases[report.id] || '').trim(),
      filename: `${safeName(report.grade)} ${safeName(report.name)}.png`,
      imageDataUrl: dataUrl,
     });
     setKakaoLogs(prev => [...prev, `이미지 준비 완료 (${items.length}/${ids.length}): ${report.grade} ${report.name}`]);
    }
   }

   const payload = {
    delay: kakaoDelay,
    searchTemplate: kakaoSearchTemplate,
    tabMode: kakaoTabMode,
    useClipboardImage: true,
    items,
   };

   let usedDirectBridge = false;
   let startOk = false;
   let startMsg = '';

   try {
    const directRes = await fetch('http://127.0.0.1:5005/send-reports', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload),
    });
    const directData = await directRes.json();
    usedDirectBridge = true;
    startOk = Boolean(directData?.ok);
    startMsg = directData?.message || '';
   } catch {
    // Fallback to Next.js API route (which also auto-spawns local bridge on Windows)
    const apiRes = await fetch('/api/kakao-send', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload),
    });
    const apiData = await apiRes.json();
    startOk = Boolean(apiData?.ok);
    startMsg = apiData?.message || apiData?.error || '';
   }

   if (!startOk) {
    setKakaoLogs(prev => [...prev, `❌ 발송 시작 실패: ${startMsg || '카카오톡 통합 앱 연결을 확인해 주세요.'}`]);
    setKakaoSending(false);
    return;
   }

   setKakaoBridgeAlive(true);
   setKakaoLogs(prev => [...prev, `🚀 ${startMsg}`]);

   const statusUrl = usedDirectBridge ? 'http://127.0.0.1:5005/status' : '/api/kakao-send';
   let finished = false;
   while (!finished) {
    await new Promise(r => setTimeout(r, 700));
    try {
     const stRes = await fetch(statusUrl, { cache: 'no-store' });
     if (!stRes.ok) break;
     const st = await stRes.json();
     if (Array.isArray(st.logs)) setKakaoLogs(st.logs);
     if (Array.isArray(st.results)) setKakaoResults(st.results);
     if (!st.running) {
      finished = true;
     }
    } catch {
     break;
    }
   }
  } catch (err) {
   setKakaoLogs(prev => [...prev, `❌ 오류 발생: ${err instanceof Error ? err.message : String(err)}`]);
  } finally {
   setKakaoSending(false);
  }
 }

 async function stopKakaoSend() {
  try {
   await fetch('http://127.0.0.1:5005/stop', { method: 'POST' });
  } catch {
   await fetch('/api/kakao-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' }),
   }).catch(() => {});
  }
  setKakaoSending(false);
 }

 async function exportKakaoNamedZip() {
  const ids = kakaoTargets.filter(id => current.some(r => r.id === id));
  if (!ready || exporting || ids.length === 0) return;
  setExporting(true);
  setMessage('카카오톡 폴더 발송용 이미지를 준비하고 있습니다.');
  try {
   await document.fonts.ready;
   const { toBlob } = await import('html-to-image');
   const zip = new JSZip();
   const nodes = Array.from(sheets.current?.querySelectorAll<HTMLElement>('[data-report]') ?? []);
   for (const studentId of ids) {
    const report = current.find(r => r.id === studentId);
    const node = nodes.find(n => n.dataset.report === studentId);
    if (!report || !node) continue;
    const pages = Array.from(node.querySelectorAll<HTMLElement>('[data-sheet]'));
    for (let index = 0; index < pages.length; index++) {
     await Promise.all(Array.from(pages[index].querySelectorAll('img')).map(img => img.decode()));
     const blob = await toBlob(pages[index], {
      pixelRatio: 2,
      width: pageWidth,
      height: pages[index].offsetHeight,
      style: { zoom: '1' },
      backgroundColor: '#ffffff',
      cacheBust: false,
      filter: el => !(el instanceof HTMLElement && el.dataset.exportHide === 'true'),
     });
     if (!blob) throw new Error('Image failed');
     const suffix = pages.length > 1 ? `_${index + 1}` : '';
     zip.file(`${safeName(report.grade)} ${safeName(report.name)}${suffix}.png`, blob);
    }
   }
   const blob = await zip.generateAsync({ type: 'blob' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `카톡발송용_${end}_${ids.length}명.zip`;
   a.click();
   setTimeout(() => URL.revokeObjectURL(url), 10000);
   setMessage(`카카오톡 발송용 이름 규칙(학년 이름.png)으로 ${ids.length}명의 이미지를 저장했습니다.`);
  } catch {
   setMessage('카톡용 ZIP 저장에 실패했습니다.');
  } finally {
   setExporting(false);
  }
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
     <div className={styles.segmented} role="group" aria-label="보고 주기 선택">
      {(Object.entries(reportCycles) as [ReportCycle,typeof reportCycles[ReportCycle]][]).map(([key,item])=>(
       <button key={key} type="button" disabled={exporting} aria-pressed={cycle===key} onClick={()=>selectCycle(key)} title={item.desc} style={{padding:'6px 11px',fontSize:12,border:0}}>
        {item.label.replace(' 보고서', '')}
       </button>
      ))}
     </div>
     <label>기준일<input type="date" value={end} disabled={exporting} onChange={e=>setEnd(e.target.value)}/></label>
     {start!==end&&<span className={styles.rangeBadge}>{start} ~ {end}</span>}
     <button disabled={loading||exporting||!students.length} onClick={()=>setRevision(v=>v+1)} title="기록 새로고침" style={{padding:'8px 10px'}}>
      <RefreshCw size={14}/> 새로고침
     </button>
    </div>

    <div className={styles.toolbarActions}>
     <button
      type="button"
      onClick={() => setShowCustomizer(v => !v)}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       padding:'8px 12px',
       borderRadius:9,
       border:showCustomizer?'1.5px solid #2563eb':'1px solid #cbd5e1',
       background:showCustomizer?'#eff6ff':'#ffffff',
       color:showCustomizer?'#1d4ed8':'#1e293b',
       fontSize:12,
       fontWeight:800,
       cursor:'pointer',
      }}
     >
      <SlidersHorizontal size={13}/> 양식 · 디자인 설정 {showCustomizer ? '▲' : '▼'}
     </button>

     {students.length > 1 && (
      <button
       type="button"
       onClick={() => setShowBulkFeedbackBar(v => !v)}
       style={{
        display:'inline-flex',
        alignItems:'center',
        gap:6,
        padding:'8px 12px',
        borderRadius:9,
        border:showBulkFeedbackBar?'1.5px solid #2563eb':'1px solid #cbd5e1',
        background:showBulkFeedbackBar?'#eff6ff':'#ffffff',
        color:showBulkFeedbackBar?'#1d4ed8':'#1e293b',
        fontSize:12,
        fontWeight:800,
        cursor:'pointer',
       }}
      >
       <MessageSquareText size={13}/> 일괄 피드백 ({bulkFeedbackTargets.length || students.length}명) {showBulkFeedbackBar ? '▲' : '▼'}
      </button>
     )}

     {/* 컴팩트 배율 & 크게 보기 */}
     <div style={{display:'inline-flex',alignItems:'center',gap:2,background:'#f1f5f9',padding:'2px 4px',borderRadius:9,border:'1px solid #dbe5f2'}}>
      <button
       type="button"
       title="축소"
       onClick={()=>setZoomMode(prev => Math.max(0.5, Number(((prev === 'fit' ? fitScale : prev) - 0.15).toFixed(2))))}
       style={{padding:'5px 6px',border:0,background:'transparent'}}
      >
       <ZoomOut size={13}/>
      </button>
      <button
       type="button"
       onClick={()=>setZoomMode(prev => prev === 'fit' ? 1 : 'fit')}
       title="화면맞춤 / 100% 전환"
       style={{padding:'4px 7px',fontSize:11,fontWeight:700,border:0,borderRadius:6,background:'#ffffff',color:'#1d4ed8'}}
      >
       {zoomMode === 'fit' ? `${Math.round(fitScale*100)}%` : `${Math.round(zoomMode*100)}%`}
      </button>
      <button
       type="button"
       title="확대"
       onClick={()=>setZoomMode(prev => Math.min(1.6, Number(((prev === 'fit' ? fitScale : prev) + 0.15).toFixed(2))))}
       style={{padding:'5px 6px',border:0,background:'transparent'}}
      >
       <ZoomIn size={13}/>
      </button>
      <button
       type="button"
       disabled={!activeReport}
       onClick={()=>setLargeModalOpen(true)}
       style={{padding:'5px 9px',fontSize:11.5,fontWeight:800,border:0,borderRadius:6,background:'#1e40af',color:'#ffffff'}}
      >
       <Maximize2 size={12}/> 크게 보기
      </button>
     </div>

     <button disabled={!ready||exporting} onClick={()=>window.print()} style={{padding:'8px 11px'}}>PDF</button>
     <button className={styles.batchDownload} disabled={!ready||exporting} onClick={()=>void exportAll()}>
      <Download size={15}/>{exporting?'생성 중…':`이미지 저장${students.length?` (${students.length}명)`:''}`}
     </button>
     <button
      type="button"
      disabled={!ready || exporting}
      onClick={openKakaoModal}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       padding:'8px 14px',
       borderRadius:9,
       border:'1px solid #eab308',
       background:'#fae100',
       color:'#3c1e1e',
       fontSize:12.5,
       fontWeight:800,
       cursor:ready && !exporting ? 'pointer' : 'default',
       boxShadow:'0 1px 4px rgba(0,0,0,0.08)',
      }}
     >
      <Send size={14}/> 카카오톡 발송{students.length ? ` (${students.length}명)` : ''}
     </button>
    </div>
   </div>

   {/* 양식 · 디자인 설정 드로어 (템플릿 스타일 · 포함 요소 · 칸 비율 · 학원 로고 · 문구 · 기본값 저장) */}
   {showCustomizer && (
    <section className={styles.templateEditor} aria-label="보고서 상세 커스텀 설정">
     {/* 상단 요약 설정 바: 템플릿 스타일 · 포함 요소 · 방향 · 스냅샷 */}
     <div
      style={{
       display:'flex',
       alignItems:'center',
       justifyContent:'space-between',
       flexWrap:'wrap',
       gap:12,
       padding:'10px 14px',
       marginBottom:14,
       background:'#ffffff',
       border:'1px solid #dbe5f2',
       borderRadius:10,
      }}
     >
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
       <div className={styles.presetGroup}>
        <span className={styles.presetLabel}>템플릿 스타일</span>
        <div className={styles.segmented} role="group" aria-label="템플릿 분위기 선택">
         {studioThemes.map(({key,label,Icon,badge})=>(
          <button key={key} type="button" disabled={exporting} aria-pressed={theme===key} onClick={()=>setTheme(key)} className={styles.themeTabBtn}>
           <Icon size={14}/>
           {label}
           {badge&&<span style={{fontSize:9.5,fontWeight:800,padding:'1px 5px',borderRadius:999,background:'#dcfce7',color:'#15803d'}}>{badge}</span>}
          </button>
         ))}
        </div>
       </div>

       <div className={styles.presetDivider} aria-hidden="true"/>

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
         {cycle === 'month' && (
          <button
           type="button"
           disabled={exporting}
           aria-pressed={showMonthlyCompetency}
           onClick={() => setShowMonthlyCompetency(v => !v)}
           className={styles.kindPill}
          >
           {showMonthlyCompetency ? '✓ ' : '+ '}5대역량진단
          </button>
         )}
         <button
          type="button"
          disabled={exporting}
          aria-pressed={hideEmpty}
          onClick={() => setHideEmpty(v => !v)}
          className={styles.kindPill}
         >
          {hideEmpty ? '✓ ' : ''}빈 항목 자동숨김
         </button>
        </div>
       </div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
       <label style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,fontWeight:700,color:'#475569'}}>
        방향
        <select aria-label="보고서 방향" value={orientation} disabled={exporting} onChange={e=>setOrientation(e.target.value as 'portrait'|'landscape')}>
         <option value="portrait">세로형</option>
         <option value="landscape">가로형</option>
        </select>
       </label>
       <button type="button" disabled={!students.length||loading||exporting||!valid} onClick={loadSaved}>저장본 불러오기</button>
       <button type="button" disabled={!ready||exporting} onClick={saveReports}>현재 보고서 임시저장</button>
      </div>
     </div>

     <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:20,alignItems:'start'}}>
      {/* 좌측: 학원별 빠른 프리셋 & 요소별 칸 너비/세로 크기/순서 조절 */}
      <div>
       <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8}}>
        <strong style={{fontSize:13,color:'#0f172a'}}>1. 요소별 크기(분량) 및 배치 순서 조절</strong>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
         {academyQuickPresets.map(preset => (
          <button
           key={preset.id}
           type="button"
           onClick={() => {
            setEnabledKinds(preset.kinds);
            setShowNextHomework(preset.showNextHomework);
           }}
           style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 9px',fontSize:11,fontWeight:700,borderRadius:999,border:'1px solid #cbd5e1',background:'#ffffff'}}
           title={preset.desc}
          >
           <Sparkles size={11}/> {preset.label}
          </button>
         ))}
        </div>
       </div>

       <div style={{display:'grid',gap:6}}>
        {enabledKinds.map((k, idx) => {
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

           <div style={{display:'inline-flex',alignItems:'center',gap:3}}>
            <span style={{fontSize:11,color:'#64748b',marginRight:3}}>크기(분량):</span>
            {HEIGHT_OPTIONS.map(opt => (
             <button
              key={opt.value}
              type="button"
              onClick={() => setHeightOverrides(prev => ({ ...prev, [k]: opt.value }))}
              style={{
               padding:'3px 9px',
               fontSize:11,
               fontWeight:curHeight === opt.value ? 800 : 500,
               background:curHeight === opt.value ? '#1e40af' : '#f8fafc',
               color:curHeight === opt.value ? '#ffffff' : '#475569',
               border:curHeight === opt.value ? '1px solid #1e40af' : '1px solid #cbd5e1',
               borderRadius:6,
              }}
             >
              {opt.label}
             </button>
            ))}
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
          <label style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:'#475569'}}>
           <span>로고 크기</span>
           <input
            type="range"
            min={24}
            max={96}
            step={2}
            value={logoSize}
            onChange={e => setLogoSize(Number(e.target.value))}
            aria-label="로고 크기 조절"
            style={{width:86,padding:0,cursor:'pointer'}}
           />
           <span style={{minWidth:32,fontSize:11,fontWeight:800,color:'#1e40af'}}>{logoSize}px</span>
          </label>
          <button type="button" onClick={() => setLogoDataUrl('')} style={{padding:'5px 8px',color:'#dc2626'}}>
           로고 삭제
          </button>
         </>
        )}
       </div>

       <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.3fr',gap:8,alignItems:'center'}}>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>상단 배지 문구 (지우면 숨김)</span>
         <input
          value={customBadge ?? defaultBadgeText}
          onChange={e => setCustomBadge(e.target.value)}
          placeholder="배지 비움"
          style={{maxWidth:'none',width:'100%'}}
         />
        </label>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>상단 보조 제목 (지우면 숨김)</span>
         <input
          value={customSubTitle ?? defaultSubTitleText}
          onChange={e => setCustomSubTitle(e.target.value)}
          placeholder="소제목 비움"
          style={{maxWidth:'none',width:'100%'}}
         />
        </label>
        <label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:3}}>
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>보고서 메인 제목 (지우면 숨김)</span>
         <input
          value={customTitle ?? defaultTitleText}
          onChange={e => setCustomTitle(e.target.value)}
          placeholder="메인 제목 비움"
          style={{maxWidth:'none',width:'100%'}}
         />
        </label>
       </div>

       <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,alignItems:'center'}}>
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
         <span style={{fontSize:11,fontWeight:700,color:'#475569'}}>상단 제목 위치</span>
         <select
          value={titlePosition}
          onChange={e => setTitlePosition(e.target.value as TitlePosition)}
          aria-label="상단 제목 위치"
         >
          <option value="left">좌측 정렬</option>
          <option value="center">가운데 정렬</option>
          <option value="right">우측 정렬</option>
         </select>
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

   {/* 다중 학생 선택 시 피드백 코멘트 일괄 작성 · 적용 바 */}
   {students.length > 1 && showBulkFeedbackBar && (
    <section
     aria-label="선택 학생 피드백 일괄 작성"
     style={{
      margin:'8px 18px 4px',
      padding:'12px 16px',
      background:'#f8fafc',
      border:'1px solid #bfdbfe',
      borderRadius:12,
      display:'flex',
      flexDirection:'column',
      gap:8,
     }}
    >
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
       <strong style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:12.5,color:'#1e40af'}}>
        <MessageSquareText size={14}/> 선택 학생 피드백 코멘트 일괄 적용 ({bulkFeedbackTargets.length}명 대상)
       </strong>
       <button
        type="button"
        onClick={() =>
         setBulkFeedbackTargets(
          bulkFeedbackTargets.length === students.length ? [] : students.map(s => s.id)
         )
        }
        style={{
         padding:'3px 8px',
         fontSize:11,
         fontWeight:700,
         borderRadius:6,
         border:'1px solid #93c5fd',
         background:'#ffffff',
         color:'#1d4ed8',
         cursor:'pointer',
        }}
       >
        {bulkFeedbackTargets.length === students.length ? '전체 해제' : `전체 선택 (${students.length}명)`}
       </button>
       <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
        {students.map(s => {
         const checkedTarget = bulkFeedbackTargets.includes(s.id);
         return (
          <button
           key={s.id}
           type="button"
           aria-pressed={checkedTarget}
           onClick={() =>
            setBulkFeedbackTargets(prev =>
             prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
            )
           }
           style={{
            padding:'3px 9px',
            fontSize:11,
            fontWeight:700,
            borderRadius:999,
            border:checkedTarget ? '1px solid #2563eb' : '1px solid #cbd5e1',
            background:checkedTarget ? '#2563eb' : '#ffffff',
            color:checkedTarget ? '#ffffff' : '#475569',
            cursor:'pointer',
           }}
          >
           {checkedTarget ? '✓ ' : ''}{s.name}
          </button>
         );
        })}
       </div>
      </div>
     </div>
     <div style={{display:'flex',alignItems:'stretch',gap:8,flexWrap:'wrap'}}>
      <textarea
       rows={2}
       aria-label="일괄 피드백 코멘트"
       value={bulkFeedbackText}
       onChange={e => setBulkFeedbackText(e.target.value)}
       placeholder="선택한 학생들의 보고서 피드백란에 일괄로 들어갈 코멘트를 입력하세요..."
       style={{
        flex:1,
        minWidth:240,
        padding:'8px 11px',
        fontSize:12.5,
        borderRadius:8,
        border:'1px solid #cbd5e1',
        background:'#ffffff',
        color:'#0f172a',
        resize:'vertical',
       }}
      />
      <button
       type="button"
       disabled={exporting || bulkFeedbackTargets.length === 0}
       onClick={() => handleBulkEditFeedback(end, bulkFeedbackText, bulkFeedbackTargets)}
       style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        gap:6,
        padding:'0 16px',
        borderRadius:8,
        border:'1px solid #1d4ed8',
        background:bulkFeedbackTargets.length > 0 ? '#2563eb' : '#94a3b8',
        color:'#ffffff',
        fontSize:12.5,
        fontWeight:800,
        cursor:bulkFeedbackTargets.length > 0 ? 'pointer' : 'default',
        whiteSpace:'nowrap',
       }}
      >
       <Check size={14}/> 선택 {bulkFeedbackTargets.length}명 피드백 일괄 적용
      </button>
     </div>
    </section>
   )}

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
       <ReportSheets
        preview={report}
        template={template}
        onEditFeedback={handleEditFeedback}
        onBulkEditFeedback={(dateStr, memoText) => handleBulkEditFeedback(dateStr, memoText)}
        bulkTargetCount={bulkFeedbackTargets.length || students.length}
        onEditHeader={handleEditHeader}
        onEditProgress={handleEditProgress}
       />
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
       <strong style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:15}}>
        <Maximize2 size={15}/> 크게 미리보기 — {activeReport.name} ({activeReport.grade} · {activeReport.group})
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
        <ReportSheets preview={activeReport} template={template} onEditFeedback={handleEditFeedback} onEditHeader={handleEditHeader} onEditProgress={handleEditProgress}/>
       </div>
      </div>
     </div>
    </div>
   )}

   {/* 카카오톡 리포트 자동 발송 모달 */}
   {kakaoModalOpen && (
    <div
     role="dialog"
     aria-modal="true"
     aria-label="카카오톡 리포트 자동 발송"
     onClick={e => {
      if (e.target === e.currentTarget && !kakaoSending) setKakaoModalOpen(false);
     }}
     style={{
      position:'fixed',
      inset:0,
      zIndex:110,
      background:'rgba(15, 23, 42, 0.72)',
      backdropFilter:'blur(3px)',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      padding:20,
     }}
    >
     <div
      style={{
       width:'100%',
       maxWidth:760,
       maxHeight:'90vh',
       background:'#ffffff',
       borderRadius:18,
       boxShadow:'0 24px 60px rgba(15, 23, 42, 0.35)',
       display:'flex',
       flexDirection:'column',
       overflow:'hidden',
      }}
     >
      {/* 헤더 */}
      <div
       style={{
        padding:'16px 22px',
        background:'#fae100',
        color:'#3c1e1e',
        display:'flex',
        alignItems:'center',
        justifyContent:'space-between',
        gap:12,
       }}
      >
       <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <strong style={{fontSize:16,fontWeight:900,display:'inline-flex',alignItems:'center',gap:6}}>
         <Send size={16}/> 카카오톡 리포트 자동 발송
        </strong>
        <span
         style={{
          fontSize:11.5,
          fontWeight:800,
          padding:'3px 10px',
          borderRadius:999,
          background:kakaoBridgeAlive ? '#15803d' : '#b45309',
          color:'#ffffff',
         }}
        >
         {kakaoBridgeAlive ? '● 카톡 발송 엔진 연결됨' : '● 발송 시 로컬 카톡 엔진 자동 연결'}
        </span>
       </div>
       <button
        type="button"
        disabled={kakaoSending}
        onClick={() => setKakaoModalOpen(false)}
        style={{
         padding:'5px 10px',
         borderRadius:8,
         border:'1px solid rgba(60,30,30,0.2)',
         background:'rgba(255,255,255,0.65)',
         color:'#3c1e1e',
         fontSize:12,
         fontWeight:800,
         cursor:kakaoSending ? 'default' : 'pointer',
         display:'inline-flex',
         alignItems:'center',
         gap:4,
        }}
       >
        <X size={14}/> 닫기
       </button>
      </div>

      {/* 본문 */}
      <div style={{padding:'18px 22px',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
       {/* 1. 카톡 검색어 규칙 & 옵션 */}
       <div
        style={{
         padding:'14px 16px',
         background:'#f8fafc',
         border:'1px solid #e2e8f0',
         borderRadius:12,
         display:'flex',
         flexDirection:'column',
         gap:10,
        }}
       >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
         <strong style={{fontSize:13,color:'#0f172a'}}>1. 카카오톡 친구/채팅방 검색어 규칙</strong>
         <span style={{fontSize:11.5,color:'#64748b'}}>
          동명이인이 있으면 <code>{'{name}'}</code>만 골라도 자동으로 학년이 붙습니다.
         </span>
        </div>

        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
         {[
          { label: '학생 이름만 (예: 홍길동)', value: '{name}' },
          { label: '학년 + 이름 (예: 중2 홍길동)', value: '{grade} {name}' },
          { label: '이름 + 학부모 (예: 홍길동 학부모)', value: '{name} 학부모' },
          { label: '학년 + 이름 + 학부모 (예: 중2 홍길동 학부모)', value: '{grade} {name} 학부모' },
         ].map(preset => (
          <button
           key={preset.value}
           type="button"
           onClick={() => setKakaoSearchTemplate(preset.value)}
           style={{
            padding:'6px 11px',
            fontSize:11.5,
            fontWeight:800,
            borderRadius:8,
            border:kakaoSearchTemplate === preset.value ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
            background:kakaoSearchTemplate === preset.value ? '#eff6ff' : '#ffffff',
            color:kakaoSearchTemplate === preset.value ? '#1d4ed8' : '#334155',
            cursor:'pointer',
           }}
          >
           {preset.label}
          </button>
         ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:10,marginTop:2}}>
         <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11.5,fontWeight:700,color:'#475569'}}>
          검색어 템플릿 직접 수정
          <input
           type="text"
           value={kakaoSearchTemplate}
           onChange={e => setKakaoSearchTemplate(e.target.value)}
           placeholder="예: {grade} {name} 어머님"
           style={{height:34,padding:'0 10px',borderRadius:8,border:'1px solid #cbd5e1',fontSize:12.5}}
          />
         </label>

         <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11.5,fontWeight:700,color:'#475569'}}>
          카카오톡 검색 기준 탭
          <select
           value={kakaoTabMode}
           onChange={e => setKakaoTabMode(e.target.value as 'friends' | 'chats')}
           style={{height:34,padding:'0 10px',borderRadius:8,border:'1px solid #cbd5e1',fontSize:12.5,background:'#ffffff'}}
          >
           <option value="friends">친구 목록에서 검색 (Ctrl+1)</option>
           <option value="chats">채팅방 목록에서 검색 (Ctrl+2)</option>
          </select>
         </label>

         <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11.5,fontWeight:700,color:'#475569'}}>
          동작 간격 (초 · 기본 1.0초)
          <input
           type="number"
           min={0.5}
           max={5}
           step={0.1}
           value={kakaoDelay}
           onChange={e => setKakaoDelay(Math.max(0.5, Number(e.target.value) || 1.0))}
           style={{height:34,padding:'0 10px',borderRadius:8,border:'1px solid #cbd5e1',fontSize:12.5}}
          />
         </label>
        </div>
       </div>

       {/* 2. 발송 대상 학생 목록 및 개별 카톡 별칭 지정 */}
       <div
        style={{
         padding:'14px 16px',
         background:'#ffffff',
         border:'1px solid #e2e8f0',
         borderRadius:12,
         display:'flex',
         flexDirection:'column',
         gap:10,
        }}
       >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
         <strong style={{fontSize:13,color:'#0f172a'}}>
          2. 발송 대상 선택 및 학생별 카톡 검색어 확인 ({kakaoTargets.length} / {students.length}명)
         </strong>
         <div style={{display:'flex',gap:6}}>
          {activeReport && (
           <button
            type="button"
            onClick={() => setKakaoTargets([activeReport.id])}
            style={{
             padding:'4px 10px',
             fontSize:11.5,
             fontWeight:700,
             borderRadius:7,
             border:'1px solid #93c5fd',
             background:'#eff6ff',
             color:'#1d4ed8',
             cursor:'pointer',
            }}
           >
            현재 학생만 ({activeReport.name})
           </button>
          )}
          <button
           type="button"
           onClick={() =>
            setKakaoTargets(kakaoTargets.length === students.length ? [] : students.map(s => s.id))
           }
           style={{
            padding:'4px 10px',
            fontSize:11.5,
            fontWeight:700,
            borderRadius:7,
            border:'1px solid #cbd5e1',
            background:'#f8fafc',
            color:'#334155',
            cursor:'pointer',
           }}
          >
           {kakaoTargets.length === students.length ? '전체 해제' : `전체 선택 (${students.length}명)`}
          </button>
         </div>
        </div>

        <div
         style={{
          maxHeight:210,
          overflowY:'auto',
          border:'1px solid #e2e8f0',
          borderRadius:10,
          divideY:'1px solid #f1f5f9',
         } as CSSProperties}
        >
         {students.map(s => {
          const checked = kakaoTargets.includes(s.id);
          const previewQuery = formatKakaoPreviewQuery(s);
          const resultItem = kakaoResults.find(r => r.studentId === s.id);
          return (
           <div
            key={s.id}
            style={{
             display:'flex',
             alignItems:'center',
             justifyContent:'space-between',
             gap:10,
             padding:'8px 12px',
             borderBottom:'1px solid #f1f5f9',
             background:checked ? '#f8fbff' : '#ffffff',
            }}
           >
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',minWidth:150}}>
             <input
              type="checkbox"
              checked={checked}
              onChange={() =>
               setKakaoTargets(prev =>
                prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
               )
              }
             />
             <span style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>{s.name}</span>
             <small style={{fontSize:11.5,color:'#64748b'}}>{s.grade} · {s.group}</small>
            </label>

            <div style={{display:'flex',alignItems:'center',gap:8,flex:1,justifyContent:'flex-end'}}>
             <span style={{fontSize:11.5,color:'#475569',whiteSpace:'nowrap'}}>
              실제 검색어: <strong style={{color:'#1d4ed8'}}>{previewQuery}</strong>
             </span>
             <input
              type="text"
              value={kakaoAliases[s.id] || ''}
              onChange={e => updateKakaoAlias(s.id, e.target.value)}
              placeholder="별도 카톡명 지정 (자동 저장)"
              style={{
               width:175,
               height:28,
               padding:'0 8px',
               borderRadius:6,
               border:'1px solid #cbd5e1',
               fontSize:11.5,
              }}
             />
             {resultItem && (
              <span
               style={{
                fontSize:11,
                fontWeight:800,
                padding:'2px 7px',
                borderRadius:999,
                background:resultItem.success ? '#dcfce7' : '#fee2e2',
                color:resultItem.success ? '#15803d' : '#b91c1c',
                whiteSpace:'nowrap',
               }}
              >
               {resultItem.success ? '✓ 전송됨' : '✗ 실패'}
              </span>
             )}
            </div>
           </div>
          );
         })}
        </div>
       </div>

       {/* 3. 진행 로그 */}
       {kakaoLogs.length > 0 && (
        <div
         style={{
          padding:'10px 14px',
          background:'#0f172a',
          color:'#e2e8f0',
          borderRadius:10,
          fontSize:12,
          fontFamily:'monospace',
          maxHeight:140,
          overflowY:'auto',
          display:'flex',
          flexDirection:'column',
          gap:3,
         }}
        >
         {kakaoLogs.map((line, i) => (
          <div key={i}>{line}</div>
         ))}
        </div>
       )}
      </div>

      {/* 하단 액션 버튼 */}
      <div
       style={{
        padding:'14px 22px',
        background:'#f8fafc',
        borderTop:'1px solid #e2e8f0',
        display:'flex',
        alignItems:'center',
        justifyContent:'space-between',
        flexWrap:'wrap',
        gap:10,
       }}
      >
       <button
        type="button"
        disabled={exporting || kakaoSending || kakaoTargets.length === 0}
        onClick={() => void exportKakaoNamedZip()}
        style={{
         padding:'8px 13px',
         borderRadius:9,
         border:'1px solid #cbd5e1',
         background:'#ffffff',
         color:'#334155',
         fontSize:12,
         fontWeight:800,
         cursor:'pointer',
         display:'inline-flex',
         alignItems:'center',
         gap:6,
        }}
       >
        <Download size={14}/> 카톡용 이름규칙(학년 이름.png) ZIP 다운로드
       </button>

       <div style={{display:'flex',alignItems:'center',gap:8}}>
        {kakaoSending ? (
         <button
          type="button"
          onClick={() => void stopKakaoSend()}
          style={{
           padding:'9px 18px',
           borderRadius:9,
           border:0,
           background:'#ef4444',
           color:'#ffffff',
           fontSize:13,
           fontWeight:800,
           cursor:'pointer',
          }}
         >
          발송 중단
         </button>
        ) : (
         <>
          {activeReport && (
           <button
            type="button"
            disabled={!ready || exporting}
            onClick={() => void sendReportsToKakao([activeReport.id])}
            style={{
             padding:'9px 15px',
             borderRadius:9,
             border:'1px solid #1d4ed8',
             background:'#eff6ff',
             color:'#1d4ed8',
             fontSize:12.5,
             fontWeight:800,
             cursor:'pointer',
            }}
           >
            현재 학생 1명({activeReport.name}) 바로 발송
           </button>
          )}
          <button
           type="button"
           disabled={!ready || exporting || kakaoTargets.length === 0}
           onClick={() => void sendReportsToKakao()}
           style={{
            padding:'9px 20px',
            borderRadius:9,
            border:'1px solid #ca8a04',
            background:'#fae100',
            color:'#3c1e1e',
            fontSize:13,
            fontWeight:900,
            cursor:kakaoTargets.length > 0 ? 'pointer' : 'default',
            display:'inline-flex',
            alignItems:'center',
            gap:6,
           }}
          >
           <Send size={14}/> 선택 {kakaoTargets.length}명 카카오톡 자동 발송 시작
          </button>
         </>
        )}
       </div>
      </div>
     </div>
    </div>
   )}
  </div>
 </main>;
}
