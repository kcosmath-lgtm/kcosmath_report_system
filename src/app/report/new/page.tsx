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
 BookOpen,
 Save,
 AlignLeft,
 AlignCenter,
 AlignRight,
 Send,
} from 'lucide-react';
import StudentSidebar from '../../../components/layout/Sidebar';
import LandingMenu from '../../../components/LandingMenu';
import {useAuth} from '../../../components/AuthProvider';
import {loadStudentDaily,loadWrongAnswerRange,loadProgress,saveWrongAnswer,saveProgress,saveProgressBatch} from '../../../lib/report-storage';
import {sendAiCopilotMessage} from '../../../lib/ai-copilot';
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

 useEffect(() => {
  try {
   const savedDate = sessionStorage.getItem('cosmath-student-record-date');
   if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
    setEnd(savedDate);
   }
  } catch {
   // ignore
  }
 }, []);

 const updateEndDate = useCallback((nextDate: string) => {
  setEnd(nextDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
   try {
    sessionStorage.setItem('cosmath-student-record-date', nextDate);
   } catch {
    // ignore
   }
  }
 }, []);
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

 // 다중 학생 일괄 피드백 & 진도·과제 작성 상태
 const [bulkFeedbackText, setBulkFeedbackText] = useState('');
 const [bulkFeedbackTargets, setBulkFeedbackTargets] = useState<string[]>([]);
 const [showBulkFeedbackBar, setShowBulkFeedbackBar] = useState(false);
 const [showBulkProgressBar, setShowBulkProgressBar] = useState(false);
 const [bulkBookTarget, setBulkBookTarget] = useState<string>('__primary__');
 const [bulkScopeText, setBulkScopeText] = useState<string>('');
 const [bulkHomeworkText, setBulkHomeworkText] = useState<string>('');
 const [aiFeedbackBusy, setAiFeedbackBusy] = useState(false);
 const [aiFeedbackModalOpen, setAiFeedbackModalOpen] = useState(false);
 const [aiMustIncludeText, setAiMustIncludeText] = useState('');
 const [aiStudentKeywords, setAiStudentKeywords] = useState<Record<string, string>>({});
 const [aiToneStyle, setAiToneStyle] = useState<'counsel' | 'praise' | 'coaching' | 'concise'>('counsel');
 const [aiVariationCount, setAiVariationCount] = useState(0);

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
 const [kakaoBridgeChecking, setKakaoBridgeChecking] = useState<boolean>(false);
 const [desktopAppVersion, setDesktopAppVersion] = useState<string>('');
 const [desktopUpdateInfo, setDesktopUpdateInfo] = useState<{
  hasUpdate?: boolean;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
 } | null>(null);
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
 const dirtyWrongRef = useRef<Set<string>>(new Set());
 const dirtyProgressRef = useRef<Set<string>>(new Set());
 const [dirtyRecordCount, setDirtyRecordCount] = useState(0);
 const [savingRecords, setSavingRecords] = useState(false);
 const selfSavingCount = useRef(0);
 const handleEditFeedback = useCallback((studentId: string, date: string, memo: string) => {
  persistStudentFeedback(studentId, memo);
  dirtyWrongRef.current.add(`${studentId}:${date}`);
  setDirtyRecordCount(dirtyWrongRef.current.size + dirtyProgressRef.current.size);
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
      id: crypto.randomUUID(),
      student_id: studentId,
      record_date: date,
      total_wrong: 0,
      corrected_count: 0,
      completed: false,
      homework_status: null,
      memo,
      version: 0,
     };
     nextWrong.push(targetRecord);
     nextWrong = nextWrong.sort((a, b) => a.record_date.localeCompare(b.record_date));
    }
    const timerKey = `${studentId}:${date}`;
    if (feedbackSaveTimers.current[timerKey]) clearTimeout(feedbackSaveTimers.current[timerKey]);
    const recToSave = targetRecord;
    feedbackSaveTimers.current[timerKey] = setTimeout(async () => {
     selfSavingCount.current += 1;
     try {
      const saved = await saveWrongAnswer(recToSave);
      setReports(curr => curr.map(rep => {
       if (rep.id !== studentId) return rep;
       return {
        ...rep,
        wrong: rep.wrong.map(w => (w.record_date === date ? { ...w, id: saved.id, version: saved.version } : w)),
       };
      }));
     } catch {
      // ignore transient conflict
     } finally {
      selfSavingCount.current = Math.max(0, selfSavingCount.current - 1);
     }
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

  targetIds.forEach(id => {
   persistStudentFeedback(id, memo);
   dirtyWrongRef.current.add(`${id}:${date}`);
  });
  setDirtyRecordCount(dirtyWrongRef.current.size + dirtyProgressRef.current.size);

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
      id: crypto.randomUUID(),
      student_id: r.id,
      record_date: date,
      total_wrong: 0,
      corrected_count: 0,
      completed: false,
      homework_status: null,
      memo,
      version: 0,
     };
     nextWrong.push(targetRecord);
     nextWrong = nextWrong.sort((a, b) => a.record_date.localeCompare(b.record_date));
    }
    const timerKey = `${r.id}:${date}`;
    if (feedbackSaveTimers.current[timerKey]) clearTimeout(feedbackSaveTimers.current[timerKey]);
    const recToSave = targetRecord;
    feedbackSaveTimers.current[timerKey] = setTimeout(async () => {
     selfSavingCount.current += 1;
     try {
      const saved = await saveWrongAnswer(recToSave);
      setReports(curr => curr.map(rep => {
       if (rep.id !== r.id) return rep;
       return {
        ...rep,
        wrong: rep.wrong.map(w => (w.record_date === date ? { ...w, id: saved.id, version: saved.version } : w)),
       };
      }));
     } catch {
      // ignore transient conflict
     } finally {
      selfSavingCount.current = Math.max(0, selfSavingCount.current - 1);
     }
    }, 200);
    return { ...r, wrong: nextWrong };
   });
  });
  setBulkFeedbackText(memo);
  setMessage(`선택한 ${targetIds.length}명의 학생 보고서에 피드백 코멘트를 일괄 적용했습니다.`);
 }, [bulkFeedbackTargets, students, persistStudentFeedback]);

 const openAiFeedbackModal = useCallback((customTargetIds?: string[]) => {
  if (customTargetIds && customTargetIds.length > 0) {
   setBulkFeedbackTargets(customTargetIds.filter(id => students.some(s => s.id === id)));
  } else if (bulkFeedbackTargets.length === 0 && students.length > 0) {
   setBulkFeedbackTargets(students.map(s => s.id));
  }
  if (students.length === 0) {
   setSidebar(true);
  }
  setAiFeedbackModalOpen(true);
 }, [students, bulkFeedbackTargets.length]);

 const handleAiGeneratePersonalizedFeedbacks = useCallback(async (
  customTargetIds?: string[],
  customOptions?: {
   mustInclude?: string;
   studentKeywords?: Record<string, string>;
   toneStyle?: 'counsel' | 'praise' | 'coaching' | 'concise';
  }
 ) => {
  if (students.length === 0) {
   setSidebar(true);
   setMessage('왼쪽 학생 목록에서 AI 맞춤 총평을 작성할 학생이나 반을 먼저 선택해 주세요.');
   return;
  }
  const targetIds = (
   customTargetIds && customTargetIds.length > 0
    ? customTargetIds
    : bulkFeedbackTargets.length > 0
      ? bulkFeedbackTargets
      : students.map(s => s.id)
  ).filter(id => students.some(s => s.id === id));
  if (targetIds.length === 0 || aiFeedbackBusy) return;

  const effectiveMustInclude = (customOptions?.mustInclude ?? aiMustIncludeText).trim();
  const effectiveStudentKeywords = customOptions?.studentKeywords ?? aiStudentKeywords;
  const effectiveToneStyle = customOptions?.toneStyle ?? aiToneStyle;
  const nextSeed = aiVariationCount + 1;
  setAiVariationCount(nextSeed);

  // 피드백 요소가 꺼져 있었다면 총평이 바로 보이도록 자동 활성화
  setEnabledKinds(prev => (prev.includes('feedback') ? prev : [...prev, 'feedback']));

  setAiFeedbackBusy(true);
  setMessage(
   effectiveMustInclude
    ? `Flash AI가 입력하신 키워드('${effectiveMustInclude.slice(0, 24)}${effectiveMustInclude.length > 24 ? '…' : ''}')와 기존 학습 요소를 조합하여 ${targetIds.length}명의 맞춤 총평을 완성하고 있습니다...`
    : `Flash AI가 ${targetIds.length}명의 기록된 학습 요소를 분석하여 학생별 맞춤 총평을 작성하고 있습니다...`
  );

  try {
   const targetReports = reports.filter(r => targetIds.includes(r.id));
   const useAtt = enabledKinds.includes('attendance');
   const useHw = enabledKinds.includes('homework');
   const useGrades = enabledKinds.includes('grades');
   const useWrong = enabledKinds.includes('wrong');
   const useProg = enabledKinds.includes('progress');

   const studentsContext = (targetReports.length > 0 ? targetReports : students.filter(s => targetIds.includes(s.id)).map(s => ({
    ...s,
    start,
    end,
    daily: [],
    wrong: [],
    books: [],
    entries: [],
   }))).map(r => {
    const dailyInPeriod = r.daily.filter(d => d.record_date >= r.start && d.record_date <= r.end);
    const wrongInPeriod = r.wrong.filter(w => w.record_date >= r.start && w.record_date <= r.end);
    const entriesInPeriod = r.entries.filter(e => e.record_date >= r.start && e.record_date <= r.end && (e.scope?.trim() || e.homework?.trim()));

    const recordedAtt = dailyInPeriod.filter(d => Boolean(d.attendance)).length;
    const attended = dailyInPeriod.filter(d => d.attendance === '출석').length;
    const attRate = useAtt && recordedAtt > 0 ? Math.round((attended / recordedAtt) * 100) : null;
    const todayDaily = [...dailyInPeriod].reverse().find(d => d.record_date === r.end) ?? dailyInPeriod[dailyInPeriod.length - 1];
    const todayAtt = useAtt && r.start === r.end ? (todayDaily?.attendance || '') : '';

    const hwRecorded = wrongInPeriod.filter(w => w.homework_status === 'O' || w.homework_status === '△' || w.homework_status === 'X');
    const hwDone = hwRecorded.filter(w => w.homework_status === 'O').length;
    const hwPartial = hwRecorded.filter(w => w.homework_status === '△').length;
    const hwRate = useHw && hwRecorded.length > 0 ? Math.round(((hwDone + hwPartial * 0.5) / hwRecorded.length) * 100) : null;
    const todayWrongRec = [...wrongInPeriod].reverse().find(w => w.record_date === r.end) ?? wrongInPeriod[wrongInPeriod.length - 1];
    const todayHw = useHw && r.start === r.end ? (todayWrongRec?.homework_status ?? null) : null;

    const allExams = useGrades
     ? r.daily
        .filter(d => d.record_date <= r.end)
        .flatMap(d => d.exams.map(ex => ({
         name: ex.name,
         rate: ex.max_score > 0 ? Math.round((ex.score / ex.max_score) * 100) : 0,
        })))
     : [];
    const avgScore = allExams.length > 0 ? Math.round(allExams.reduce((a, b) => a + b.rate, 0) / allExams.length) : null;
    const latestExam = allExams.length > 0 ? allExams[allExams.length - 1].name : '';

    const totalWrong = wrongInPeriod.reduce((a, b) => a + b.total_wrong, 0);
    const fixedWrong = wrongInPeriod.reduce((a, b) => a + b.corrected_count, 0);
    const wrongSummary = !useWrong
     ? ''
     : wrongInPeriod.some(w => w.completed) || (totalWrong > 0 && fixedWrong >= totalWrong)
       ? '오답 클리닉 완료'
       : totalWrong > 0
         ? `오답 ${totalWrong}문항 중 ${fixedWrong}문항 해결`
         : '';

    const latestEntry = entriesInPeriod[entriesInPeriod.length - 1];
    const activeBooks = r.books.filter(b => !b.archived && b.curriculum !== '프린트' && b.title !== '프린트 · 유인물');
    const bookTitle = latestEntry
     ? r.books.find(b => b.id === latestEntry.book_id)?.title || ''
     : activeBooks[0]?.title || '';
    const progressSummary = !useProg
     ? ''
     : latestEntry?.scope?.trim()
       ? `${bookTitle ? `${bookTitle} ` : ''}${latestEntry.scope.trim()}`
       : bookTitle;
    const nextHomework = useProg && showNextHomework && latestEntry?.homework?.trim()
     ? `${bookTitle ? `[${bookTitle}] ` : ''}${latestEntry.homework.trim()}`
     : '';
    const studentSpecificKw = (effectiveStudentKeywords[r.id] || '').trim();

    return {
     id: r.id,
     name: r.name,
     grade: r.grade,
     group: r.group,
     attRate,
     todayAtt,
     hwRate,
     todayHw,
     avgScore,
     latestExam,
     wrongSummary,
     progressSummary,
     nextHomework,
     mustInclude: studentSpecificKw || undefined,
    };
   });

   const res = await sendAiCopilotMessage({
    prompt: `${periodKorText} 학습 보고서에 들어갈 학생별 맞춤 선생님 총평 코멘트를 작성해줘.${
     effectiveMustInclude ? ` 반드시 포함할 핵심 단어/내용: "${effectiveMustInclude}".` : ''
    } 출결·과제·성적·진도·오답 중 기록되어 있는 기존 요소들과 입력된 필수 단어를 자연스럽게 한 문맥으로 조합하여 정중하고 구체적인 2~4문장으로 완성해줘.`,
    mode: 'report_feedback',
    pathname: '/report/new',
    useWebSearch: false,
    contextData: {
     periodKor: periodKorText,
     date: end,
     enabledKinds,
     mustInclude: effectiveMustInclude,
     toneStyle: effectiveToneStyle,
     variationSeed: nextSeed,
     students: studentsContext,
    },
   });

   const generatedList = res.reportFeedbacks || [];
   const pool = targetReports.length > 0 ? targetReports : students.filter(s => targetIds.includes(s.id));
   const appliedIds = new Set<string>();
   let appliedCount = 0;

   for (let idx = 0; idx < generatedList.length; idx++) {
    const item = generatedList[idx];
    if (!item?.feedback?.trim()) continue;
    const matchedStudent =
     pool.find(r => r.id === item.studentId) ||
     pool.find(r => r.name === item.studentName) ||
     pool.find(r => item.studentName && (item.studentName.includes(r.name) || r.name.includes(item.studentName))) ||
     pool[idx];
    if (matchedStudent && !appliedIds.has(matchedStudent.id)) {
     handleEditFeedback(matchedStudent.id, end, item.feedback.trim());
     appliedIds.add(matchedStudent.id);
     appliedCount++;
    }
   }

   if (appliedCount > 0) {
    setAiFeedbackModalOpen(false);
    setMessage(
     effectiveMustInclude
      ? `✨ 입력하신 필수 키워드('${effectiveMustInclude.slice(0, 22)}${effectiveMustInclude.length > 22 ? '…' : ''}')와 기존 학습 요소를 조합하여 ${appliedCount}명의 맞춤 총평을 완성했습니다.`
      : `✨ AI가 ${appliedCount}명의 기록된 학습 요소를 바탕으로 학생별 맞춤 총평을 자동 작성했습니다.`
    );
   } else {
    setMessage('AI 피드백 응답을 받지 못했습니다. 다시 시도해 주세요.');
   }
  } catch (err) {
   setMessage(err instanceof Error ? err.message : 'AI 맞춤 피드백 생성 중 오류가 발생했습니다.');
  } finally {
   setAiFeedbackBusy(false);
  }
 }, [
  bulkFeedbackTargets,
  students,
  aiFeedbackBusy,
  aiMustIncludeText,
  aiStudentKeywords,
  aiToneStyle,
  aiVariationCount,
  reports,
  enabledKinds,
  showNextHomework,
  start,
  periodKorText,
  end,
  handleEditFeedback,
 ]);

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
   dirtyProgressRef.current.add(timerKey);
   setDirtyRecordCount(dirtyWrongRef.current.size + dirtyProgressRef.current.size);
   if (progressSaveTimers.current[timerKey]) clearTimeout(progressSaveTimers.current[timerKey]);
   progressSaveTimers.current[timerKey] = setTimeout(async () => {
    const latestReport = latestReportsRef.current.find(item => item.id === studentId);
    const currentBook = latestReport?.books.find(b => b.id === resolvedBook.id) ?? resolvedBook;
    const currentEntry =
     latestReport?.entries.filter(e => e.book_id === currentBook.id && e.record_date === date).pop() ?? updatedEntry;
    selfSavingCount.current += 1;
    try {
     const saved = await saveProgress(currentBook, currentEntry);
     setReports(curr => curr.map(rep => {
      if (rep.id !== studentId) return rep;
      return {
       ...rep,
       books: rep.books.map(b => (b.id === saved.book.id ? saved.book : b)),
      };
     }));
    } catch {
     // ignore transient save conflict during rapid typing
    } finally {
     selfSavingCount.current = Math.max(0, selfSavingCount.current - 1);
    }
   }, 400);

   return { ...r, books: nextBooks, entries: nextEntries };
  }));
 }, []);

 const availableBulkBookTitles = useMemo(() => {
  const titles = new Set<string>();
  for (const r of reports) {
   for (const b of r.books) {
    if (!b.archived && b.curriculum !== '프린트' && b.title !== '프린트 · 유인물' && b.title.trim()) {
     titles.add(b.title.trim());
    }
   }
  }
  return Array.from(titles);
 }, [reports]);

 const handleBulkEditProgress = useCallback((
  date: string,
  patch: { scope?: string; homework?: string; bookTitle?: string },
  customTargetIds?: string[],
  customBookTarget?: string
 ) => {
  const targetIds = (
   customTargetIds && customTargetIds.length > 0
    ? customTargetIds
    : bulkFeedbackTargets.length > 0
      ? bulkFeedbackTargets
      : students.map(s => s.id)
  ).filter(id => students.some(s => s.id === id));
  if (targetIds.length === 0) return;

  const effectiveBookTarget = customBookTarget ?? (patch.bookTitle ? `title:${patch.bookTitle}` : bulkBookTarget);

  setEnabledKinds(prev => (prev.includes('progress') ? prev : [...prev, 'progress']));

  for (const studentId of targetIds) {
   const rep = latestReportsRef.current.find(r => r.id === studentId);
   const activeBooks = (rep?.books ?? []).filter(b => !b.archived && b.curriculum !== '프린트' && b.title !== '프린트 · 유인물');
   let bookIdToUse = '__print__';

   if (effectiveBookTarget === '__print__' || patch.bookTitle === '프린트 · 유인물') {
    bookIdToUse = '__print__';
   } else if (effectiveBookTarget.startsWith('title:')) {
    const wantedTitle = effectiveBookTarget.slice(6).trim();
    const matched = activeBooks.find(b => b.title.trim() === wantedTitle);
    bookIdToUse = matched?.id ?? activeBooks[0]?.id ?? '__print__';
   } else {
    bookIdToUse = activeBooks[0]?.id ?? '__print__';
   }

   const cleanPatch: { scope?: string; homework?: string } = {};
   if (patch.scope !== undefined) cleanPatch.scope = patch.scope;
   if (patch.homework !== undefined) cleanPatch.homework = patch.homework;
   handleEditProgress(studentId, bookIdToUse, date, cleanPatch);
  }

  if (patch.scope !== undefined) setBulkScopeText(patch.scope);
  if (patch.homework !== undefined) setBulkHomeworkText(patch.homework);
  setMessage(`선택한 ${targetIds.length}명의 학생 보고서에 오늘 수업 진도·과제를 일괄 적용했습니다.`);
 }, [bulkFeedbackTargets, students, bulkBookTarget, handleEditProgress]);

 const handleSaveStudentRecords = useCallback(async () => {
  if (savingRecords || loading || exporting || !students.length) return;
  for (const t of Object.values(feedbackSaveTimers.current)) clearTimeout(t);
  feedbackSaveTimers.current = {};
  for (const t of Object.values(progressSaveTimers.current)) clearTimeout(t);
  progressSaveTimers.current = {};

  setSavingRecords(true);
  selfSavingCount.current += 1;
  try {
   const latest = latestReportsRef.current;
   const wrongToSave = [];
   const progressBatch: { book: ProgressBook; entry: ProgressEntry }[] = [];

   for (const rep of latest) {
    if (!students.some(s => s.id === rep.id)) continue;
    const endWrong = rep.wrong.find(w => w.record_date === end);
    if (endWrong && (dirtyWrongRef.current.has(`${rep.id}:${end}`) || endWrong.memo?.trim())) {
     wrongToSave.push(endWrong);
    }
    for (const book of rep.books) {
     if (book.archived) continue;
     const endEntry = [...rep.entries].filter(e => e.book_id === book.id && e.record_date === end).pop();
     const key = `${rep.id}:${book.id}:${end}`;
     if (endEntry && (dirtyProgressRef.current.has(key) || endEntry.scope?.trim() || endEntry.homework?.trim())) {
      progressBatch.push({ book, entry: endEntry });
     }
    }
   }

   if (wrongToSave.length > 0) {
    const savedWrongs = await Promise.all(wrongToSave.map(w => saveWrongAnswer(w)));
    setReports(curr => curr.map(rep => {
     const matched = savedWrongs.find(sw => sw.student_id === rep.id && sw.record_date === end);
     if (!matched) return rep;
     return {
      ...rep,
      wrong: rep.wrong.map(w => (w.record_date === end ? { ...w, id: matched.id, version: matched.version } : w)),
     };
    }));
   }

   if (progressBatch.length > 0) {
    if (typeof saveProgressBatch === 'function') {
     const savedBooks = await saveProgressBatch(progressBatch);
     setReports(curr => curr.map(rep => {
      const updatedForStudent = savedBooks.filter(sb => sb.book.student_id === rep.id);
      if (!updatedForStudent.length) return rep;
      return {
       ...rep,
       books: rep.books.map(b => updatedForStudent.find(u => u.book.id === b.id)?.book ?? b),
      };
     }));
    } else {
     for (const item of progressBatch) {
      await saveProgress(item.book, item.entry);
     }
    }
   }

   dirtyWrongRef.current.clear();
   dirtyProgressRef.current.clear();
   setDirtyRecordCount(0);
   setMessage('기록을 저장했습니다. 학생 관리의 수업·진도·피드백 기록에 반영되었습니다.');
  } catch (e) {
   setMessage(e instanceof Error ? e.message : '기록을 저장하지 못했습니다.');
  } finally {
   selfSavingCount.current = Math.max(0, selfSavingCount.current - 1);
   setSavingRecords(false);
  }
 }, [savingRecords, loading, exporting, students, end]);

 useEffect(() => {
  const onAiReportFeedbacks = (e: Event) => {
   const list = (e as CustomEvent<Array<{ studentId?: string; studentName: string; feedback: string }> | undefined>).detail;
   if (!Array.isArray(list) || list.length === 0) return;
   setEnabledKinds(prev => (prev.includes('feedback') ? prev : [...prev, 'feedback']));
   const pool = reports.length > 0 ? reports : students;
   const appliedIds = new Set<string>();
   let count = 0;
   for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];
    if (!item?.feedback?.trim()) continue;
    const matched =
     pool.find(r => r.id === item.studentId) ||
     pool.find(r => r.name === item.studentName) ||
     pool.find(r => item.studentName && (item.studentName.includes(r.name) || r.name.includes(item.studentName))) ||
     pool[idx];
    if (matched && !appliedIds.has(matched.id)) {
     handleEditFeedback(matched.id, end, item.feedback.trim());
     appliedIds.add(matched.id);
     count++;
    }
   }
   if (count > 0) {
    setMessage(`✨ AI 코파일럿이 ${count}명의 맞춤 총평 코멘트를 보고서에 반영했습니다.`);
   }
  };
  window.addEventListener('cosmath-ai-report-feedbacks', onAiReportFeedbacks);
  return () => window.removeEventListener('cosmath-ai-report-feedbacks', onAiReportFeedbacks);
 }, [reports, students, end, handleEditFeedback]);

 useEffect(() => {
  const onRecordsChanged = () => {
   if (selfSavingCount.current > 0) return;
   setRevision(v => v + 1);
  };
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
          id:crypto.randomUUID(),
          student_id:student.id,
          record_date:end,
          total_wrong:0,
          corrected_count:0,
          completed:false,
          homework_status:null,
          memo:carriedMemo,
          version:0,
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
   const {toBlob}=await import('html-to-image');
   const nodes=Array.from(sheets.current?.querySelectorAll<HTMLElement>('[data-report]')??[]);
   if(nodes.length!==students.length)throw new Error('Missing reports');
   let completed=0;const total=nodes.reduce((n,node)=>n+node.querySelectorAll('[data-sheet]').length,0);
   if(nodes.length===1&&total===1){
    const report=current.find(r=>r.id===nodes[0].dataset.report);if(!report)throw new Error('Missing student');
    const page=nodes[0].querySelector<HTMLElement>('[data-sheet]');if(!page)throw new Error('Missing sheet');
    await Promise.all(Array.from(page.querySelectorAll('img')).map(img=>img.decode()));
    const blob=await toBlob(page,{pixelRatio:2,width:pageWidth,height:page.offsetHeight,style:{zoom:'1'},backgroundColor:'#ffffff',cacheBust:false,filter:node=>!(node instanceof HTMLElement&&node.dataset.exportHide==='true')});if(!blob)throw new Error('Image failed');
    const fileName=`${safeName(`${report.grade||''} ${report.name}`.trim())}.png`;
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    setMessage(`${fileName} 이미지를 저장했습니다.`);
    return;
   }
   const zip=new JSZip();
   const usedNames=new Set<string>();
   for(const node of nodes){
    const report=current.find(r=>r.id===node.dataset.report);if(!report)throw new Error('Missing student');
    const pages=Array.from(node.querySelectorAll<HTMLElement>('[data-sheet]'));
    const baseName=safeName(`${report.grade||''} ${report.name}`.trim());
    let studentPrefix=baseName;
    let dupCount=2;
    while(usedNames.has(studentPrefix)){
     studentPrefix=`${baseName}_${dupCount++}`;
    }
    usedNames.add(studentPrefix);
    for(let index=0;index<pages.length;index++){
     await Promise.all(Array.from(pages[index].querySelectorAll('img')).map(img=>img.decode()));
     const blob=await toBlob(pages[index],{pixelRatio:2,width:pageWidth,height:pages[index].offsetHeight,style:{zoom:'1'},backgroundColor:'#ffffff',cacheBust:false,filter:node=>!(node instanceof HTMLElement&&node.dataset.exportHide==='true')});if(!blob)throw new Error('Image failed');
     const suffix=pages.length>1?`_${index+1}`:'';
     zip.file(`${studentPrefix}${suffix}.png`,blob);
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
  setKakaoBridgeChecking(true);
  try {
   const res = await fetch('http://127.0.0.1:5005/health', { cache: 'no-store' });
   if (res.ok) {
    const data = await res.json().catch(() => ({}));
    setKakaoBridgeAlive(true);
    setDesktopAppVersion(String(data?.version || '1.0.0'));
    setKakaoBridgeChecking(false);

    // 연결된 데스크톱 앱이 최신 버전인지 비동기 체크
    fetch('http://127.0.0.1:5005/check-update', { cache: 'no-store' })
     .then(r => r.json())
     .then(u => {
      if (u?.update?.hasUpdate) {
       setDesktopUpdateInfo(u.update);
      } else {
       setDesktopUpdateInfo(null);
      }
     })
     .catch(() => {});

    return true;
   }
  } catch {
   // 로컬 브릿지 미실행 시(일반 웹 브라우저 접속)
  }
  setKakaoBridgeAlive(false);
  setKakaoBridgeChecking(false);
  return false;
 }, []);

 const applyDesktopAppUpdate = useCallback(async () => {
  const dlUrl = desktopUpdateInfo?.downloadUrl || '/downloads/Cosmath-Desktop-App.exe';
  try {
   await fetch('http://127.0.0.1:5005/apply-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadUrl: dlUrl }),
   });
  } catch {
   window.location.href = dlUrl;
  }
 }, [desktopUpdateInfo]);

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

  const alive = await checkKakaoBridge();
  if (!alive) {
   setKakaoLogs([
    '❌ 카카오톡 자동 발송은 「코스매스 PC 데스크톱 앱」을 다운로드하여 실행한 상태에서만 사용할 수 있습니다.',
   ]);
   return;
  }

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
     <label>기준일<input type="date" value={end} disabled={exporting} onChange={e=>updateEndDate(e.target.value)}/></label>
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
       padding:'7px 12px',
       borderRadius:8,
       border:showCustomizer?'1px solid #191f28':'1px solid #e5e8eb',
       background:showCustomizer?'#191f28':'#ffffff',
       color:showCustomizer?'#ffffff':'#333d4b',
       fontSize:12,
       fontWeight:600,
       cursor:'pointer',
      }}
     >
      <SlidersHorizontal size={13}/> 양식 설정
     </button>

     <button
      type="button"
      disabled={loading || exporting || aiFeedbackBusy}
      onClick={() => openAiFeedbackModal(students.map(s => s.id))}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       padding:'7px 12px',
       borderRadius:8,
       border:'1px solid #e5e8eb',
       background:'#f9fafb',
       color:'#191f28',
       fontSize:12,
       fontWeight:700,
       cursor:!loading && !exporting && !aiFeedbackBusy ? 'pointer' : 'default',
      }}
      title="반드시 들어가야 하는 단어·문구를 입력하고 기존 학습 요소(출결·과제·성적·진도·오답)와 조합하여 맞춤 총평을 완성합니다"
     >
      <Sparkles size={13} color="#3182f6"/> {aiFeedbackBusy ? 'AI 작성 중…' : `AI 맞춤 총평${students.length ? ` (${students.length})` : ''}`}
     </button>

     {students.length > 1 && (
      <>
       <button
        type="button"
        onClick={() => setShowBulkProgressBar(v => !v)}
        style={{
         display:'inline-flex',
         alignItems:'center',
         gap:6,
         padding:'7px 12px',
         borderRadius:8,
         border:showBulkProgressBar?'1px solid #191f28':'1px solid #e5e8eb',
         background:showBulkProgressBar?'#191f28':'#ffffff',
         color:showBulkProgressBar?'#ffffff':'#333d4b',
         fontSize:12,
         fontWeight:600,
         cursor:'pointer',
        }}
       >
        <BookOpen size={13}/> 일괄 진도·과제 ({bulkFeedbackTargets.length || students.length})
       </button>
       <button
        type="button"
        onClick={() => setShowBulkFeedbackBar(v => !v)}
        style={{
         display:'inline-flex',
         alignItems:'center',
         gap:6,
         padding:'7px 12px',
         borderRadius:8,
         border:showBulkFeedbackBar?'1px solid #191f28':'1px solid #e5e8eb',
         background:showBulkFeedbackBar?'#191f28':'#ffffff',
         color:showBulkFeedbackBar?'#ffffff':'#333d4b',
         fontSize:12,
         fontWeight:600,
         cursor:'pointer',
        }}
       >
        <MessageSquareText size={13}/> 일괄 피드백 ({bulkFeedbackTargets.length || students.length})
       </button>
      </>
     )}

     {/* 컴팩트 배율 & 크게 보기 */}
     <div style={{display:'inline-flex',alignItems:'center',gap:2,background:'#f2f4f6',padding:'2px 3px',borderRadius:8}}>
      <button
       type="button"
       title="축소"
       onClick={()=>setZoomMode(prev => Math.max(0.5, Number(((prev === 'fit' ? fitScale : prev) - 0.15).toFixed(2))))}
       style={{padding:'4px 6px',border:0,background:'transparent',color:'#4e5968'}}
      >
       <ZoomOut size={13}/>
      </button>
      <button
       type="button"
       onClick={()=>setZoomMode(prev => prev === 'fit' ? 1 : 'fit')}
       title="화면맞춤 / 100% 전환"
       style={{padding:'4px 7px',fontSize:11,fontWeight:700,border:0,borderRadius:6,background:'#ffffff',color:'#191f28',boxShadow:'0 1px 2px rgba(25,31,40,0.06)'}}
      >
       {zoomMode === 'fit' ? `${Math.round(fitScale*100)}%` : `${Math.round(zoomMode*100)}%`}
      </button>
      <button
       type="button"
       title="확대"
       onClick={()=>setZoomMode(prev => Math.min(1.6, Number(((prev === 'fit' ? fitScale : prev) + 0.15).toFixed(2))))}
       style={{padding:'4px 6px',border:0,background:'transparent',color:'#4e5968'}}
      >
       <ZoomIn size={13}/>
      </button>
      <button
       type="button"
       disabled={!activeReport}
       onClick={()=>setLargeModalOpen(true)}
       style={{padding:'4px 8px',fontSize:11.5,fontWeight:600,border:0,borderRadius:6,background:'transparent',color:'#333d4b'}}
      >
       <Maximize2 size={12}/> 크게
      </button>
     </div>

     <button disabled={!ready||exporting} onClick={()=>window.print()} style={{padding:'7px 11px'}}>PDF</button>
     <button
      type="button"
      disabled={!ready || exporting || savingRecords}
      onClick={() => void handleSaveStudentRecords()}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       padding:'7px 13px',
       borderRadius:8,
       border:'1px solid #3182f6',
       background:'#3182f6',
       color:'#ffffff',
       fontSize:12,
       fontWeight:700,
       cursor:ready && !exporting && !savingRecords ? 'pointer' : 'default',
      }}
     >
      <Save size={14}/> {savingRecords ? '저장 중…' : `기록 저장${dirtyRecordCount > 0 ? ` (${dirtyRecordCount})` : ''}`}
     </button>
     <button className={styles.batchDownload} disabled={!ready||exporting} onClick={()=>void exportAll()}>
      <Download size={14}/>{exporting?'생성 중…':`이미지 저장${students.length?` (${students.length})`:''}`}
     </button>
     <button
      type="button"
      disabled={!ready || exporting}
      onClick={openKakaoModal}
      style={{
       display:'inline-flex',
       alignItems:'center',
       gap:6,
       padding:'7px 13px',
       borderRadius:8,
       border:'1px solid #191f28',
       background:'#191f28',
       color:'#ffffff',
       fontSize:12,
       fontWeight:700,
       cursor:ready && !exporting ? 'pointer' : 'default',
      }}
     >
      <Send size={13}/> 카톡 발송{students.length ? ` (${students.length})` : ''}
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
          background:'#191f28',
          color:'#ffffff',
          borderColor:'#191f28',
          fontWeight:700,
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

   {/* 다중 학생 선택 시 오늘 수업 진도 및 다음 과제 일괄 작성 · 적용 바 */}
   {students.length > 1 && showBulkProgressBar && (
    <section
     aria-label="선택 학생 진도·과제 일괄 작성"
     style={{
      margin:'10px 24px 4px',
      padding:'14px 16px',
      background:'#ffffff',
      border:'1px solid #e5e8eb',
      borderRadius:12,
      display:'flex',
      flexDirection:'column',
      gap:10,
     }}
    >
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
       <strong style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12.5,color:'#191f28'}}>
        <BookOpen size={14}/> 선택 학생 오늘 수업 진도 · 다음 과제 일괄 적용 ({bulkFeedbackTargets.length}명)
       </strong>
       <button
        type="button"
        onClick={() =>
         setBulkFeedbackTargets(
          bulkFeedbackTargets.length === students.length ? [] : students.map(s => s.id)
         )
        }
        style={{
         padding:'3px 9px',
         fontSize:11,
         fontWeight:600,
         borderRadius:6,
         border:'1px solid #e5e8eb',
         background:'#f9fafb',
         color:'#4e5968',
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
            padding:'3px 10px',
            fontSize:11,
            fontWeight:600,
            borderRadius:999,
            border:checkedTarget ? '1px solid #191f28' : '1px solid #e5e8eb',
            background:checkedTarget ? '#191f28' : '#ffffff',
            color:checkedTarget ? '#ffffff' : '#6b7684',
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
      <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11,fontWeight:700,color:'#4e5968',minWidth:185}}>
       적용 대상 교재
       <select
        aria-label="일괄 적용 대상 교재"
        value={bulkBookTarget}
        onChange={e => setBulkBookTarget(e.target.value)}
        style={{
         height:36,
         padding:'0 10px',
         fontSize:12,
         fontWeight:600,
         borderRadius:8,
         border:'1px solid #e5e8eb',
         background:'#f9fafb',
         color:'#191f28',
        }}
       >
        <option value="__primary__">각 학생의 주력 교재 (1순위)</option>
        {availableBulkBookTitles.map(title => (
         <option key={title} value={`title:${title}`}>
          교재명 지정: {title}
         </option>
        ))}
        <option value="__print__">프린트 · 유인물 (개별·보충)</option>
       </select>
      </label>

      <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11,fontWeight:700,color:'#4e5968',flex:1,minWidth:210}}>
       오늘 수업 진도 범위
       <input
        type="text"
        aria-label="일괄 오늘 수업 진도 범위"
        value={bulkScopeText}
        onChange={e => setBulkScopeText(e.target.value)}
        placeholder="예: 이차방정식의 활용 p.72~78"
        style={{
         height:36,
         padding:'0 12px',
         fontSize:12.5,
         borderRadius:8,
         border:'1px solid #e5e8eb',
         background:'#f9fafb',
         color:'#191f28',
        }}
       />
      </label>

      <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:11,fontWeight:700,color:'#4e5968',flex:1,minWidth:210}}>
       부여된 다음 과제
       <input
        type="text"
        aria-label="일괄 부여된 다음 과제"
        value={bulkHomeworkText}
        onChange={e => setBulkHomeworkText(e.target.value)}
        placeholder="예: 유형 익히기 p.79~83 풀어오기"
        style={{
         height:36,
         padding:'0 12px',
         fontSize:12.5,
         borderRadius:8,
         border:'1px solid #e5e8eb',
         background:'#f9fafb',
         color:'#191f28',
        }}
       />
      </label>

      <div style={{display:'flex',alignItems:'flex-end',gap:6}}>
       <button
        type="button"
        disabled={exporting || bulkFeedbackTargets.length === 0 || (!bulkScopeText.trim() && !bulkHomeworkText.trim())}
        onClick={() => {
         const patch: { scope?: string; homework?: string } = {};
         if (bulkScopeText.trim()) patch.scope = bulkScopeText;
         if (bulkHomeworkText.trim()) patch.homework = bulkHomeworkText;
         handleBulkEditProgress(end, patch, bulkFeedbackTargets, bulkBookTarget);
        }}
        style={{
         display:'inline-flex',
         alignItems:'center',
         justifyContent:'center',
         gap:6,
         height:36,
         padding:'0 16px',
         borderRadius:8,
         border:0,
         background:bulkFeedbackTargets.length > 0 && (bulkScopeText.trim() || bulkHomeworkText.trim()) ? '#3182f6' : '#d1d6db',
         color:'#ffffff',
         fontSize:12,
         fontWeight:700,
         cursor:bulkFeedbackTargets.length > 0 && (bulkScopeText.trim() || bulkHomeworkText.trim()) ? 'pointer' : 'default',
         whiteSpace:'nowrap',
        }}
       >
        <Check size={14}/> 진도·과제 일괄 적용 ({bulkFeedbackTargets.length})
       </button>
      </div>
     </div>
    </section>
   )}

   {/* 다중 학생 선택 시 피드백 코멘트 일괄 작성 · 적용 바 */}
   {students.length > 1 && showBulkFeedbackBar && (
    <section
     aria-label="선택 학생 피드백 일괄 작성"
     style={{
      margin:'10px 24px 4px',
      padding:'14px 16px',
      background:'#ffffff',
      border:'1px solid #e5e8eb',
      borderRadius:12,
      display:'flex',
      flexDirection:'column',
      gap:10,
     }}
    >
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
       <strong style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12.5,color:'#191f28'}}>
        <MessageSquareText size={14}/> 선택 학생 피드백 일괄 적용 ({bulkFeedbackTargets.length}명)
       </strong>
       <button
        type="button"
        onClick={() =>
         setBulkFeedbackTargets(
          bulkFeedbackTargets.length === students.length ? [] : students.map(s => s.id)
         )
        }
        style={{
         padding:'3px 9px',
         fontSize:11,
         fontWeight:600,
         borderRadius:6,
         border:'1px solid #e5e8eb',
         background:'#f9fafb',
         color:'#4e5968',
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
            padding:'3px 10px',
            fontSize:11,
            fontWeight:600,
            borderRadius:999,
            border:checkedTarget ? '1px solid #191f28' : '1px solid #e5e8eb',
            background:checkedTarget ? '#191f28' : '#ffffff',
            color:checkedTarget ? '#ffffff' : '#6b7684',
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
        padding:'8px 12px',
        fontSize:12.5,
        borderRadius:8,
        border:'1px solid #e5e8eb',
        background:'#f9fafb',
        color:'#191f28',
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
        padding:'0 15px',
        borderRadius:8,
        border:'1px solid #e5e8eb',
        background:bulkFeedbackTargets.length > 0 ? '#ffffff' : '#f2f4f6',
        color:bulkFeedbackTargets.length > 0 ? '#191f28' : '#8b95a1',
        fontSize:12,
        fontWeight:700,
        cursor:bulkFeedbackTargets.length > 0 ? 'pointer' : 'default',
        whiteSpace:'nowrap',
       }}
      >
       <Check size={14}/> 일괄 적용 ({bulkFeedbackTargets.length})
      </button>
      <button
       type="button"
       disabled={exporting || aiFeedbackBusy || bulkFeedbackTargets.length === 0}
       onClick={() => openAiFeedbackModal(bulkFeedbackTargets)}
       style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        gap:6,
        padding:'0 16px',
        borderRadius:8,
        border:0,
        background:bulkFeedbackTargets.length > 0 ? '#3182f6' : '#d1d6db',
        color:'#ffffff',
        fontSize:12,
        fontWeight:700,
        cursor:bulkFeedbackTargets.length > 0 && !aiFeedbackBusy ? 'pointer' : 'default',
        whiteSpace:'nowrap',
       }}
      >
       <Sparkles size={13}/> {aiFeedbackBusy ? 'AI 작성 중…' : `AI 학생별 맞춤 작성 (${bulkFeedbackTargets.length})`}
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

   {/* AI 맞춤 총평 작성 설정 모달 (토스/노션 화이트 미니멀 스타일) */}
   {aiFeedbackModalOpen && (
    <div
     role="dialog"
     aria-modal="true"
     aria-label="AI 맞춤 총평 작성"
     onClick={e => {
      if (e.target === e.currentTarget && !aiFeedbackBusy) setAiFeedbackModalOpen(false);
     }}
     style={{
      position:'fixed',
      inset:0,
      zIndex:115,
      background:'rgba(25, 31, 40, 0.45)',
      backdropFilter:'blur(4px)',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      padding:20,
     }}
    >
     <div
      style={{
       width:'100%',
       maxWidth:660,
       maxHeight:'90vh',
       background:'#ffffff',
       border:'1px solid #e5e8eb',
       borderRadius:20,
       boxShadow:'0 24px 64px rgba(25, 31, 40, 0.16)',
       display:'flex',
       flexDirection:'column',
       overflow:'hidden',
      }}
     >
      {/* 모달 헤더 (화이트 미니멀) */}
      <div
       style={{
        padding:'20px 24px 16px',
        background:'#ffffff',
        borderBottom:'1px solid #f2f4f6',
        display:'flex',
        alignItems:'flex-start',
        justifyContent:'space-between',
        gap:12,
       }}
      >
       <div style={{display:'flex',flexDirection:'column',gap:4}}>
        <strong style={{fontSize:17,fontWeight:800,color:'#191f28',letterSpacing:'-0.02em',display:'inline-flex',alignItems:'center',gap:7}}>
         <Sparkles size={17} color="#3182f6"/> AI 맞춤 총평 작성 ({periodKorText})
        </strong>
        <span style={{fontSize:12.5,color:'#6b7684'}}>
         반드시 들어가야 하는 단어·문구를 입력하면 학생별 기존 학습 요소와 조합해 문장을 완성합니다.
        </span>
       </div>
       <button
        type="button"
        disabled={aiFeedbackBusy}
        onClick={() => setAiFeedbackModalOpen(false)}
        style={{
         padding:'6px 10px',
         borderRadius:8,
         border:0,
         background:'#f2f4f6',
         color:'#4e5968',
         fontSize:12,
         fontWeight:600,
         cursor:aiFeedbackBusy ? 'default' : 'pointer',
         display:'inline-flex',
         alignItems:'center',
         gap:4,
        }}
       >
        <X size={14}/> 닫기
       </button>
      </div>

      {/* 모달 본문 */}
      <div style={{padding:'20px 24px',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
       {/* 1. 반드시 들어가야 하는 말 입력 공간 */}
       <div
        style={{
         padding:'16px',
         background:'#f9fafb',
         border:'1px solid #e5e8eb',
         borderRadius:14,
         display:'flex',
         flexDirection:'column',
         gap:10,
        }}
       >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
         <strong style={{fontSize:13.5,fontWeight:700,color:'#191f28',display:'inline-flex',alignItems:'center',gap:6}}>
          1. 총평에 반드시 들어가야 하는 말 / 핵심 단어
         </strong>
         {aiMustIncludeText && (
          <button
           type="button"
           onClick={() => setAiMustIncludeText('')}
           style={{
            padding:'3px 9px',
            fontSize:11,
            fontWeight:600,
            borderRadius:6,
            border:'1px solid #e5e8eb',
            background:'#ffffff',
            color:'#6b7684',
            cursor:'pointer',
           }}
          >
           초기화
          </button>
         )}
        </div>

        <textarea
         rows={3}
         autoFocus
         aria-label="총평에 반드시 들어가야 하는 말"
         value={aiMustIncludeText}
         onChange={e => setAiMustIncludeText(e.target.value)}
         placeholder="예: 계산 실수 줄이기, 풀이 과정 노트 정리, 다음 주 단원평가 대비, 최근 수업 집중력이 좋아짐 등&#10;(단어나 짧은 구절을 쉼표로 구분해 적으면 기존 학습 기록과 자연스럽게 어우러진 문장으로 완성합니다)"
         style={{
          width:'100%',
          padding:'11px 13px',
          fontSize:13,
          lineHeight:1.55,
          borderRadius:10,
          border:'1px solid #d1d6db',
          background:'#ffffff',
          color:'#191f28',
          resize:'vertical',
         }}
        />

        <div style={{display:'flex',flexDirection:'column',gap:6}}>
         <span style={{fontSize:11.5,fontWeight:600,color:'#6b7684'}}>
          추천 키워드 클릭하여 추가
         </span>
         <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {[
           '계산 실수 줄이기',
           '풀이 과정 또박또박 쓰기',
           '수업 집중력·태도 향상',
           '오답 노트 복습 철저',
           '질문하는 태도 우수',
           '다음 주 단원평가 대비',
           '서술형 식 전개 연습',
           '과제 기한 엄수',
          ].map(kw => {
           const activeKw = aiMustIncludeText.includes(kw);
           return (
            <button
             key={kw}
             type="button"
             onClick={() => {
              setAiMustIncludeText(prev => {
               const tokens = prev
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
               if (tokens.includes(kw)) {
                return tokens.filter(t => t !== kw).join(', ');
               }
               return [...tokens, kw].join(', ');
              });
             }}
             style={{
              padding:'5px 11px',
              fontSize:11.5,
              fontWeight:600,
              borderRadius:999,
              border:activeKw ? '1px solid #191f28' : '1px solid #e5e8eb',
              background:activeKw ? '#191f28' : '#ffffff',
              color:activeKw ? '#ffffff' : '#4e5968',
              cursor:'pointer',
             }}
            >
             {activeKw ? '✓ ' : '+ '}{kw}
            </button>
           );
          })}
         </div>
        </div>
       </div>

       {/* 2. 총평 문체 · 어조 스타일 선택 */}
       <div
        style={{
         padding:'14px 16px',
         background:'#ffffff',
         border:'1px solid #e5e8eb',
         borderRadius:14,
         display:'flex',
         flexDirection:'column',
         gap:8,
        }}
       >
        <strong style={{fontSize:13,fontWeight:700,color:'#191f28'}}>2. 문장 어조 · 스타일</strong>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:8}}>
         {([
          { key: 'counsel', label: '학부모 상담형', desc: '신뢰감 있고 정중한 기본 총평' },
          { key: 'praise', label: '칭찬 · 동기부여형', desc: '성취와 긍정적 변화 중심 격려' },
          { key: 'coaching', label: '학습 코칭형', desc: '학습 습관·보완 방향 제시' },
          { key: 'concise', label: '핵심 브리핑형', desc: '핵심 지표와 전달사항 요약' },
         ] as const).map(opt => (
          <button
           key={opt.key}
           type="button"
           onClick={() => setAiToneStyle(opt.key)}
           style={{
            padding:'9px 11px',
            borderRadius:10,
            border:aiToneStyle === opt.key ? '1.5px solid #3182f6' : '1px solid #e5e8eb',
            background:aiToneStyle === opt.key ? '#eff6ff' : '#ffffff',
            color:aiToneStyle === opt.key ? '#1d4ed8' : '#333d4b',
            textAlign:'left',
            cursor:'pointer',
            display:'flex',
            flexDirection:'column',
            gap:2,
           }}
          >
           <strong style={{fontSize:12,fontWeight:700}}>{opt.label}</strong>
           <small style={{fontSize:10.5,color:'#6b7684'}}>{opt.desc}</small>
          </button>
         ))}
        </div>
       </div>

       {/* 3. 대상 학생 및 조합될 기존 요소 확인 + 학생별 개별 추가 단어 */}
       <div
        style={{
         padding:'14px 16px',
         background:'#ffffff',
         border:'1px solid #e5e8eb',
         borderRadius:14,
         display:'flex',
         flexDirection:'column',
         gap:10,
        }}
       >
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
         <strong style={{fontSize:13,fontWeight:700,color:'#191f28'}}>
          3. 적용 대상 학생 및 기존 학습 요소 ({bulkFeedbackTargets.length || students.length}명)
         </strong>
         {students.length > 1 && (
          <div style={{display:'flex',gap:6}}>
           {activeReport && (
            <button
             type="button"
             onClick={() => setBulkFeedbackTargets([activeReport.id])}
             style={{
              padding:'4px 10px',
              fontSize:11,
              fontWeight:600,
              borderRadius:7,
              border:'1px solid #e5e8eb',
              background:'#f9fafb',
              color:'#333d4b',
              cursor:'pointer',
             }}
            >
             현재 학생만 ({activeReport.name})
            </button>
           )}
           <button
            type="button"
            onClick={() =>
             setBulkFeedbackTargets(
              bulkFeedbackTargets.length === students.length ? [] : students.map(s => s.id)
             )
            }
            style={{
             padding:'4px 10px',
             fontSize:11,
             fontWeight:600,
             borderRadius:7,
             border:'1px solid #e5e8eb',
             background:'#f9fafb',
             color:'#333d4b',
             cursor:'pointer',
            }}
           >
            {bulkFeedbackTargets.length === students.length ? '전체 해제' : `전체 선택 (${students.length}명)`}
           </button>
          </div>
         )}
        </div>

        {students.length === 0 ? (
         <div style={{padding:'16px',borderRadius:10,background:'#f9fafb',border:'1px solid #e5e8eb',color:'#4e5968',fontSize:12.5,fontWeight:600}}>
          왼쪽 학생 목록에서 총평을 작성할 학생이나 반을 먼저 선택해 주세요.
         </div>
        ) : (
         <div
          style={{
           maxHeight:190,
           overflowY:'auto',
           border:'1px solid #e5e8eb',
           borderRadius:10,
          }}
         >
          {students.map(s => {
           const checked = bulkFeedbackTargets.length === 0 || bulkFeedbackTargets.includes(s.id);
           const rep = reports.find(r => r.id === s.id);
           const hasAtt = enabledKinds.includes('attendance') && Boolean(rep?.daily.some(d => d.record_date >= start && d.record_date <= end && d.attendance));
           const hasHw = enabledKinds.includes('homework') && Boolean(rep?.wrong.some(w => w.record_date >= start && w.record_date <= end && w.homework_status));
           const hasGrades = enabledKinds.includes('grades') && Boolean(rep?.daily.some(d => d.record_date <= end && d.exams.length > 0));
           const hasWrong = enabledKinds.includes('wrong') && Boolean(rep?.wrong.some(w => w.record_date >= start && w.record_date <= end && (w.completed || w.total_wrong > 0)));
           const hasProg = enabledKinds.includes('progress') && Boolean(
            rep?.entries.some(e => e.record_date >= start && e.record_date <= end && (e.scope?.trim() || e.homework?.trim())) ||
            rep?.books.some(b => !b.archived && b.curriculum !== '프린트' && b.title !== '프린트 · 유인물')
           );
           const recordedBadges = [
            hasAtt ? '출결' : '',
            hasHw ? '과제' : '',
            hasProg ? '진도' : '',
            hasGrades ? '성적' : '',
            hasWrong ? '오답' : '',
           ].filter(Boolean);

           return (
            <div
             key={s.id}
             style={{
              display:'flex',
              alignItems:'center',
              justifyContent:'space-between',
              gap:10,
              padding:'9px 12px',
              borderBottom:'1px solid #f2f4f6',
              background:checked ? '#ffffff' : '#f9fafb',
              flexWrap:'wrap',
             }}
            >
             <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',minWidth:130}}>
              <input
               type="checkbox"
               checked={checked}
               onChange={() =>
                setBulkFeedbackTargets(prev => {
                 const base = prev.length === 0 ? students.map(st => st.id) : prev;
                 return base.includes(s.id) ? base.filter(id => id !== s.id) : [...base, s.id];
                })
               }
              />
              <span style={{fontSize:13,fontWeight:700,color:'#191f28'}}>{s.name}</span>
              <small style={{fontSize:11,color:'#8b95a1'}}>{s.grade}</small>
             </label>

             <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
              {recordedBadges.length > 0 ? (
               recordedBadges.map(b => (
                <span
                 key={b}
                 style={{
                  fontSize:10.5,
                  fontWeight:600,
                  padding:'2px 7px',
                  borderRadius:6,
                  background:'#f2f4f6',
                  color:'#4e5968',
                 }}
                >
                 {b}
                </span>
               ))
              ) : (
               <span style={{fontSize:10.5,color:'#8b95a1',background:'#f2f4f6',padding:'2px 7px',borderRadius:6}}>
                수업태도 + 입력단어 조합
               </span>
              )}
             </div>

             <input
              type="text"
              value={aiStudentKeywords[s.id] || ''}
              onChange={e => setAiStudentKeywords(prev => ({ ...prev, [s.id]: e.target.value }))}
              placeholder={`${s.name} 학생만 추가할 단어 (선택)`}
              style={{
               width:185,
               height:28,
               padding:'0 8px',
               borderRadius:6,
               border:'1px solid #e5e8eb',
               background:'#f9fafb',
               fontSize:11.5,
              }}
             />
            </div>
           );
          })}
         </div>
        )}
       </div>
      </div>

      {/* 모달 푸터 액션 */}
      <div
       style={{
        padding:'14px 24px',
        background:'#ffffff',
        borderTop:'1px solid #f2f4f6',
        display:'flex',
        alignItems:'center',
        justifyContent:'space-between',
        flexWrap:'wrap',
        gap:10,
       }}
      >
       <span style={{fontSize:11.5,color:'#8b95a1'}}>
        일부 요소가 빠져 있어도 기록된 항목과 입력 단어를 자연스럽게 조합합니다.
       </span>
       <div style={{display:'flex',alignItems:'center',gap:8}}>
        <button
         type="button"
         disabled={aiFeedbackBusy}
         onClick={() => setAiFeedbackModalOpen(false)}
         style={{
          padding:'9px 15px',
          borderRadius:9,
          border:'1px solid #e5e8eb',
          background:'#ffffff',
          color:'#4e5968',
          fontSize:12.5,
          fontWeight:600,
          cursor:'pointer',
         }}
        >
         취소
        </button>
        <button
         type="button"
         disabled={aiFeedbackBusy || students.length === 0}
         onClick={() =>
          void handleAiGeneratePersonalizedFeedbacks(
           bulkFeedbackTargets.length > 0 ? bulkFeedbackTargets : students.map(s => s.id),
           {
            mustInclude: aiMustIncludeText,
            studentKeywords: aiStudentKeywords,
            toneStyle: aiToneStyle,
           }
          )
         }
         style={{
          padding:'9px 18px',
          borderRadius:9,
          border:0,
          background:students.length > 0 ? '#3182f6' : '#d1d6db',
          color:'#ffffff',
          fontSize:13,
          fontWeight:700,
          cursor:students.length > 0 && !aiFeedbackBusy ? 'pointer' : 'default',
          display:'inline-flex',
          alignItems:'center',
          gap:6,
         }}
        >
         <Sparkles size={14}/>
         {aiFeedbackBusy
          ? '문장 완성 중…'
          : `문장 완성 및 리포트 적용 (${bulkFeedbackTargets.length || students.length}명)`}
        </button>
       </div>
      </div>
     </div>
    </div>
   )}

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
        <ReportSheets
         preview={activeReport}
         template={template}
         onEditFeedback={handleEditFeedback}
         onBulkEditFeedback={(dateStr, memoText) => handleBulkEditFeedback(dateStr, memoText)}
         bulkTargetCount={bulkFeedbackTargets.length || students.length}
         onEditHeader={handleEditHeader}
         onEditProgress={handleEditProgress}
        />
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
          background:kakaoBridgeAlive ? '#15803d' : '#dc2626',
          color:'#ffffff',
         }}
        >
         {kakaoBridgeChecking
          ? '● PC 데스크톱 앱 연결 확인 중…'
          : kakaoBridgeAlive
            ? `● 코스매스 데스크톱 앱 연결됨 (v${desktopAppVersion || '1.0.0'})`
            : '● PC 전용 데스크톱 앱 필요'}
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
       {/* 새 버전 업데이트 알림 배너 (데스크톱 앱 구버전 접속 시) */}
       {kakaoBridgeAlive && desktopUpdateInfo?.hasUpdate && (
        <div
         style={{
          padding:'12px 16px',
          background:'#eff6ff',
          border:'1.5px solid #3b82f6',
          borderRadius:12,
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          flexWrap:'wrap',
          gap:12,
         }}
        >
         <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <strong style={{fontSize:13,color:'#1e40af'}}>
           ✨ 코스매스 데스크톱 앱 새 버전(v{desktopUpdateInfo.latestVersion})이 출시되었습니다!
          </strong>
          <span style={{fontSize:12,color:'#334155'}}>
           {desktopUpdateInfo.releaseNotes || '안정성 및 카카오톡 자동 발송 기능이 개선되었습니다.'}
          </span>
         </div>
         <button
          type="button"
          onClick={() => void applyDesktopAppUpdate()}
          style={{
           padding:'7px 14px',
           borderRadius:8,
           border:0,
           background:'#2563eb',
           color:'#ffffff',
           fontSize:12,
           fontWeight:800,
           cursor:'pointer',
          }}
         >
          지금 자동 업데이트
         </button>
        </div>
       )}

       {/* 일반 웹 브라우저 접속 등 데스크톱 앱이 켜져 있지 않을 때 다운로드 전용 안내 */}
       {!kakaoBridgeAlive && (
        <div
         style={{
          padding:'22px 20px',
          background:'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
          color:'#ffffff',
          borderRadius:14,
          display:'flex',
          flexDirection:'column',
          gap:12,
          boxShadow:'0 12px 30px rgba(15, 23, 42, 0.18)',
         }}
        >
         <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <span
           style={{
            fontSize:11,
            fontWeight:800,
            padding:'4px 10px',
            borderRadius:999,
            background:'rgba(250, 225, 0, 0.2)',
            color:'#fae100',
            border:'1px solid rgba(250, 225, 0, 0.4)',
           }}
          >
           PC 앱 전용 기능
          </span>
          <span style={{fontSize:11.5,color:'#93c5fd'}}>
           Windows 10 / 11 지원 · Supabase 클라우드 계정 자동 연동
          </span>
         </div>

         <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <h3 style={{margin:0,fontSize:17,fontWeight:900,color:'#ffffff'}}>
           카카오톡 원클릭 자동 발송은 「코스매스 PC 전용 앱」에서 실행됩니다
          </h3>
          <p style={{margin:0,fontSize:12.5,color:'#cbd5e1',lineHeight:1.6}}>
           웹 브라우저에서는 내 PC의 카카오톡 창을 직접 제어할 수 없어 전용 데스크톱 앱이 필요합니다.<br/>
           아래 버튼을 눌러 <b>코스매스 데스크톱 앱(.exe)</b>을 다운로드하여 실행하시면, 지금 보고 계신 학원 데이터(Supabase)가 그대로 연동되며 버튼 한 번으로 전체 학생 리포트가 카카오톡으로 자동 전송됩니다.
          </p>
         </div>

         <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:4}}>
          <a
           href="/downloads/Cosmath-Desktop-App.exe"
           download="Cosmath-Desktop-App.exe"
           style={{
            padding:'10px 18px',
            borderRadius:10,
            background:'#fae100',
            color:'#3c1e1e',
            fontSize:13,
            fontWeight:900,
            textDecoration:'none',
            display:'inline-flex',
            alignItems:'center',
            gap:8,
            boxShadow:'0 4px 14px rgba(250, 225, 0, 0.3)',
           }}
          >
           <Download size={15}/> 코스매스 PC 데스크톱 앱 다운로드 (.exe)
          </a>
          <button
           type="button"
           onClick={() => void checkKakaoBridge()}
           style={{
            padding:'10px 14px',
            borderRadius:10,
            border:'1px solid rgba(255,255,255,0.28)',
            background:'rgba(255,255,255,0.1)',
            color:'#ffffff',
            fontSize:12,
            fontWeight:800,
            cursor:'pointer',
           }}
          >
           {kakaoBridgeChecking ? '연결 확인 중…' : '🔄 앱을 실행했다면 연결 다시 확인'}
          </button>
         </div>
        </div>
       )}

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
          동작 간격 (초 · 최소 0.1초)
          <input
           type="number"
           min={0.1}
           max={5}
           step={0.1}
           value={kakaoDelay}
           onChange={e => setKakaoDelay(Math.max(0.1, Number(e.target.value) || 0.1))}
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
        ) : !kakaoBridgeAlive ? (
         <a
          href="/downloads/Cosmath-Desktop-App.exe"
          download="Cosmath-Desktop-App.exe"
          style={{
           padding:'9px 20px',
           borderRadius:9,
           border:'1px solid #1d4ed8',
           background:'#2563eb',
           color:'#ffffff',
           fontSize:13,
           fontWeight:900,
           textDecoration:'none',
           display:'inline-flex',
           alignItems:'center',
           gap:6,
          }}
         >
          <Download size={14}/> PC 데스크톱 앱 다운로드 후 사용 가능
         </a>
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
