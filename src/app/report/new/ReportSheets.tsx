import {useEffect,useState,type CSSProperties} from 'react';
import dayjs from 'dayjs';
import {
 Check,
 CheckCircle2,
 CalendarCheck2,
 ClipboardCheck,
 BookOpen,
 FileWarning,
 Award,
 Lightbulb,
 MessageSquareText,
 PenLine,
 Sparkles,
 GraduationCap,
 Clock,
 AlertCircle,
 Calendar,
 TrendingUp,
 Megaphone,
 Plus,
} from 'lucide-react';
import {progressPercent,type ProgressBook,type ProgressEntry} from '../../../types/progress';
import {wrongAnswerStatus,type StudentDailyRecord} from '../../../types/student-daily';
import type {WrongAnswerRecord} from '../../../types/wrong-answer';
import {presets,kinds as kindLabels,type Kind,type Template,type Theme,type BlockSpan,type BlockHeight} from './templates';
import styles from './builder.module.css';

export type Preview={
 id:string;
 name:string;
 grade:string;
 group:string;
 start:string;
 end:string;
 daily:StudentDailyRecord[];
 wrong:WrongAnswerRecord[];
 books:ProgressBook[];
 entries:ProgressEntry[];
};

export interface ReportEditHandlers {
 onUpdateDailyWrong: (
  studentId: string,
  recordDate: string,
  patch: {
   attendance?: StudentDailyRecord['attendance'];
   reason?: string;
   homework_status?: WrongAnswerRecord['homework_status'];
   total_wrong?: number;
   corrected_count?: number;
   memo?: string;
  }
 ) => void;
 onUpdateProgress: (
  studentId: string,
  params: {
   bookId?: string;
   entryId?: string;
   recordDate: string;
   scope?: string;
   homework?: string;
   dueDate?: string | null;
   memo?: string;
   completedPage?: number;
   totalPages?: number;
   newBookTitle?: string;
  }
 ) => void;
 onUpdateComment: (
  studentId: string,
  commentId: string,
  newText: string,
  fallbackDate: string
 ) => void;
}

function InlineTextField({
 value,
 placeholder,
 onCommit,
 style,
 ariaLabel,
}: {
 value: string;
 placeholder?: string;
 onCommit: (next: string) => void;
 style?: CSSProperties;
 ariaLabel?: string;
}) {
 const [draft, setDraft] = useState(value);
 useEffect(() => {
  setDraft(value);
 }, [value]);
 return (
  <input
   type="text"
   value={draft}
   placeholder={placeholder}
   aria-label={ariaLabel || placeholder || '텍스트 직접 입력'}
   className={styles.inlineTextInput}
   style={style}
   onChange={e => setDraft(e.target.value)}
   onBlur={() => {
    if (draft !== value) onCommit(draft);
   }}
   onKeyDown={e => {
    if (e.key === 'Enter') {
     e.currentTarget.blur();
    }
   }}
  />
 );
}

function InlineTextareaField({
 value,
 placeholder,
 onCommit,
 style,
 ariaLabel,
}: {
 value: string;
 placeholder?: string;
 onCommit: (next: string) => void;
 style?: CSSProperties;
 ariaLabel?: string;
}) {
 const [draft, setDraft] = useState(value);
 useEffect(() => {
  setDraft(value);
 }, [value]);
 return (
  <textarea
   rows={Math.max(2, Math.min(5, draft.split('\n').length))}
   value={draft}
   placeholder={placeholder}
   aria-label={ariaLabel || placeholder || '코멘트 직접 입력'}
   className={styles.inlineTextarea}
   style={style}
   onChange={e => setDraft(e.target.value)}
   onBlur={() => {
    if (draft !== value) onCommit(draft);
   }}
   onKeyDown={e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
     e.currentTarget.blur();
    }
   }}
  />
 );
}

const shortDate=(v:string)=>dayjs(v).format('M/D');
const korWeekdays=['일','월','화','수','목','금','토'] as const;
const monToSunLabels=['월','화','수','목','금','토','일'] as const;

function computeStudentData(p:Preview){
 const daily=p.daily.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const wrong=p.wrong.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const entriesInPeriod=p.entries.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const single=p.start===p.end;
 const dateLabel=single?dayjs(p.end).format('YYYY.MM.DD'):`${dayjs(p.start).format('YYYY.MM.DD')} ~ ${dayjs(p.end).format('YYYY.MM.DD')}`;
 const daySpanCount=Math.max(1,dayjs(p.end).diff(dayjs(p.start),'day')+1);

 // 1. 출결 (StudentDailyRecord)
 const attended=daily.filter(r=>r.attendance==='출석').length;
 const late=daily.filter(r=>r.attendance==='지각').length;
 const absent=daily.filter(r=>r.attendance==='결석').length;
 const earlyLeave=daily.filter(r=>r.attendance==='조퇴').length;
 const recordedAtt=daily.filter(r=>r.attendance).length;
 const attRate=recordedAtt>0?Math.round(attended/recordedAtt*100):null;
 const todayAttRecord=daily.find(r=>r.record_date===p.end)??daily[daily.length-1];
 const todayAtt=todayAttRecord?.attendance||'';
 const todayAttReason=todayAttRecord?.reason.trim()||'';

 // 주간(월~일 7일) 출결/숙제/오답 타임라인
 const weekMonday=dayjs(p.end).subtract((dayjs(p.end).day()+6)%7,'day');
 const weekDays=Array.from({length:7}).map((_,idx)=>{
  const d=weekMonday.add(idx,'day').format('YYYY-MM-DD');
  const dRec=p.daily.find(r=>r.record_date===d);
  const wRec=p.wrong.find(r=>r.record_date===d);
  return {
   date:d,
   label:monToSunLabels[idx],
   short:dayjs(d).format('M/D'),
   dayNum:dayjs(d).format('D'),
   attendance:dRec?.attendance||'',
   reason:dRec?.reason.trim()||'',
   hw:wRec?.homework_status||null,
   totalWrong:wRec?.total_wrong??null,
   fixedWrong:wRec?.corrected_count??null,
   exams:dRec?.exams??[],
  };
 });

 // 월간 달력 그리드 (해당 월 1일 ~ 말일)
 const monthRef=dayjs(p.end);
 const monthStart=monthRef.startOf('month');
 const daysInMonth=monthRef.daysInMonth();
 const startDow=monthStart.day(); // 0(일) ~ 6(토)
 const calendarCells:(null|{
  day:number;
  date:string;
  attendance:StudentDailyRecord['attendance'];
  hw:WrongAnswerRecord['homework_status'];
  examCount:number;
 })[]=[];
 for(let i=0;i<startDow;i++)calendarCells.push(null);
 for(let d=1;d<=daysInMonth;d++){
  const fullDate=monthStart.date(d).format('YYYY-MM-DD');
  const dRec=daily.find(r=>r.record_date===fullDate);
  const wRec=wrong.find(r=>r.record_date===fullDate);
  calendarCells.push({
   day:d,
   date:fullDate,
   attendance:dRec?.attendance||'',
   hw:wRec?.homework_status||null,
   examCount:dRec?.exams.length??0,
  });
 }
 while(calendarCells.length%7!==0)calendarCells.push(null);

 // 2. 숙제 검사 (WrongAnswerRecord.homework_status: O / △ / X)
 const hwLabels={O:'완료', '△':'일부 완료', X:'미완료'} as const;
 const hwRecorded=wrong.filter(r=>r.homework_status);
 const hwDone=hwRecorded.filter(r=>r.homework_status==='O').length;
 const hwPartial=hwRecorded.filter(r=>r.homework_status==='△').length;
 const hwMiss=hwRecorded.filter(r=>r.homework_status==='X').length;
 const hwRate=hwRecorded.length>0?Math.round((hwDone+hwPartial*0.5)/hwRecorded.length*100):null;
 const todayWrongRecord=wrong.find(r=>r.record_date===p.end)??wrong[wrong.length-1];
 const todayHwStatus=todayWrongRecord?.homework_status||null;
 const todayTotalWrong=todayWrongRecord?.total_wrong??0;
 const todayFixedWrong=todayWrongRecord?.corrected_count??0;
 const todayWrongMemo=todayWrongRecord?.memo??'';

 // 3. 오답 클리닉 (WrongAnswerRecord.total_wrong, corrected_count, memo)
 const hasWrongRecord=wrong.length>0;
 const totalWrong=wrong.reduce((n,r)=>n+r.total_wrong,0);
 const fixedWrong=wrong.reduce((n,r)=>n+r.corrected_count,0);
 const remainWrong=Math.max(0,totalWrong-fixedWrong);
 const wrongRate=totalWrong>0?Math.round(fixedWrong/totalWrong*100):hasWrongRecord?100:null;
 const wrongSymbol=wrongAnswerStatus(totalWrong,fixedWrong);

 // 4. 시험 성적 (StudentDailyRecord.exams)
 const exams=daily.flatMap(r=>
  r.exams
   .filter(e=>Number.isFinite(e.score)&&Number.isFinite(e.max_score)&&e.max_score>0&&e.score>=0&&e.score<=e.max_score)
   .map(e=>({...e,date:r.record_date,rate:Math.round(e.score/e.max_score*100)}))
 );
 const avgScore=exams.length>0?Math.round(exams.reduce((a,b)=>a+b.rate,0)/exams.length):null;
 const maxScore=exams.length>0?Math.max(...exams.map(e=>e.rate)):null;

 // 5. 교재 및 진도 기록 (ProgressBook & ProgressEntry)
 const activeBooks=p.books.filter(b=>!b.archived);
 const bookProgressList=activeBooks.map(book=>{
  const periodBookEntries=entriesInPeriod.filter(e=>e.book_id===book.id);
  const latestEntry=[...p.entries].reverse().find(e=>e.book_id===book.id);
  const firstEntry=periodBookEntries[0]??latestEntry;
  const refEntry=periodBookEntries[periodBookEntries.length-1]??latestEntry;
  const units=refEntry?.units_snapshot??book.units;
  const totalPages=refEntry?.total_pages_snapshot||book.total_pages||units.length;
  const donePages=refEntry?.total_pages_snapshot?(refEntry.completed_page??0):book.total_pages?(book.completed_page??0):units.filter(u=>(refEntry?.states??book.states)[u.id]==='완료').length;
  const pct=totalPages>0?Math.min(100,Math.round(donePages/totalPages*100)):progressPercent(book);
  const scopes=periodBookEntries.map(e=>e.scope.trim()).filter(Boolean);
  const firstScope=firstEntry?.scope.trim()||'첫 단원';
  const lastScope=refEntry?.scope.trim()||`${donePages}/${totalPages}p`;
  const kindBadge=/모의|실모|기출|N제/i.test(book.title)?'실전·기출':/개념|바이블|정석|원리/i.test(book.title)?'개념서':'문제집';
  return {
   id:book.id,
   title:book.title,
   curriculum:book.curriculum,
   course:book.course,
   kindBadge,
   scope:scopes.length?scopes.join(' / '):(refEntry?.scope.trim()||'진도 범위 미기록'),
   rawLastScope:refEntry?.scope.trim()||'',
   latestEntryId:refEntry?.id,
   latestHomework:refEntry?.homework.trim()||'',
   latestDueDate:refEntry?.due_date||null,
   firstScope,
   lastScope,
   journeyLabel:scopes.length>=2?`${scopes[0]} → ${scopes[scopes.length-1]}`:(refEntry?.scope.trim()||`${donePages}p / ${totalPages}p (${pct}%)`),
   recordDate:refEntry?.record_date||'',
   totalPages,
   donePages,
   pct,
   hasPeriodEntry:periodBookEntries.length>0,
  };
 });
 const avgProgress=bookProgressList.length>0?Math.round(bookProgressList.reduce((a,b)=>a+b.pct,0)/bookProgressList.length):null;

 // 기간 내 일자별 진도 기록 (주간 진도표용)
 const periodProgressLogs=entriesInPeriod.map(e=>{
  const book=p.books.find(b=>b.id===e.book_id);
  const units=e.units_snapshot??book?.units??[];
  const total=e.total_pages_snapshot||book?.total_pages||units.length;
  const done=e.total_pages_snapshot?(e.completed_page??0):units.filter(u=>e.states[u.id]==='완료').length;
  const pct=total>0?Math.min(100,Math.round(done/total*100)):0;
  return {
   id:e.id,
   bookId:e.book_id,
   entryId:e.id,
   date:e.record_date,
   bookTitle:book?.title||'교재',
   course:book?.course||'수학',
   scope:e.scope.trim()||'학습 범위 미기록',
   rawScope:e.scope,
   homework:e.homework.trim(),
   dueDate:e.due_date,
   pct,
   done,
   total,
  };
 });

 // 6. 부여된 다음 과제 (ProgressEntry.homework & due_date)
 const homeworkTasks=entriesInPeriod
  .filter(e=>e.homework.trim())
  .map(e=>({
   id:e.id,
   bookId:e.book_id,
   entryId:e.id,
   date:e.record_date,
   bookTitle:p.books.find(b=>b.id===e.book_id)?.title||'교재',
   homework:e.homework.trim(),
   dueDate:e.due_date,
  }));

 // 7. 선생님 코멘트·메모 통합
 const comments:{id:string;date:string;tag:string;text:string}[]=[];
 for(const e of entriesInPeriod){
  if(e.memo.trim()){
   const title=p.books.find(b=>b.id===e.book_id)?.title||'진도 피드백';
   comments.push({id:`entry-${e.id}`,date:e.record_date,tag:title,text:e.memo.trim()});
  }
 }
 for(const w of wrong){
  if(w.memo.trim()){
   comments.push({id:`wrong-${w.id}`,date:w.record_date,tag:'오답 클리닉',text:w.memo.trim()});
  }
 }
 for(const r of daily){
  for(const ex of r.exams){
   if(ex.memo.trim()){
    comments.push({id:`exam-${ex.id}`,date:r.record_date,tag:`시험 · ${ex.name}`,text:ex.memo.trim()});
   }
  }
  if(r.reason.trim()){
   comments.push({id:`att-${r.id}`,date:r.record_date,tag:`출결 · ${r.attendance||'비고'}`,text:r.reason.trim()});
  }
 }

 // 8. 날마다 리듬 막대 데이터 (최근 최대 14개 기록일 또는 주간 7일)
 const dailyRhythmBars = (() => {
  const dateSet = new Set<string>();
  daily.forEach(d => dateSet.add(d.record_date));
  wrong.forEach(w => dateSet.add(w.record_date));
  entriesInPeriod.forEach(e => dateSet.add(e.record_date));
  const sortedDates = [...dateSet].sort();
  if (sortedDates.length >= 3) {
   return sortedDates.slice(-14).map(d => {
    const dRec = daily.find(r => r.record_date === d);
    const wRec = wrong.find(r => r.record_date === d);
    const eRecs = entriesInPeriod.filter(r => r.record_date === d);
    const exAvg = dRec?.exams?.length
     ? Math.round(dRec.exams.reduce((a, b) => a + (b.max_score > 0 ? (b.score / b.max_score) * 100 : 0), 0) / dRec.exams.length)
     : null;
    const scoreVal = exAvg !== null
     ? exAvg
     : wRec?.homework_status === 'O'
       ? 92
       : wRec?.homework_status === '△'
         ? 68
         : dRec?.attendance === '출석'
           ? 84
           : eRecs.length > 0
             ? 80
             : 45;
    const dow = korWeekdays[dayjs(d).day()];
    return {
     date: d,
     dayNum: dayjs(d).format('D'),
     dow,
     isWeekend: dayjs(d).day() === 0 || dayjs(d).day() === 6,
     value: Math.max(18, Math.min(100, scoreVal)),
     label: exAvg !== null ? `${exAvg}점` : (wRec?.homework_status || dRec?.attendance || '기록'),
    };
   });
  }
  return weekDays.map((wd, idx) => ({
   date: wd.date,
   dayNum: wd.dayNum,
   dow: wd.label,
   isWeekend: idx >= 5,
   value: wd.attendance === '출석' ? (wd.hw === 'O' ? 95 : 80) : wd.hw === 'O' ? 88 : 24,
   label: wd.attendance || '-',
  }));
 })();

 return {
  daily,
  wrong,
  entriesInPeriod,
  single,
  dateLabel,
  daySpanCount,
  attended,
  late,
  absent,
  earlyLeave,
  recordedAtt,
  attRate,
  todayAtt,
  todayAttReason,
  weekDays,
  monthLabel:monthRef.format('YYYY년 M월'),
  calendarCells,
  hwLabels,
  hwRecorded,
  hwDone,
  hwPartial,
  hwMiss,
  hwRate,
  todayHwStatus,
  todayTotalWrong,
  todayFixedWrong,
  todayWrongMemo,
  hasWrongRecord,
  totalWrong,
  fixedWrong,
  remainWrong,
  wrongRate,
  wrongSymbol,
  exams,
  avgScore,
  maxScore,
  bookProgressList,
  avgProgress,
  periodProgressLogs,
  homeworkTasks,
  comments,
  dailyRhythmBars,
 };
}

type StudentData = ReturnType<typeof computeStudentData>;

interface LayoutConfig {
 enabledSet: Set<Kind>;
 hasKind: (k: Kind) => boolean;
 getSpan: (k: Kind, fallback: BlockSpan) => BlockSpan;
 getRowLimit: (k: Kind, defaultRows: number) => number;
 showNextHw: boolean;
 orderedKinds: Kind[];
}

function buildLayoutConfig(template: Template, s: StudentData): LayoutConfig {
 const rawBlocks = Array.isArray(template.blocks) && template.blocks.length > 0 ? template.blocks : presets[0].blocks;
 const enabledSet = new Set<Kind>(rawBlocks.map(b => b.kind));
 const hideEmpty = Boolean(template.hideEmpty);

 const hasDataFor = (k: Kind): boolean => {
  if (!hideEmpty) return true;
  switch (k) {
   case 'attendance': return s.recordedAtt > 0 || Boolean(s.todayAtt);
   case 'homework': return s.hwRecorded.length > 0 || Boolean(s.todayHwStatus);
   case 'wrong': return s.hasWrongRecord && s.totalWrong > 0;
   case 'grades': return s.exams.length > 0;
   case 'progress': return s.bookProgressList.length > 0 || s.periodProgressLogs.length > 0;
   case 'feedback': return true;
  }
 };

 const hasKind = (k: Kind) => enabledSet.has(k) && hasDataFor(k);

 const getSpan = (k: Kind, fallback: BlockSpan): BlockSpan => {
  const found = rawBlocks.find(b => b.kind === k);
  if (!found) return fallback;
  if (found.span) return found.span;
  if (found.wide) return 12;
  return fallback;
 };

 const getRowLimit = (k: Kind, defaultRows: number): number => {
  const found = rawBlocks.find(b => b.kind === k);
  const h: BlockHeight = found?.height || 'md';
  if (h === 'sm') return Math.max(2, defaultRows - 2);
  if (h === 'lg') return defaultRows + 3;
  return defaultRows;
 };

 const orderedKinds: Kind[] = [];
 for (const b of rawBlocks) {
  if (!orderedKinds.includes(b.kind) && hasKind(b.kind)) {
   orderedKinds.push(b.kind);
  }
 }

 return {
  enabledSet,
  hasKind,
  getSpan,
  getRowLimit,
  showNextHw: template.showNextHomework !== false,
  orderedKinds,
 };
}

const attCycleOrder: StudentDailyRecord['attendance'][] = ['출석', '지각', '결석'];
function nextAttendance(cur: string | null | undefined): StudentDailyRecord['attendance'] {
 const idx = attCycleOrder.indexOf(cur as StudentDailyRecord['attendance']);
 return attCycleOrder[(idx + 1) % attCycleOrder.length];
}
const hwCycleOrder: ('O' | '△' | 'X')[] = ['O', '△', 'X'];
function nextHomework(cur: string | null | undefined): 'O' | '△' | 'X' {
 const idx = cur ? hwCycleOrder.indexOf(cur as 'O' | '△' | 'X') : -1;
 return hwCycleOrder[(idx + 1) % hwCycleOrder.length];
}

/* ============================================================================
 * [기본형 스타일] 📘 클린 블루 & 화이트 에디토리얼 시트 (SaebomForestSheet)
 * - 깔끔한 순백색(#ffffff) 바탕 + 로열 블루(#2563eb) 포인트
 * - 일간(day) / 주간(week) / 월간(month) 주기에 따라 양식이 각각 다르게 구성
 * - 출석·숙제 클릭 변경 및 오답·진도·피드백 직접 텍스트 입력 지원 (학생관리 탭 상호 저장)
 * ============================================================================ */
function SaebomForestSheet({
 p,
 s,
 cfg,
 template,
 period,
 periodKor,
 onEdit,
}: {
 p: Preview;
 s: StudentData;
 cfg: LayoutConfig;
 template: Template;
 period: 'day' | 'week' | 'month';
 periodKor: string;
 onEdit?: ReportEditHandlers;
}) {
 const academyTitle = template.academyName?.trim() || '유니데스크';
 const cycleBadge =
  period === 'day' ? 'DAILY REPORT' : period === 'week' ? 'WEEKLY REPORT' : 'MONTHLY REPORT';
 const defaultHeadline =
  period === 'day'
   ? `${academyTitle} 일일 수업 결과 리포트`
   : period === 'week'
     ? `${academyTitle} 주간 학습 성취 리포트`
     : `${academyTitle} 월간 종합 평가 리포트`;
 const reportHeadline = template.customTitle?.trim() || defaultHeadline;

 // 1) '— 한눈에' 카드에 들어갈 활성 지표 수집 (클릭 및 인라인 편집 지원)
 const summaryMetrics: {
  key: Kind;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  onClickValue?: () => void;
  clickHint?: string;
 }[] = [];

 if (cfg.hasKind('attendance')) {
  const cycleTodayAtt = onEdit
   ? () => onEdit.onUpdateDailyWrong(p.id, p.end, { attendance: nextAttendance(s.todayAtt || '출석') })
   : undefined;
  if (period === 'day') {
   summaryMetrics.push({
    key: 'attendance',
    label: '오늘 출결 상태 (클릭 변경)',
    value: s.todayAtt || (s.attended > 0 ? '출석' : '출석'),
    sub: s.todayAttReason || (s.todayAtt === '출석' ? '당일 정상 등원 완료' : `${s.dateLabel} 수업 출결`),
    onClickValue: cycleTodayAtt,
    clickHint: '클릭하여 출석 → 지각 → 결석 전환',
   });
  } else if (period === 'week') {
   summaryMetrics.push({
    key: 'attendance',
    label: '주간 출석 일수',
    value: `${s.attended}일`,
    sub: `이번 주 기록 ${s.recordedAtt}일 중 등원율 ${s.attRate ?? 100}%`,
    onClickValue: cycleTodayAtt,
    clickHint: '클릭하여 기준일 출결 전환',
   });
  } else {
   summaryMetrics.push({
    key: 'attendance',
    label: '월간 누적 출석',
    value: `${s.attended}일`,
    sub: `${s.absent === 0 ? '월간 결석 없음' : `결석 ${s.absent}일 · 지각 ${s.late}일`} (출석률 ${s.attRate ?? 100}%)`,
    onClickValue: cycleTodayAtt,
    clickHint: '클릭하여 기준일 출결 전환',
   });
  }
 }
 if (cfg.hasKind('homework')) {
  const cycleTodayHw = onEdit
   ? () => onEdit.onUpdateDailyWrong(p.id, p.end, { homework_status: nextHomework(s.todayHwStatus) })
   : undefined;
  if (period === 'day') {
   summaryMetrics.push({
    key: 'homework',
    label: '당일 과제 검사 (클릭 변경)',
    value: s.todayHwStatus ? `${s.hwLabels[s.todayHwStatus]} (${s.todayHwStatus})` : s.hwRate !== null ? `${s.hwRate}%` : '완료 (O)',
    sub: s.hwRecorded.length > 0 ? `제출 과제 확인 완료 (클릭 시 O/△/X 변경)` : '클릭하여 O / △ / X 선택',
    onClickValue: cycleTodayHw,
    clickHint: '클릭하여 완료(O) → 일부(△) → 미완료(X) 전환',
   });
  } else {
   summaryMetrics.push({
    key: 'homework',
    label: period === 'week' ? '주간 과제 수행률' : '월간 과제 성실도',
    value: `${s.hwRate ?? 100}%`,
    sub: `검사 ${s.hwRecorded.length}회 중 완료(O) ${s.hwDone}회 · 일부(△) ${s.hwPartial}회`,
    onClickValue: cycleTodayHw,
    clickHint: '클릭하여 기준일 숙제 상태(O/△/X) 전환',
   });
  }
 }
 if (cfg.hasKind('grades')) {
  summaryMetrics.push({
   key: 'grades',
   label: period === 'day' ? '당일 테스트 결과' : period === 'week' ? '주간 테스트 평균' : '월간 시험 평균',
   value: s.avgScore !== null ? `${s.avgScore}점` : '미응시',
   sub:
    s.exams.length > 0
     ? period === 'day'
       ? `${s.exams[s.exams.length - 1].name} (${s.exams[s.exams.length - 1].score}/${s.exams[s.exams.length - 1].max_score})`
       : `총 ${s.exams.length}회 응시 · 최고 ${s.maxScore}점`
     : '해당 기간 시험 기록 없음',
  });
 }
 if (cfg.hasKind('wrong')) {
  summaryMetrics.push({
   key: 'wrong',
   label: period === 'day' ? '당일 오답 클리닉' : period === 'week' ? '주간 오답 해결률' : '월간 오답 완주율',
   value: s.wrongRate !== null ? `${s.wrongRate}%` : '완료',
   sub: `오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 수정 완료`,
   accent: true,
  });
 } else if (cfg.hasKind('progress')) {
  summaryMetrics.push({
   key: 'progress',
   label: period === 'day' ? '진행 교재 성취도' : '교재 누적 성취도',
   value: `${s.avgProgress ?? 0}%`,
   sub: `진행 교재 ${s.bookProgressList.length}권 평균 진도율`,
   accent: true,
  });
 }

 const todayLogs =
  s.periodProgressLogs.length > 0
   ? s.periodProgressLogs
   : s.bookProgressList.map(b => ({
      id: b.id,
      bookId: b.id,
      entryId: b.latestEntryId,
      date: b.recordDate || p.end,
      bookTitle: b.title,
      course: b.course,
      scope: b.journeyLabel,
      rawScope: b.rawLastScope,
      homework: b.latestHomework,
      dueDate: b.latestDueDate,
      pct: b.pct,
      done: b.donePages,
      total: b.totalPages,
     }));

 const bookRowsLimit = cfg.getRowLimit('progress', 5);
 const examRowsLimit = cfg.getRowLimit('grades', period === 'month' ? 4 : 3);

 // 도넛 게이지 계산 (숙제 실행률 또는 오답 해결률)
 const ringPct = cfg.hasKind('homework')
  ? (s.hwRate ?? 100)
  : cfg.hasKind('wrong')
    ? (s.wrongRate ?? 100)
    : (s.attRate ?? 100);
 const ringRadius = 30;
 const ringCircumference = 2 * Math.PI * ringRadius;
 const ringOffset = ringCircumference - (Math.min(100, Math.max(0, ringPct)) / 100) * ringCircumference;

 const totalHwCount = Math.max(1, s.hwRecorded.length);
 const doneWidth = Math.round((s.hwDone / totalHwCount) * 100);
 const partialWidth = Math.round((s.hwPartial / totalHwCount) * 100);
 const missWidth = Math.max(0, 100 - doneWidth - partialWidth);

 const bluePalette = ['#2563eb', '#3b82f6', '#60a5fa', '#0284c7', '#6366f1'];

 const weeklyBars = s.weekDays.map((wd, idx) => {
  const exAvg = wd.exams.length
   ? Math.round(wd.exams.reduce((a, b) => a + (b.max_score > 0 ? (b.score / b.max_score) * 100 : 0), 0) / wd.exams.length)
   : null;
  const val =
   exAvg !== null
    ? exAvg
    : wd.hw === 'O'
      ? 94
      : wd.hw === '△'
        ? 68
        : wd.attendance === '출석'
          ? 84
          : 22;
  return {
   date: wd.date,
   dayNum: wd.short,
   dow: wd.label,
   isWeekend: idx >= 5,
   value: Math.max(18, Math.min(100, val)),
   label: exAvg !== null ? `${exAvg}점` : (wd.attendance || wd.hw || '-'),
  };
 });

 const rhythmBarsToRender = period === 'week' ? weeklyBars : s.dailyRhythmBars;

 const renderSaebomBlock = (kind: Kind) => {
  const span = cfg.getSpan(kind, 12);
  const colStyle: CSSProperties = { gridColumn: `span ${span}` };

  if (kind === 'attendance') {
   if (summaryMetrics.length === 0) return null;
   const headTitle =
    period === 'day'
     ? '오늘 수업 한눈에'
     : period === 'week'
       ? '주간 한눈에 & 요일별 출결·과제'
       : '월간 한눈에 & 출결 캘린더';
   const headRight =
    period === 'day'
     ? `${s.dateLabel} · 항목 클릭 시 즉시 변경`
     : s.recordedAtt > 0
       ? `${s.recordedAtt}일 중 ${s.attended}일 등원`
       : s.dateLabel;

   return (
    <section key="saebom-attendance" className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {headTitle}</h3>
      <span>{headRight}</span>
     </div>
     <div
      className={styles.saebomMetricsGrid}
      style={{ gridTemplateColumns: summaryMetrics.length === 1 ? '1fr' : summaryMetrics.length === 3 ? 'repeat(3, 1fr)' : '1fr 1fr' }}
     >
      {summaryMetrics.map((m, idx) => (
       <div key={idx} className={styles.saebomMetricCell}>
        <span className={styles.saebomMetricLabel}>{m.label}</span>
        <strong
         className={`${m.accent ? styles.saebomMetricAccent : styles.saebomMetricValue} ${m.onClickValue ? styles.interactiveClick : ''}`}
         onClick={m.onClickValue}
         title={m.clickHint}
        >
         {m.value}
        </strong>
        {m.key === 'attendance' && onEdit ? (
         <small className={styles.saebomMetricSub}>
          <InlineTextField
           value={s.todayAttReason}
           placeholder={s.todayAtt === '출석' || !s.todayAtt ? '당일 정상 등원 완료 (클릭하여 출결 사유 입력)' : '출결 사유 입력'}
           ariaLabel="출결 사유 직접 입력"
           onCommit={next => onEdit.onUpdateDailyWrong(p.id, p.end, { reason: next })}
          />
         </small>
        ) : (
         <small className={styles.saebomMetricSub}>{m.sub}</small>
        )}
       </div>
      ))}
     </div>

     {/* [주간 전용] 월~일 7일 출결·숙제 미니 스탬프 타임라인 (요일별 클릭 시 즉시 변경!) */}
     {period === 'week' && (
      <div className={styles.saebomWeekStrip}>
       {s.weekDays.map(wd => {
        const badgeClass =
         wd.attendance === '출석'
          ? styles.saebomBadgeBlue
          : wd.attendance === '지각'
            ? styles.saebomBadgeAmber
            : wd.attendance === '결석'
              ? styles.saebomBadgeRed
              : styles.saebomBadgeSlate;
        return (
         <div key={wd.date} className={styles.saebomWeekDayBox}>
          <b>{wd.label}요일</b>
          <small>{wd.short}</small>
          <span
           className={`${styles.saebomWeekBadge} ${badgeClass} ${onEdit ? styles.interactiveClick : ''}`}
           title="클릭하여 해당 요일 출결 변경"
           onClick={() =>
            onEdit?.onUpdateDailyWrong(p.id, wd.date, {
             attendance: nextAttendance(wd.attendance || '출석'),
            })
           }
          >
           {wd.attendance || '출석입력'}
          </span>
          {cfg.hasKind('homework') && (
           <small
            className={onEdit ? styles.interactiveClick : ''}
            title="클릭하여 해당 요일 과제 상태(O/△/X) 변경"
            onClick={() =>
             onEdit?.onUpdateDailyWrong(p.id, wd.date, {
              homework_status: nextHomework(wd.hw),
             })
            }
            style={{ fontWeight: 700, padding: '1px 4px', color: wd.hw === 'O' ? '#1d4ed8' : wd.hw === 'X' ? '#b91c1c' : '#64748b' }}
           >
            과제 {wd.hw || '-'}
           </small>
          )}
         </div>
        );
       })}
      </div>
     )}

     {/* [월간 전용] 월간 출결 미니 캘린더 그리드 (날짜 클릭 시 출결 상태 변경!) */}
     {period === 'month' && (
      <div className={styles.saebomMonthCalCard}>
       <div className={styles.saebomDailySubHead} style={{ marginTop: 0, marginBottom: 6 }}>
        <span><i className={styles.saebomDash}/> {s.monthLabel} 등원 및 과제 캘린더</span>
        <small>날짜 클릭 시 출결 전환 · 파랑=출석 / 노랑=지각 / 빨강=결석</small>
       </div>
       <div className={styles.saebomMonthCalGrid}>
        {korWeekdays.map(w => (
         <div key={w} className={styles.saebomMonthCalDow}>{w}</div>
        ))}
        {s.calendarCells.map((cell, idx) => {
         if (!cell) return <div key={`empty-${idx}`} />;
         const cellTone =
          cell.attendance === '출석'
           ? styles.saebomMonthCalAtt
           : cell.attendance === '지각'
             ? styles.saebomMonthCalWarn
             : cell.attendance === '결석'
               ? styles.saebomMonthCalMiss
               : '';
         return (
          <div
           key={cell.date}
           className={`${styles.saebomMonthCalCell} ${cellTone} ${onEdit ? styles.interactiveClick : ''}`}
           title={`${cell.date} (${cell.attendance || '미기록'}) - 클릭하여 출결 변경`}
           onClick={() =>
            onEdit?.onUpdateDailyWrong(p.id, cell.date, {
             attendance: nextAttendance(cell.attendance || ''),
            })
           }
          >
           <span>{cell.day}</span>
           {cell.hw === 'O' && <b style={{ fontSize: 8.5 }}>●</b>}
          </div>
         );
        })}
       </div>
      </div>
     )}
    </section>
   );
  }

  if (kind === 'homework' || (kind === 'wrong' && !cfg.hasKind('homework'))) {
   const showWrongTogether = cfg.hasKind('wrong');
   const secTitle =
    period === 'day'
     ? cfg.hasKind('homework') && showWrongTogether
       ? '오늘 과제 이행과 오답 클리닉 점검'
       : cfg.hasKind('homework')
         ? '오늘 과제 이행 점검'
         : '오늘 오답 클리닉 점검'
     : period === 'week'
       ? cfg.hasKind('homework') && showWrongTogether
         ? '주간 과제 실행력과 오답 리듬'
         : '주간 계획 실행력과 과제 리듬'
       : cfg.hasKind('homework') && showWrongTogether
         ? '월간 과제 실행력과 누적 오답 완주율'
         : '월간 계획 실행력과 과제 리듬';

   return (
    <section key={`saebom-${kind}`} className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {secTitle}</h3>
      <span>{s.dateLabel} 기준</span>
     </div>
     <div className={styles.saebomCard}>
      <div className={styles.saebomDonutRow}>
       <div
        className={`${styles.saebomDonutWrap} ${onEdit && cfg.hasKind('homework') ? styles.interactiveClick : ''}`}
        title={cfg.hasKind('homework') ? '클릭하여 기준일 과제 상태(O/△/X) 변경' : undefined}
        onClick={() => {
         if (cfg.hasKind('homework')) {
          onEdit?.onUpdateDailyWrong(p.id, p.end, { homework_status: nextHomework(s.todayHwStatus) });
         }
        }}
       >
        <svg width="76" height="76" viewBox="0 0 76 76">
         <circle cx="38" cy="38" r={ringRadius} fill="none" stroke="#dbeafe" strokeWidth="8"/>
         <circle
          cx="38"
          cy="38"
          r={ringRadius}
          fill="none"
          stroke="var(--theme-accent, #2563eb)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={ringCircumference}
          strokeDashoffset={ringOffset}
          transform="rotate(-90 38 38)"
         />
         <text x="38" y="42" textAnchor="middle" fontSize="14" fontWeight="900" fill="#1e3a8a">
          {ringPct}%
         </text>
        </svg>
       </div>
       <div className={styles.saebomDonutText}>
        <strong>
         {cfg.hasKind('homework')
          ? period === 'day'
            ? `당일 과제 상태: ${s.todayHwStatus ? `${s.hwLabels[s.todayHwStatus]} (${s.todayHwStatus})` : `수행률 ${s.hwRate ?? 100}%`}`
            : `부여된 과제 ${s.hwRecorded.length}회 중 ${s.hwDone}회 완료`
          : `발생 오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 수정 완료`}
        </strong>
        <p>
         {cfg.hasKind('homework') && showWrongTogether
          ? `과제 성실 수행률 ${s.hwRate ?? 100}% · 오답 클리닉 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결 (미해결 ${s.remainWrong}문항)`
          : cfg.hasKind('homework')
            ? `수업 시간마다 제출한 숙제 검사와 학습 계획 이행 기준입니다.`
            : `틀린 문항을 끝까지 다시 풀어 해결한 오답 클리닉 기준입니다.`}
        </p>
       </div>
      </div>

      {/* 일간 전용: 당일 3대 체크 박스 (클릭 및 오답 수 직접 입력) */}
      {period === 'day' ? (
       <div className={styles.saebomDailyCheckGrid}>
        {cfg.hasKind('homework') && (
         <div
          className={`${styles.saebomDailyCheckItem} ${onEdit ? styles.interactiveClick : ''}`}
          title="클릭하여 완료(O) / 일부(△) / 미완료(X) 변경"
          onClick={() => onEdit?.onUpdateDailyWrong(p.id, p.end, { homework_status: nextHomework(s.todayHwStatus) })}
         >
          <span>당일 숙제 제출 (클릭)</span>
          <strong style={{ color: 'var(--theme-accent, #2563eb)' }}>
           {s.todayHwStatus ? `${s.hwLabels[s.todayHwStatus]} (${s.todayHwStatus})` : `완료 (O)`}
          </strong>
         </div>
        )}
        {showWrongTogether && (
         <>
          <div className={styles.saebomDailyCheckItem}>
           <span>당일 오답 (해결 / 전체)</span>
           {onEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <input
              type="number"
              min={0}
              max={999}
              aria-label="해결한 오답 문항 수"
              className={styles.inlineNumberInput}
              value={s.todayFixedWrong}
              onChange={e => {
               const fixed = Math.max(0, parseInt(e.target.value || '0', 10));
               const total = Math.max(fixed, s.todayTotalWrong);
               onEdit.onUpdateDailyWrong(p.id, p.end, { corrected_count: fixed, total_wrong: total });
              }}
             />
             <b>/</b>
             <input
              type="number"
              min={0}
              max={999}
              aria-label="전체 오답 문항 수"
              className={styles.inlineNumberInput}
              value={s.todayTotalWrong}
              onChange={e => {
               const total = Math.max(0, parseInt(e.target.value || '0', 10));
               const fixed = Math.min(total, s.todayFixedWrong);
               onEdit.onUpdateDailyWrong(p.id, p.end, { total_wrong: total, corrected_count: fixed });
              }}
             />
             <small style={{ fontSize: 10.5, fontWeight: 700 }}>문항</small>
            </div>
           ) : (
            <strong>{s.fixedWrong} / {s.totalWrong}문항</strong>
           )}
          </div>
          <div className={styles.saebomDailyCheckItem}>
           <span>남은 오답 문항</span>
           <strong style={{ color: s.remainWrong > 0 ? '#dc2626' : '#1d4ed8' }}>
            {s.remainWrong === 0 ? '전부 해결 완료' : `${s.remainWrong}문항 보완 필요`}
           </strong>
          </div>
         </>
        )}
       </div>
      ) : (
       <>
        <div className={styles.saebomStackedBar}>
         <i style={{ width: `${s.hwRecorded.length ? doneWidth : 100}%`, background: 'var(--theme-accent, #2563eb)' }}/>
         {partialWidth > 0 && <i style={{ width: `${partialWidth}%`, background: '#93c5fd' }}/>}
         {missWidth > 0 && s.hwRecorded.length > 0 && <i style={{ width: `${missWidth}%`, background: '#ef4444' }}/>}
        </div>

        <div className={styles.saebomLegendRow}>
         {cfg.hasKind('homework') && (
          <>
           <span><i style={{ background: 'var(--theme-accent, #2563eb)' }}/> 완료(O) {s.hwDone}회</span>
           <span><i style={{ background: '#93c5fd' }}/> 일부(△) {s.hwPartial}회</span>
           <span><i style={{ background: '#ef4444' }}/> 미완료(X) {s.hwMiss}회</span>
          </>
         )}
         {showWrongTogether && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: 'var(--theme-accent, #2563eb)' }}>
           오답 해결: {s.fixedWrong}/{s.totalWrong}문항 ({s.wrongRate ?? 100}%)
           {onEdit && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, fontSize: 10, color: '#475569' }}>
             [기준일 입력:
             <input
              type="number"
              min={0}
              max={999}
              aria-label="기준일 해결 오답 수"
              className={styles.inlineNumberInput}
              style={{ width: 36 }}
              value={s.todayFixedWrong}
              onChange={e => {
               const fixed = Math.max(0, parseInt(e.target.value || '0', 10));
               const total = Math.max(fixed, s.todayTotalWrong);
               onEdit.onUpdateDailyWrong(p.id, p.end, { corrected_count: fixed, total_wrong: total });
              }}
             />
             /
             <input
              type="number"
              min={0}
              max={999}
              aria-label="기준일 전체 오답 수"
              className={styles.inlineNumberInput}
              style={{ width: 36 }}
              value={s.todayTotalWrong}
              onChange={e => {
               const total = Math.max(0, parseInt(e.target.value || '0', 10));
               const fixed = Math.min(total, s.todayFixedWrong);
               onEdit.onUpdateDailyWrong(p.id, p.end, { total_wrong: total, corrected_count: fixed });
              }}
             />
             ]
            </span>
           )}
          </span>
         )}
        </div>
       </>
      )}
     </div>
    </section>
   );
  }

  if (kind === 'wrong' && cfg.hasKind('homework')) {
   return null;
  }

  if (kind === 'grades') {
   const gradeSecTitle =
    period === 'day'
     ? '당일 테스트 결과 및 최근 성취도'
     : period === 'week'
       ? '주간 테스트 성취도 및 요일별 리듬'
       : '월간 성취도 추이 및 날마다 학습 밀도';
   return (
    <section key="saebom-grades" className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {gradeSecTitle}</h3>
      <span>{s.exams.length > 0 ? `응시 ${s.exams.length}회 · 평균 ${s.avgScore}점` : '학습 참여 리듬'}</span>
     </div>
     <div className={styles.saebomCard}>
      {s.exams.length > 0 ? (
       <div className={styles.saebomHorizBarGroup}>
        {s.exams.slice(-examRowsLimit).map((ex, idx, arr) => {
         const isLatest = idx === arr.length - 1 && arr.length > 1;
         return (
          <div key={ex.id} className={styles.saebomHorizBarRow}>
           <div className={styles.saebomHorizDate}>
            <b>{shortDate(ex.date)}</b>
            <small>{ex.name}</small>
           </div>
           <div className={styles.saebomHorizTrack}>
            <div
             className={isLatest ? styles.saebomBarStriped : styles.saebomBarSolid}
             style={{ width: `${Math.max(8, ex.rate)}%` }}
            />
           </div>
           <div className={styles.saebomHorizScore}>
            <strong>{ex.rate}점</strong>
            <small>{ex.score}/{ex.max_score}</small>
           </div>
          </div>
         );
        })}
       </div>
      ) : (
       <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
        {period === 'day' ? '당일 등록된 테스트 점수 기록이 없습니다.' : '해당 기간에 응시한 테스트 기록이 없습니다.'}
       </p>
      )}

      {/* 주간/월간 또는 일간 최근 학습 리듬 세로 막대 */}
      {period !== 'day' && (
       <>
        <div className={styles.saebomDailySubHead}>
         <span>
          <i className={styles.saebomDash}/>{' '}
          {period === 'week' ? '이번 주 요일별 학습 리듬 (월~일)' : '월간 날마다 학습 밀도'}
         </span>
         <small>진한 파랑 = 평일 정규수업 · 연한 파랑 = 주말/자율</small>
        </div>
        <div className={styles.saebomDailyColumns}>
         {rhythmBarsToRender.map(bar => (
          <div key={bar.date} className={styles.saebomDailyColItem}>
           <div className={styles.saebomDailyBarTrack}>
            <div
             className={bar.isWeekend ? styles.saebomDailyBarLight : styles.saebomDailyBarDark}
             style={{ height: `${bar.value}%` }}
             title={`${bar.date}: ${bar.label}`}
            />
           </div>
           <b>{bar.dayNum}</b>
           <small>{bar.dow}</small>
          </div>
         ))}
        </div>
       </>
      )}
     </div>
    </section>
   );
  }

  if (kind === 'progress') {
   const progTitle =
    period === 'day'
     ? '오늘 수업 진도 및 다음 과제'
     : period === 'week'
       ? '이번 주에 공부한 교재'
       : '이 달에 공부한 교재 및 누적 완성도';

   return (
    <section key="saebom-progress" className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {progTitle}</h3>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
       {s.bookProgressList.length > 0 ? `총 ${s.bookProgressList.length}권 진행 중` : '진도 기록'}
       {onEdit && (
        <button
         type="button"
         className={styles.inlineQuickAddBtn}
         onClick={() =>
          onEdit.onUpdateProgress(p.id, {
           bookId: s.bookProgressList[0]?.id,
           recordDate: p.end,
           scope: '오늘 학습 단원 입력',
           homework: '다음 수업 과제 입력',
          })
         }
        >
         <Plus size={11}/> 진도 기록 추가
        </button>
       )}
      </span>
     </div>
     <div className={styles.saebomCard} style={{ padding: 0, overflow: 'hidden' }}>
      {period === 'day' ? (
       /* [일간 전용] 오늘 나간 진도 범위 + 다음 수업 숙제 4열 테이블 (인라인 직접 입력 지원) */
       <table className={styles.saebomTable}>
        <thead>
         <tr>
          <th style={{ width: '28%' }}>교재 · 과정</th>
          <th style={{ width: '13%', textAlign: 'center' }}>종류</th>
          <th style={{ width: '32%' }}>오늘 수업 진도 범위 (클릭 입력)</th>
          <th>부여된 다음 과제 (클릭 입력)</th>
         </tr>
        </thead>
        <tbody>
         {todayLogs.length > 0 ? (
          todayLogs.slice(0, bookRowsLimit).map(log => (
           <tr key={log.id}>
            <td>
             <strong className={styles.saebomBookName}>{log.bookTitle}</strong>
             <span className={styles.saebomBookCourse}>{log.course}</span>
            </td>
            <td style={{ textAlign: 'center' }}>
             <span className={`${styles.saebomTypePill} ${styles.saebomPillGreen}`}>당일수업</span>
            </td>
            <td>
             <div className={styles.saebomJourneyCell}>
              {onEdit ? (
               <InlineTextField
                value={log.rawScope || (log.scope === '학습 범위 미기록' ? '' : log.scope)}
                placeholder="오늘 진도 범위 직접 입력 (예: p.42~48)"
                ariaLabel={`${log.bookTitle} 진도 범위 입력`}
                onCommit={next =>
                 onEdit.onUpdateProgress(p.id, {
                  bookId: log.bookId,
                  entryId: log.entryId,
                  recordDate: log.date || p.end,
                  scope: next,
                 })
                }
               />
              ) : (
               <span>{log.scope}</span>
              )}
              <b className={styles.saebomPctTag}>{log.pct}%</b>
             </div>
            </td>
            <td style={{ fontSize: 11, color: '#1e3a8a', fontWeight: 600 }}>
             {onEdit ? (
              <InlineTextField
               value={log.homework}
               placeholder="다음 수업 과제 직접 입력 (예: 워크북 p.30~35)"
               ariaLabel={`${log.bookTitle} 다음 과제 입력`}
               onCommit={next =>
                onEdit.onUpdateProgress(p.id, {
                 bookId: log.bookId,
                 entryId: log.entryId,
                 recordDate: log.date || p.end,
                 homework: next,
                })
               }
              />
             ) : (
              log.homework ? `${log.homework}${log.dueDate ? ` (~${shortDate(log.dueDate)})` : ''}` : '현장 안내 완료'
             )}
            </td>
           </tr>
          ))
         ) : (
          <tr>
           <td colSpan={4} className={styles.emptyCell}>
            당일 등록된 교재 진도 기록이 없습니다. 상단 <b>[+ 진도 기록 추가]</b>를 눌러 바로 입력해 보세요.
           </td>
          </tr>
         )}
        </tbody>
       </table>
      ) : (
       /* [주간 / 월간 전용] 처음 -> 마지막 누적 진도 여정 테이블 (인라인 직접 입력 지원) */
       <table className={styles.saebomTable}>
        <thead>
         <tr>
          <th style={{ width: '34%' }}>교재 · 과정</th>
          <th style={{ width: '16%', textAlign: 'center' }}>종류</th>
          <th>{period === 'week' ? '이번 주 진도 (클릭하여 최근 진도 수정)' : '월간 누적 진도 (클릭하여 최근 진도 수정)'}</th>
         </tr>
        </thead>
        <tbody>
         {s.bookProgressList.length > 0 ? (
          s.bookProgressList.slice(0, bookRowsLimit).map(b => (
           <tr key={b.id}>
            <td>
             <strong className={styles.saebomBookName}>{b.title}</strong>
             <span className={styles.saebomBookCourse}>{b.course || b.curriculum}</span>
            </td>
            <td style={{ textAlign: 'center' }}>
             <span className={`${styles.saebomTypePill} ${b.kindBadge === '개념서' ? styles.saebomPillBeige : styles.saebomPillGreen}`}>
              {b.kindBadge}
             </span>
            </td>
            <td className={styles.saebomJourneyCell}>
             {onEdit ? (
              <InlineTextField
               value={b.rawLastScope || b.journeyLabel}
               placeholder="진도 범위 직접 입력 (예: 1단원 다항식 ~ 3단원 방정식)"
               ariaLabel={`${b.title} 진도 기록 입력`}
               onCommit={next =>
                onEdit.onUpdateProgress(p.id, {
                 bookId: b.id,
                 entryId: b.latestEntryId,
                 recordDate: b.recordDate || p.end,
                 scope: next,
                })
               }
              />
             ) : (
              <span>{b.journeyLabel}</span>
             )}
             <b className={styles.saebomPctTag}>{b.pct}%</b>
            </td>
           </tr>
          ))
         ) : todayLogs.length > 0 ? (
          todayLogs.slice(0, bookRowsLimit).map(log => (
           <tr key={log.id}>
            <td>
             <strong className={styles.saebomBookName}>{log.bookTitle}</strong>
             <span className={styles.saebomBookCourse}>{log.course}</span>
            </td>
            <td style={{ textAlign: 'center' }}>
             <span className={`${styles.saebomTypePill} ${styles.saebomPillGreen}`}>수업진도</span>
            </td>
            <td className={styles.saebomJourneyCell}>
             <span>{log.scope}</span>
             <b className={styles.saebomPctTag}>{log.pct}%</b>
            </td>
           </tr>
          ))
         ) : (
          <tr>
           <td colSpan={3} className={styles.emptyCell}>
            해당 기간에 등록된 교재 진도 기록이 없습니다. 상단 <b>[+ 진도 기록 추가]</b>를 눌러 바로 입력해 보세요.
           </td>
          </tr>
         )}
        </tbody>
       </table>
      )}

      {/* 월간(또는 다권 진행 시) 교재별 누적 완성도 바 차트 (완료 페이지 직접 수정 지원!) */}
      {(period === 'month' || s.bookProgressList.length > 1) && s.bookProgressList.length > 0 && (
       <div className={styles.saebomPastelWrap}>
        <div className={styles.saebomDailySubHead} style={{ marginTop: 0, marginBottom: 6 }}>
         <span><i className={styles.saebomDash}/> 교재별 누적 완성도 (완료 페이지 클릭 수정)</span>
        </div>
        {s.bookProgressList.slice(0, 4).map((b, i) => (
         <div key={b.id} className={styles.saebomPastelRow}>
          <span className={styles.saebomPastelLabel}>{b.title.slice(0, 12)}</span>
          <div className={styles.saebomPastelTrack}>
           <div
            className={styles.saebomPastelFill}
            style={{ width: `${Math.max(6, b.pct)}%`, background: bluePalette[i % bluePalette.length] }}
           />
          </div>
          <strong className={styles.saebomPastelVal}>
           {onEdit ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
             <input
              type="number"
              min={0}
              max={b.totalPages || 10000}
              aria-label={`${b.title} 완료 페이지`}
              className={styles.inlineNumberInput}
              style={{ width: 38, fontSize: 10 }}
              value={b.donePages}
              onChange={e => {
               const done = Math.max(0, Math.min(b.totalPages || 10000, parseInt(e.target.value || '0', 10)));
               onEdit.onUpdateProgress(p.id, {
                bookId: b.id,
                entryId: b.latestEntryId,
                recordDate: b.recordDate || p.end,
                completedPage: done,
                totalPages: b.totalPages,
               });
              }}
             />
             /{b.totalPages}p · {b.pct}%
            </span>
           ) : (
            `${b.donePages}/${b.totalPages}p · ${b.pct}%`
           )}
          </strong>
         </div>
        ))}
       </div>
      )}
     </div>
    </section>
   );
  }

  if (kind === 'feedback') {
   const fbTitle =
    period === 'day'
     ? '담당 선생님 일일 코멘트'
     : period === 'week'
       ? '담임 선생님 주간 기록'
       : '담임 선생님 월간 종합 총평';
   return (
    <section key="saebom-feedback" className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {fbTitle}</h3>
      <span>{periodKor} 지도 코멘트 (클릭하여 직접 작성 · 수정)</span>
     </div>
     <div className={styles.saebomTeacherNote}>
      {s.comments.length > 0 ? (
       s.comments.slice(0, cfg.getRowLimit('feedback', 3)).map(c => (
        <div key={c.id} className={styles.saebomNoteItem}>
         <strong className={styles.saebomNoteDate}>
          {dayjs(c.date).format('M월 D일')} ({korWeekdays[dayjs(c.date).day()]}) · {c.tag}
         </strong>
         {onEdit ? (
          <InlineTextareaField
           value={c.text}
           placeholder="선생님 코멘트를 입력하세요 (비우면 삭제)"
           ariaLabel={`${c.tag} 코멘트 수정`}
           onCommit={next => onEdit.onUpdateComment(p.id, c.id, next, c.date)}
          />
         ) : (
          <p>{c.text}</p>
         )}
        </div>
       ))
      ) : (
       <div className={styles.saebomNoteItem}>
        <strong className={styles.saebomNoteDate}>{dayjs(p.end).format('M월 D일')} · {periodKor} 학습 종합 기록</strong>
        {onEdit ? (
         <InlineTextareaField
          value={s.todayWrongMemo}
          placeholder="이곳을 클릭해 선생님 코멘트·피드백을 직접 입력하세요. 입력한 내용은 학생관리 탭에도 즉시 저장됩니다."
          ariaLabel="선생님 코멘트 직접 입력"
          onCommit={next => onEdit.onUpdateDailyWrong(p.id, p.end, { memo: next })}
         />
        ) : (
         <p className={styles.mutedText}>해당 기간에 별도로 작성된 선생님 코멘트 메모가 없습니다.</p>
        )}
       </div>
      )}

      {/* 이미 코멘트가 있을 때도 기준일 추가 코멘트를 바로 덧붙일 수 있는 입력 줄 */}
      {onEdit && s.comments.length > 0 && !s.comments.some(c => c.id.startsWith('wrong-') && c.date === p.end) && (
       <div className={styles.saebomNoteItem} style={{ borderTop: '1px dashed #bfdbfe', paddingTop: 6 }}>
        <strong className={styles.saebomNoteDate}>{dayjs(p.end).format('M월 D일')} · 추가 코멘트 작성</strong>
        <InlineTextareaField
         value=""
         placeholder="+ 이곳을 클릭해 추가 선생님 코멘트를 바로 작성하세요"
         ariaLabel="추가 코멘트 직접 입력"
         onCommit={next => {
          if (next.trim()) onEdit.onUpdateDailyWrong(p.id, p.end, { memo: next });
         }}
        />
       </div>
      )}

      {cfg.showNextHw && (s.homeworkTasks.length > 0 || onEdit) && (
       <div className={styles.saebomNextHwBar}>
        <b>다음 수업 과제</b>
        <span style={{ flex: 1 }}>
         {onEdit ? (
          <InlineTextField
           value={s.homeworkTasks[0]?.homework || todayLogs[0]?.homework || ''}
           placeholder="다음 수업까지 해올 과제를 클릭해 직접 입력하세요 (예: 개념원리 p.52~56 풀어오기)"
           ariaLabel="다음 수업 과제 직접 입력"
           onCommit={next =>
            onEdit.onUpdateProgress(p.id, {
             bookId: s.homeworkTasks[0]?.bookId || todayLogs[0]?.bookId || s.bookProgressList[0]?.id,
             entryId: s.homeworkTasks[0]?.entryId || todayLogs[0]?.entryId,
             recordDate: s.homeworkTasks[0]?.date || p.end,
             homework: next,
            })
           }
          />
         ) : (
          s.homeworkTasks.slice(0, 2).map(t => `[${t.bookTitle}] ${t.homework}${t.dueDate ? ` (~${shortDate(t.dueDate)})` : ''}`).join(' · ')
         )}
        </span>
       </div>
      )}
     </div>
    </section>
   );
  }

  return null;
 };

 const activeSubtitleParts: string[] = [];
 if (cfg.hasKind('attendance')) activeSubtitleParts.push('출결');
 if (cfg.hasKind('homework')) activeSubtitleParts.push('과제');
 if (cfg.hasKind('wrong')) activeSubtitleParts.push('오답');
 if (cfg.hasKind('progress')) activeSubtitleParts.push('교재 진도');
 if (cfg.hasKind('grades')) activeSubtitleParts.push('시험 성취도');

 return (
  <div className={styles.saebomContainer}>
   <header className={styles.saebomHeader}>
    <div className={styles.saebomHeaderTop}>
     <div className={styles.saebomBrandRow}>
      {template.logoDataUrl && template.logoPosition !== 'right' && (
       <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
      )}
      <div>
       <span className={styles.saebomEyebrow}>
        <b className={styles.saebomCycleBadge}>{cycleBadge}</b>
        {academyTitle} · {periodKor} 리포트
       </span>
       <h2 className={styles.saebomMainTitle}>{reportHeadline}</h2>
      </div>
     </div>
     <div className={styles.saebomStudentMeta}>
      {template.logoDataUrl && template.logoPosition === 'right' && (
       <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
      )}
      <strong>{p.name} <small>({p.grade} · {p.group})</small></strong>
      <span>{period === 'day' ? `수업일: ${s.dateLabel}` : `기간: ${s.dateLabel}`}</span>
     </div>
    </div>
    <p className={styles.saebomIntroLine}>
     {period === 'day'
      ? `${s.dateLabel} 당일 수업 기록입니다. 실제 수업 ${activeSubtitleParts.join('·')} 데이터에서 자동으로 집계했습니다.`
      : period === 'week'
        ? `이번 주(${s.dateLabel}) 주간 학습 기록입니다. 한 주 동안의 ${activeSubtitleParts.join('·')} 기록과 요일별 리듬을 집계했습니다.`
        : `${s.monthLabel}(${s.dateLabel}) 월간 누적 리포트입니다. 한 달간의 ${activeSubtitleParts.join('·')} 성취도를 종합 분석했습니다.`}
    </p>
   </header>

   <div className={styles.customGrid12}>
    {cfg.orderedKinds.map(k => renderSaebomBlock(k))}
   </div>

   {template.footerNotice?.trim() && (
    <footer className={styles.customFooterNotice}>
     <Megaphone size={14}/>
     <span>{template.footerNotice.trim()}</span>
    </footer>
   )}
  </div>
 );
}

/* ============================================================================
 * [A] 일간 보고서 전용 본문 (DayBody) - 항목 ON/OFF, 칸 크기, 직접 클릭/입력 적용
 * ============================================================================ */
function DayBody({p,s,cfg,onEdit}:{p:Preview;s:StudentData;cfg:LayoutConfig;onEdit?:ReportEditHandlers}){
 const attOptions=['출석','지각','결석'] as const;
 const hwOptions:[ 'O'|'△'|'X', string ][]=[['O','완료 (O)'],['△','일부 (△)'],['X','미완료 (X)']];
 const todayLogs=s.periodProgressLogs.length>0?s.periodProgressLogs:s.bookProgressList.map(b=>({
  id:b.id,
  bookId:b.id,
  entryId:b.latestEntryId,
  date:b.recordDate||p.end,
  bookTitle:b.title,
  scope:b.scope,
  rawScope:b.rawLastScope,
  homework:b.latestHomework,
  dueDate:b.latestDueDate,
  pct:b.pct,
  done:b.donePages,
  total:b.totalPages,
 }));

 const showAtt = cfg.hasKind('attendance');
 const showHw = cfg.hasKind('homework');
 const showWrong = cfg.hasKind('wrong');
 const stampCount = [showAtt, showHw, showWrong].filter(Boolean).length;

 const showProg = cfg.hasKind('progress');
 const showGrades = cfg.hasKind('grades');
 const progSpan = !showGrades ? 12 : cfg.getSpan('progress', 6);
 const gradesSpan = !showProg ? 12 : cfg.getSpan('grades', 6);

 return (
  <div className={styles.periodBody}>
   {/* 1단: 활성화된 도장 카드만 자동 비율(1~3단)로 배치 (클릭 시 즉시 변경!) */}
   {stampCount > 0 && (
    <div
     className={styles.dayStampGrid}
     style={{ gridTemplateColumns: `repeat(${stampCount}, minmax(0, 1fr))` }}
    >
     {showAtt && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><CalendarCheck2 size={14}/> 오늘 출결 확인 (클릭)</h3>
       <div className={styles.stampRow}>
        {attOptions.map(opt=>{
         const active=s.todayAtt===opt;
         return (
          <div
           key={opt}
           className={`${styles.stampCircle} ${active?styles.stampActive:''} ${onEdit?styles.interactiveClick:''}`}
           title={`클릭하여 ${opt}(으)로 저장`}
           onClick={()=>onEdit?.onUpdateDailyWrong(p.id,p.end,{attendance:opt})}
          >
           {active&&<Check size={11} className={styles.stampCheck}/>}
           <span>{opt}</span>
          </div>
         );
        })}
       </div>
       <small className={styles.moduleCaption}>
        {onEdit?(
         <InlineTextField
          value={s.todayAttReason}
          placeholder={s.todayAtt?`당일 ${s.todayAtt} 확인 완료 (클릭하여 비고 입력)`:'오늘 출결 비고·사유 입력'}
          ariaLabel="출결 사유 입력"
          onCommit={next=>onEdit.onUpdateDailyWrong(p.id,p.end,{reason:next})}
         />
        ):(
         s.todayAtt?(s.todayAttReason?`비고: ${s.todayAttReason}`:`당일 ${s.todayAtt} 확인 완료`):'오늘 출결 미기록'
        )}
       </small>
      </section>
     )}

     {showHw && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><ClipboardCheck size={14}/> 오늘 숙제 검사 (클릭)</h3>
       <div className={styles.stampRow}>
        {hwOptions.map(([code,label])=>{
         const active=s.todayHwStatus===code;
         return (
          <div
           key={code}
           className={`${styles.stampCircle} ${styles.stampWide} ${active?styles.stampActive:''} ${onEdit?styles.interactiveClick:''}`}
           title={`클릭하여 숙제 ${label}(으)로 저장`}
           onClick={()=>onEdit?.onUpdateDailyWrong(p.id,p.end,{homework_status:code})}
          >
           {active&&<Check size={11} className={styles.stampCheck}/>}
           <strong>{code}</strong>
           <small>{label.split(' ')[0]}</small>
          </div>
         );
        })}
       </div>
       <small className={styles.moduleCaption}>
        {s.todayHwStatus?`전시간 과제 수행: ${s.hwLabels[s.todayHwStatus]}`:'클릭하여 숙제 O / △ / X 선택'}
       </small>
      </section>
     )}

     {showWrong && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><FileWarning size={14}/> 당일 오답 클리닉 (입력)</h3>
       <div className={styles.dayWrongCounter}>
        <div>
         <span>전체 오답</span>
         {onEdit?(
          <strong>
           <input
            type="number"
            min={0}
            max={999}
            aria-label="전체 오답 문항 수"
            className={styles.inlineNumberInput}
            value={s.todayTotalWrong}
            onChange={e=>{
             const total=Math.max(0,parseInt(e.target.value||'0',10));
             const fixed=Math.min(total,s.todayFixedWrong);
             onEdit.onUpdateDailyWrong(p.id,p.end,{total_wrong:total,corrected_count:fixed});
            }}
           />
           <small>문항</small>
          </strong>
         ):(
          <strong>{s.totalWrong}<small>문항</small></strong>
         )}
        </div>
        <i>→</i>
        <div>
         <span>수정 완료</span>
         {onEdit?(
          <strong className={styles.accentNum}>
           <input
            type="number"
            min={0}
            max={999}
            aria-label="수정 완료 오답 문항 수"
            className={styles.inlineNumberInput}
            value={s.todayFixedWrong}
            onChange={e=>{
             const fixed=Math.max(0,parseInt(e.target.value||'0',10));
             const total=Math.max(fixed,s.todayTotalWrong);
             onEdit.onUpdateDailyWrong(p.id,p.end,{corrected_count:fixed,total_wrong:total});
            }}
           />
           <small>문항</small>
          </strong>
         ):(
          <strong className={styles.accentNum}>{s.fixedWrong}<small>문항</small></strong>
         )}
        </div>
        <i>·</i>
        <div><span>남은 오답</span><strong>{s.remainWrong}<small>문항</small></strong></div>
       </div>
       <small className={styles.moduleCaption}>
        {s.hasWrongRecord?`당일 오답 정리 상태: ${s.wrongSymbol} (${s.wrongRate??100}% 해결)`:'오답 문항 수를 직접 입력할 수 있습니다'}
       </small>
      </section>
     )}
    </div>
   )}

   {/* 2단: 오늘 수업 진도 & 오늘 테스트 성적 */}
   {(showProg || showGrades) && (
    <div className={styles.customGrid12} style={{ flex: 1 }}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <BookOpen size={14}/> 오늘 수업 진도{cfg.showNextHw ? ' 및 다음 숙제' : ''}
        {onEdit && (
         <button
          type="button"
          className={styles.inlineQuickAddBtn}
          style={{ marginLeft: 'auto' }}
          onClick={() =>
           onEdit.onUpdateProgress(p.id, {
            bookId: s.bookProgressList[0]?.id,
            recordDate: p.end,
            scope: '오늘 학습 단원 입력',
            homework: '다음 수업 과제 입력',
           })
          }
         >
          <Plus size={11}/> 진도 추가
         </button>
        )}
       </h3>
       <div className={styles.moduleContent}>
        <table className={styles.dataTable}>
         <thead>
          <tr><th>교재명 · 오늘 학습 범위 (클릭 입력)</th><th style={{width:'88px',textAlign:'center'}}>누적 진도</th></tr>
         </thead>
         <tbody>
          {todayLogs.length>0?todayLogs.slice(0,cfg.getRowLimit('progress',4)).map(log=>(
           <tr key={log.id}>
            <td>
             <b className={styles.tableBookTitle}>{log.bookTitle}</b>
             {onEdit?(
              <InlineTextField
               value={log.rawScope || (log.scope === '학습 범위 미기록' ? '' : log.scope)}
               placeholder="오늘 나간 진도 범위 입력 (예: p.30~36)"
               ariaLabel={`${log.bookTitle} 진도 범위 입력`}
               onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:log.bookId,entryId:log.entryId,recordDate:log.date||p.end,scope:next})}
              />
             ):(
              <span className={styles.tableSubScope}>{log.scope}</span>
             )}
            </td>
            <td style={{textAlign:'center'}}>
             <span className={styles.inlineCheckBadge}>
              <em>{log.pct}%</em>
              <i className={`${styles.checkSquare} ${styles.checkSquareOn}`}><Check size={11} strokeWidth={3}/></i>
             </span>
            </td>
           </tr>
          )):(
           <tr><td colSpan={2} className={styles.emptyCell}>등록된 진도 기록이 없습니다. 상단 [+ 진도 추가]를 눌러 입력하세요.</td></tr>
          )}
         </tbody>
        </table>

        {cfg.showNextHw && (
         <div className={styles.nextHwCallout}>
          <div className={styles.nextHwTitle}><Lightbulb size={14}/> 다음 수업까지 해올 숙제 (HOMEWORK · 클릭 입력)</div>
          {onEdit ? (
           <InlineTextField
            value={s.homeworkTasks[0]?.homework || todayLogs[0]?.homework || ''}
            placeholder="다음 수업까지 해올 과제를 이곳에 직접 입력하세요 (예: 개념원리 p.40~45)"
            ariaLabel="다음 수업 과제 직접 입력"
            onCommit={next =>
             onEdit.onUpdateProgress(p.id, {
              bookId: s.homeworkTasks[0]?.bookId || todayLogs[0]?.bookId || s.bookProgressList[0]?.id,
              entryId: s.homeworkTasks[0]?.entryId || todayLogs[0]?.entryId,
              recordDate: s.homeworkTasks[0]?.date || p.end,
              homework: next,
             })
            }
           />
          ) : s.homeworkTasks.length>0?s.homeworkTasks.slice(0,2).map(t=>(
           <p key={t.id}>
            <span className={styles.hwBookTag}>{t.bookTitle}</span> {t.homework}
            {t.dueDate&&<small> · 제출기한 {shortDate(t.dueDate)}</small>}
           </p>
          )):(
           <p className={styles.mutedText}>오늘 새로 부여된 숙제 기록이 없습니다.</p>
          )}
         </div>
        )}
       </div>
      </section>
     )}

     {showGrades && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gradesSpan}` }}>
       <h3 className={styles.moduleHeader}><Award size={14}/> 오늘 테스트 결과 (Daily Test)</h3>
       <div className={styles.moduleContent}>
        {s.exams.length>0?(
         <div className={styles.dayExamList}>
          {s.exams.slice(0,cfg.getRowLimit('grades',3)).map(ex=>(
           <div key={ex.id} className={styles.dayExamCard}>
            <div className={styles.dayExamLeft}>
             <span className={styles.dayExamTag}>일일 테스트</span>
             <strong>{ex.name}</strong>
             {ex.scope&&<small>범위: {ex.scope}</small>}
             {ex.memo&&<small>코멘트: {ex.memo}</small>}
            </div>
            <div className={styles.dayExamScoreBox}>
             <b>{ex.rate}<small>점</small></b>
             <span>원점수 {ex.score} / {ex.max_score}</span>
            </div>
           </div>
          ))}
         </div>
        ):(
         <div className={styles.emptyBox}>
          <AlertCircle size={18}/>
          <p>오늘 실시한 시험 기록이 없습니다.</p>
          <small>학생관리에서 시험명과 점수를 입력하면 당일 성적표가 표시됩니다.</small>
         </div>
        )}
       </div>
      </section>
     )}
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * [B] 주간 보고서 전용 본문 (WeekBody) - 클릭 및 직접 입력 지원
 * ============================================================================ */
function WeekBody({p,s,cfg,onEdit}:{p:Preview;s:StudentData;cfg:LayoutConfig;onEdit?:ReportEditHandlers}){
 const showAtt = cfg.hasKind('attendance');
 const showHw = cfg.hasKind('homework');
 const showWrong = cfg.hasKind('wrong');
 const showMatrix = showAtt || showHw || showWrong;

 const matrixTitleParts: string[] = [];
 const matrixStatParts: string[] = [];
 if (showAtt) {
  matrixTitleParts.push('출결');
  matrixStatParts.push(`주간 출석 ${s.attended}일`);
 }
 if (showHw) {
  matrixTitleParts.push('숙제');
  matrixStatParts.push(`숙제완료 ${s.hwDone}회`);
 }
 if (showWrong) {
  matrixTitleParts.push('오답');
  matrixStatParts.push(`오답수정 ${s.fixedWrong}/${s.totalWrong}문항`);
 }

 const showProg = cfg.hasKind('progress');
 const showGrades = cfg.hasKind('grades');
 const progSpan = !showGrades ? 12 : cfg.getSpan('progress', 6);
 const gradesSpan = !showProg ? 12 : cfg.getSpan('grades', 6);

 return (
  <div className={styles.periodBody}>
   {/* 1단: 월~일 주간 점검표 (칸 클릭 시 출결·숙제 즉시 전환!) */}
   {showMatrix && (
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}>
      <Calendar size={14}/> 주간 요일별 {matrixTitleParts.join(' · ')} 현황표 (월~일 · 클릭 변경)
      <span className={styles.headerStatRight}>{matrixStatParts.join(' · ')}</span>
     </h3>
     <div className={styles.moduleContent}>
      <table className={styles.weeklyMatrixTable}>
       <thead>
        <tr>
         <th style={{width:'76px'}}>구분</th>
         {s.weekDays.map(d=>(
          <th key={d.date} style={{textAlign:'center'}}>
           <b>{d.label}요일</b>
           <small>{d.short}</small>
          </th>
         ))}
        </tr>
       </thead>
       <tbody>
        {showAtt && (
         <tr>
          <td className={styles.matrixRowLabel}>출결 상태</td>
          {s.weekDays.map(d=>(
           <td
            key={d.date}
            style={{textAlign:'center'}}
            className={onEdit?styles.interactiveClick:''}
            title="클릭하여 출결 변경"
            onClick={()=>onEdit?.onUpdateDailyWrong(p.id,d.date,{attendance:nextAttendance(d.attendance||'출석')})}
           >
            {d.attendance?(
             <span className={`${styles.statusPill} ${d.attendance==='출석'?styles.pillGood:d.attendance==='결석'?styles.pillBad:styles.pillWarn}`}>
              {d.attendance}
             </span>
            ):<span className={styles.dashCell}>+출결</span>}
           </td>
          ))}
         </tr>
        )}
        {showHw && (
         <tr>
          <td className={styles.matrixRowLabel}>숙제 검사</td>
          {s.weekDays.map(d=>(
           <td
            key={d.date}
            style={{textAlign:'center'}}
            className={onEdit?styles.interactiveClick:''}
            title="클릭하여 숙제 O/△/X 변경"
            onClick={()=>onEdit?.onUpdateDailyWrong(p.id,d.date,{homework_status:nextHomework(d.hw)})}
           >
            {d.hw?(
             <span className={`${styles.statusPill} ${d.hw==='O'?styles.pillGood:d.hw==='X'?styles.pillBad:styles.pillWarn}`}>
              {d.hw==='O'?'O 완료':d.hw==='△'?'△ 일부':'X 미완료'}
             </span>
            ):<span className={styles.dashCell}>+숙제</span>}
           </td>
          ))}
         </tr>
        )}
        {showWrong && (
         <tr>
          <td className={styles.matrixRowLabel}>오답 수정</td>
          {s.weekDays.map(d=>(
           <td key={d.date} style={{textAlign:'center',fontSize:'11px',fontWeight:700}}>
            {d.totalWrong!==null?`${d.fixedWrong}/${d.totalWrong}문항`:<span className={styles.dashCell}>-</span>}
           </td>
          ))}
         </tr>
        )}
       </tbody>
      </table>
     </div>
    </section>
   )}

   {/* 2단: 주간 진도 및 과제 히스토리 표 + 주간 테스트 성적 비교 */}
   {(showProg || showGrades) && (
    <div className={styles.customGrid12} style={{ flex: 1 }}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <BookOpen size={14}/> 이번 주 진도{cfg.showNextHw ? ' 및 과제' : ''} 내역표
        {onEdit && (
         <button
          type="button"
          className={styles.inlineQuickAddBtn}
          style={{ marginLeft: 'auto' }}
          onClick={() =>
           onEdit.onUpdateProgress(p.id, {
            bookId: s.bookProgressList[0]?.id,
            recordDate: p.end,
            scope: '이번 주 학습 범위 입력',
            homework: '다음 과제 입력',
           })
          }
         >
          <Plus size={11}/> 진도 추가
         </button>
        )}
       </h3>
       <div className={styles.moduleContent}>
        <table className={styles.dataTable}>
         <thead>
          <tr>
           <th style={{width:'52px'}}>날짜</th>
           <th>교재 · 진도 범위 (클릭 입력)</th>
           {cfg.showNextHw && <th>부여된 과제 (클릭 입력)</th>}
          </tr>
         </thead>
         <tbody>
          {s.periodProgressLogs.length>0?s.periodProgressLogs.slice(0,cfg.getRowLimit('progress',5)).map(log=>(
           <tr key={log.id}>
            <td style={{fontWeight:700}}>{shortDate(log.date)}</td>
            <td>
             <b className={styles.tableBookTitle}>{log.bookTitle} ({log.pct}%)</b>
             {onEdit?(
              <InlineTextField
               value={log.rawScope || (log.scope === '학습 범위 미기록' ? '' : log.scope)}
               placeholder="진도 범위 입력"
               onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:log.bookId,entryId:log.entryId,recordDate:log.date,scope:next})}
              />
             ):(
              <span className={styles.tableSubScope}>{log.scope}</span>
             )}
            </td>
            {cfg.showNextHw && (
             <td>
              {onEdit?(
               <InlineTextField
                value={log.homework}
                placeholder="부여된 과제 입력"
                onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:log.bookId,entryId:log.entryId,recordDate:log.date,homework:next})}
               />
              ):(
               log.homework||'-'
              )}
             </td>
            )}
           </tr>
          )):s.bookProgressList.length>0?s.bookProgressList.slice(0,cfg.getRowLimit('progress',4)).map(b=>(
           <tr key={b.id}>
            <td style={{fontWeight:700}}>{b.recordDate?shortDate(b.recordDate):shortDate(p.end)}</td>
            <td>
             <b className={styles.tableBookTitle}>{b.title} ({b.pct}%)</b>
             {onEdit?(
              <InlineTextField
               value={b.rawLastScope}
               placeholder="진도 범위 입력"
               onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:b.id,entryId:b.latestEntryId,recordDate:b.recordDate||p.end,scope:next})}
              />
             ):(
              <span className={styles.tableSubScope}>{b.scope}</span>
             )}
            </td>
            {cfg.showNextHw && (
             <td>
              {onEdit?(
               <InlineTextField
                value={b.latestHomework}
                placeholder="부여된 과제 입력"
                onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:b.id,entryId:b.latestEntryId,recordDate:b.recordDate||p.end,homework:next})}
               />
              ):'-'}
             </td>
            )}
           </tr>
          )):(
           <tr><td colSpan={cfg.showNextHw ? 3 : 2} className={styles.emptyCell}>이번 주 기록된 진도 내역이 없습니다. 상단 [+ 진도 추가]를 눌러 입력하세요.</td></tr>
          )}
         </tbody>
        </table>
       </div>
      </section>
     )}

     {showGrades && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gradesSpan}` }}>
       <h3 className={styles.moduleHeader}><Award size={14}/> 주간 테스트 성적표 및 비교</h3>
       <div className={styles.moduleContent}>
        {s.exams.length>0?(
         <>
          <table className={styles.dataTable}>
           <thead>
            <tr>
             <th style={{width:'52px'}}>날짜</th>
             <th>시험명 · 범위</th>
             <th style={{width:'84px',textAlign:'right'}}>점수 (환산)</th>
            </tr>
           </thead>
           <tbody>
            {s.exams.slice(0,cfg.getRowLimit('grades',4)).map(ex=>(
             <tr key={ex.id}>
              <td style={{fontWeight:700}}>{shortDate(ex.date)}</td>
              <td>
               <b className={styles.tableBookTitle}>{ex.name}</b>
               {ex.scope&&<span className={styles.tableSubScope}>{ex.scope}</span>}
              </td>
              <td style={{textAlign:'right',fontWeight:800}}>
               {ex.score}/{ex.max_score} ({ex.rate}점)
              </td>
             </tr>
            ))}
           </tbody>
          </table>
          <div className={styles.weeklyScoreSummary}>
           <span>이번 주 응시 <b>{s.exams.length}회</b></span>
           <span>주간 평균 <b>{s.avgScore}점</b></span>
           <span>최고 점수 <b>{s.maxScore}점</b></span>
          </div>
         </>
        ):(
         <div className={styles.emptyBox}>
          <AlertCircle size={18}/>
          <p>이번 주 실시된 테스트 기록이 없습니다.</p>
         </div>
        )}
       </div>
      </section>
     )}
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * [C] 월간 보고서 전용 본문 (MonthBody) - 클릭 및 직접 입력 지원
 * ============================================================================ */
function MonthBody({p,s,cfg,onEdit}:{p:Preview;s:StudentData;cfg:LayoutConfig;onEdit?:ReportEditHandlers}){
 const chartExams=s.exams.slice(-6);
 const showAtt = cfg.hasKind('attendance');
 const showGrades = cfg.hasKind('grades');
 const showProg = cfg.hasKind('progress');
 const showHw = cfg.hasKind('homework');
 const showWrong = cfg.hasKind('wrong');
 const showGauges = showHw || showWrong;

 const attSpan = !showGrades ? 12 : cfg.getSpan('attendance', 6);
 const gradesSpan = !showAtt ? 12 : cfg.getSpan('grades', 6);
 const progSpan = !showGauges ? 12 : cfg.getSpan('progress', 6);
 const gaugeSpan = !showProg ? 12 : cfg.getSpan('homework', 6);

 return (
  <div className={styles.periodBody}>
   {/* 1단: 월간 출결 캘린더 + 월간 성적 변화 추이 그래프 */}
   {(showAtt || showGrades) && (
    <div className={styles.customGrid12} style={{ flex: 1 }}>
     {showAtt && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${attSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <CalendarCheck2 size={14}/> {s.monthLabel} 출결 달력 (날짜 클릭 변경)
        <span className={styles.headerStatRight}>출석률 {s.attRate??0}%</span>
       </h3>
       <div className={styles.moduleContent}>
        <div className={styles.monthCalGrid}>
         {korWeekdays.map(w=>(
          <div key={w} className={styles.calWeekday}>{w}</div>
         ))}
         {s.calendarCells.map((cell,idx)=>{
          if(!cell)return <div key={idx} className={styles.calEmptyCell}/>;
          const att=cell.attendance;
          const badgeClass=att==='출석'?styles.calAttGood:att==='결석'?styles.calAttBad:att?styles.calAttWarn:'';
          return (
           <div
            key={cell.date}
            className={`${styles.calDayCell} ${badgeClass} ${onEdit?styles.interactiveClick:''}`}
            title={`${cell.date} 출결 클릭 변경`}
            onClick={()=>onEdit?.onUpdateDailyWrong(p.id,cell.date,{attendance:nextAttendance(att||'')})}
           >
            <span className={styles.calDayNum}>{cell.day}</span>
            {att&&<b className={styles.calAttMark}>{att==='출석'?'출석':att}</b>}
           </div>
          );
         })}
        </div>
        <div className={styles.calLegendBar}>
         <span><i className={styles.dotGood}/> 출석 <b>{s.attended}일</b></span>
         <span><i className={styles.dotWarn}/> 지각 <b>{s.late}일</b></span>
         <span><i className={styles.dotBad}/> 결석 <b>{s.absent}일</b></span>
        </div>
       </div>
      </section>
     )}

     {showGrades && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gradesSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <TrendingUp size={14}/> 월간 시험 성적 추이 분석
        {s.avgScore!==null&&<span className={styles.headerStatRight}>월 평균 {s.avgScore}점</span>}
       </h3>
       <div className={styles.moduleContent}>
        {chartExams.length>0?(
         <>
          <svg viewBox="0 0 290 155" className={styles.monthTrendSvg} role="img" aria-label="월간 시험 성적 추이">
           {[25,50,75,100].map(v=>(
            <g key={v}>
             <line x1="24" x2="276" y1={124-v*0.92} y2={124-v*0.92} stroke="#e2e8f0" strokeDasharray="2 2"/>
             <text x="4" y={127-v*0.92} fontSize="8" fill="#64748b">{v}</text>
            </g>
           ))}
           <line x1="24" x2="276" y1="124" y2="124" stroke="#334155" strokeWidth="1.2"/>
           {chartExams.map((ex,idx)=>{
            const step=240/Math.max(1,chartExams.length);
            const cx=36+idx*step+step*0.35;
            const bh=Math.max(6,ex.rate*0.92);
            const by=124-bh;
            return (
             <g key={ex.id}>
              <rect x={cx-13} y={by} width="26" height={bh} rx="4" fill="var(--theme-bar,#68a4f1)" opacity={idx===chartExams.length-1?1:0.65}/>
              <text x={cx} y={by-6} textAnchor="middle" fontSize="9" fontWeight="800" fill="#1e293b">{ex.rate}점</text>
              <text x={cx} y="137" textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">{shortDate(ex.date)}</text>
              <text x={cx} y="148" textAnchor="middle" fontSize="7.5" fill="#64748b">{ex.name.slice(0,5)}</text>
             </g>
            );
           })}
           {chartExams.length>1&&(
            <polyline
             fill="none"
             stroke="var(--theme-line,#1e3a8a)"
             strokeWidth="2.2"
             points={chartExams.map((ex,idx)=>{
              const step=240/Math.max(1,chartExams.length);
              const cx=36+idx*step+step*0.35;
              return `${cx},${124-ex.rate*0.92}`;
             }).join(' ')}
            />
           )}
          </svg>
          <div className={styles.weeklyScoreSummary}>
           <span>월간 응시 <b>{s.exams.length}회</b></span>
           <span>평균 <b>{s.avgScore}점</b></span>
           <span>최고 <b>{s.maxScore}점</b></span>
          </div>
         </>
        ):(
         <div className={styles.emptyBox}>
          <AlertCircle size={18}/>
          <p>이번 달 기록된 시험 성적이 없습니다.</p>
         </div>
        )}
       </div>
      </section>
     )}
    </div>
   )}

   {/* 2단: 월간 교재별 누적 완주율 블록 + 월간 숙제·오답 종합 달성도 */}
   {(showProg || showGauges) && (
    <div className={styles.customGrid12} style={{ flex: 1 }}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <BookOpen size={14}/> 교재별 월말 누적 진도 달성률
        {onEdit && (
         <button
          type="button"
          className={styles.inlineQuickAddBtn}
          style={{ marginLeft: 'auto' }}
          onClick={() =>
           onEdit.onUpdateProgress(p.id, {
            bookId: s.bookProgressList[0]?.id,
            recordDate: p.end,
            scope: '이번 달 학습 단원 입력',
           })
          }
         >
          <Plus size={11}/> 진도 추가
         </button>
        )}
       </h3>
       <div className={styles.moduleContent}>
        {s.bookProgressList.length>0?(
         <div className={styles.miriBlockBarList}>
          {s.bookProgressList.slice(0,cfg.getRowLimit('progress',4)).map(b=>{
           const blocks=Math.max(0,Math.min(10,Math.round(b.pct/10)));
           return (
            <div key={b.id} className={styles.miriBlockBarRow}>
             <div className={styles.miriBlockBarLabel}>
              <b>{b.pct}%</b>
              <span>{b.title}</span>
              <small className={styles.courseTag}>{b.curriculum} · {b.course}</small>
             </div>
             <div className={styles.miriCubeTrack}>
              {Array.from({length:10}).map((_,idx)=>(
               <i key={idx} className={idx<blocks?styles.miriCubeOn:styles.miriCubeOff}/>
              ))}
             </div>
             {onEdit?(
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10.5}}>
               <InlineTextField
                value={b.rawLastScope}
                placeholder="최근 진도 범위 입력"
                onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:b.id,entryId:b.latestEntryId,recordDate:b.recordDate||p.end,scope:next})}
               />
               <span style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:2}}>
                <input
                 type="number"
                 min={0}
                 max={b.totalPages||10000}
                 className={styles.inlineNumberInput}
                 style={{width:38,fontSize:10}}
                 value={b.donePages}
                 onChange={e=>{
                  const done=Math.max(0,Math.min(b.totalPages||10000,parseInt(e.target.value||'0',10)));
                  onEdit.onUpdateProgress(p.id,{bookId:b.id,entryId:b.latestEntryId,recordDate:b.recordDate||p.end,completedPage:done,totalPages:b.totalPages});
                 }}
                />
                /{b.totalPages}p
               </span>
              </div>
             ):(
              <small>최근 진도 범위: {b.scope} ({b.donePages}/{b.totalPages})</small>
             )}
            </div>
           );
          })}
         </div>
        ):(
         <div className={styles.emptyBox}><p>등록된 교재 진도 내역이 없습니다.</p></div>
        )}
       </div>
      </section>
     )}

     {showGauges && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gaugeSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <ClipboardCheck size={14}/>{' '}
        {showHw && showWrong
         ? '월간 과제 성실도 및 오답 클리닉 총괄'
         : showHw
           ? '월간 과제 성실도 총괄'
           : '월간 오답 클리닉 총괄'}
       </h3>
       <div className={styles.moduleContent}>
        <div className={styles.monthGaugeGroup}>
         {showHw && (
          <div className={styles.monthGaugeItem}>
           <div className={styles.monthGaugeHead}>
            <b>월간 숙제 수행률</b>
            <strong>{s.hwRate!==null?`${s.hwRate}%`:'미기록'}</strong>
           </div>
           <div className={styles.monthGaugeBar}>
            <i style={{width:`${s.hwRate??0}%`}}/>
           </div>
           <small>완료(O) {s.hwDone}회 · 일부(△) {s.hwPartial}회 · 미완료(X) {s.hwMiss}회 (총 {s.hwRecorded.length}회 검사)</small>
          </div>
         )}

         {showWrong && (
          <div className={styles.monthGaugeItem}>
           <div className={styles.monthGaugeHead}>
            <b>월간 오답 해결률</b>
            <strong>{s.wrongRate!==null?`${s.wrongRate}%`:'미기록'}</strong>
           </div>
           <div className={styles.monthGaugeBar}>
            <i style={{width:`${s.wrongRate??0}%`}}/>
           </div>
           <small>한 달간 발생한 오답 총 {s.totalWrong}문항 중 {s.fixedWrong}문항 수정 완료 (남은 오답 {s.remainWrong}문항)</small>
          </div>
         )}
        </div>
       </div>
      </section>
     )}
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * 통합 시트 렌더러
 * - saebom / clean (📘 기본형 · 클린 블루 & 화이트)
 * - miricheck (📋 하늘색 체크리스트형)
 * - mirireport (📒 노란색 인포그래픽형)
 * - mirigraph (📊 파스텔 성취도형)
 * ============================================================================ */
export default function ReportSheets({
 preview:p,
 template=presets[0],
 onEdit,
}:{
 preview:Preview;
 template?:Template;
 onEdit?:ReportEditHandlers;
}){
 const s=computeStudentData(p);
 const cfg=buildLayoutConfig(template, s);
 const theme:Theme=(template.theme==='saebom'||template.theme==='clean'||template.theme==='mirireport'||template.theme==='mirigraph')?(template.theme==='clean'?'saebom':template.theme):'miricheck';
 const period=template.period==='week'?'week':(template.period==='month'||template.period==='1month'||template.period==='3months')?'month':'day';
 const periodKor=period==='week'?'주간':period==='month'?'월간':'일일';
 const periodEng=period==='week'?'Weekly Learning Report':period==='month'?'Monthly Learning Report':'Daily Learning Report';
 const academyTitle=template.academyName?.trim()||'유니데스크 학원';

 const customAccentStyle: CSSProperties | undefined = template.accentColor
  ? ({
     '--theme-border': template.accentColor,
     '--theme-head-bg': template.accentColor,
     '--theme-accent': template.accentColor,
     '--theme-bar': template.accentColor,
    } as CSSProperties)
  : undefined;

 if (theme === 'saebom') {
  return (
   <article className={styles.sheet} data-sheet data-theme="saebom" data-period={period} style={customAccentStyle}>
    <div className={styles.sheetInner}>
     <SaebomForestSheet p={p} s={s} cfg={cfg} template={template} period={period} periodKor={periodKor} onEdit={onEdit}/>
    </div>
   </article>
  );
 }

 const enabledLabelList = (['attendance','homework','wrong','progress','grades'] as Kind[])
  .filter(k => cfg.hasKind(k))
  .map(k => kindLabels[k]);

 return (
  <article className={styles.sheet} data-sheet data-theme={theme} data-period={period} style={customAccentStyle}>
   <div className={styles.sheetInner}>
    {/* 분위기별 맞춤 상단 헤더 */}
    {theme==='miricheck'&& (
     <>
      <header className={styles.miriCheckHeader}>
       <div style={{display:'flex',alignItems:'center',gap:12}}>
        {template.logoDataUrl && template.logoPosition !== 'right' && (
         <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
        )}
        <div>
         <span className={styles.miriCheckEngTitle}>{periodEng}</span>
         <h2>{template.customTitle?.trim() || `${academyTitle} ${periodKor} 학습 점검 리포트`}</h2>
        </div>
       </div>
       <div className={styles.miriHeaderIconWrap} aria-hidden="true">
        {template.logoDataUrl && template.logoPosition === 'right' ? (
         <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
        ) : (
         <>
          <Sparkles size={18} className={styles.miriSparkleIcon}/>
          <div className={styles.miriHeaderBadgeIcon}>
           <PenLine size={24} strokeWidth={2.2}/>
          </div>
         </>
        )}
       </div>
      </header>
      <div className={styles.miriMetaBar}>
       <div className={styles.miriMetaItem}>
        <span className={styles.miriMetaLabel}><GraduationCap size={13}/> 학생 · 반</span>
        <strong className={styles.miriMetaValue}>{p.name} ({p.grade} · {p.group})</strong>
       </div>
       <div className={styles.miriMetaItem}>
        <span className={styles.miriMetaLabel}><CalendarCheck2 size={13}/> {period==='day'?'학습 날짜':'조회 기간'}</span>
        <strong className={styles.miriMetaValue}>{s.dateLabel}</strong>
       </div>
      </div>
     </>
    )}

    {theme==='mirireport'&&(
     <header className={styles.miriYellowHeader}>
      {template.logoDataUrl && (
       <div style={{marginBottom:6}}>
        <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg} style={{margin:'0 auto'}}/>
       </div>
      )}
      <h2>{template.customTitle?.trim() || `${p.name} 학생의 ${periodKor} 학습 성취도 종합 리포트`}</h2>
      <p>{academyTitle.toUpperCase()} · {enabledLabelList.join(' · ')} 통합 분석</p>
      <div className={styles.miriYellowStudentPill}>
       <GraduationCap size={14}/> {p.grade} · {p.group} · <b>{p.name}</b> &nbsp;|&nbsp; <Clock size={13}/> {period==='day'?'기준일':'조회 기간'}: {s.dateLabel}
      </div>
     </header>
    )}

    {theme==='mirigraph'&&(
     <header className={styles.miriGraphHeader}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
       {template.logoDataUrl && template.logoPosition !== 'right' && (
        <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
       )}
       <div>
        <span className={styles.miriGraphEyebrow}>{academyTitle} · {periodEng.toUpperCase()}</span>
        <h2>{template.customTitle?.trim() || `${periodKor} 학습 성취도 리포트`}</h2>
       </div>
      </div>
      <div className={styles.miriGraphMetaLines}>
       {template.logoDataUrl && template.logoPosition === 'right' && (
        <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg} style={{alignSelf:'flex-end',marginBottom:4}}/>
       )}
       <div><span>{period==='day'?'날 짜':'기 간'} :</span> <b>{s.dateLabel}</b></div>
       <div><span>학 생 :</span> <b>{p.name} ({p.grade} · {p.group})</b></div>
      </div>
     </header>
    )}

    {/* 일간 / 주간 / 월간 차별화 본문 (활성화된 블록과 칸 크기에 맞춰 렌더링) */}
    {period==='day'?<DayBody p={p} s={s} cfg={cfg} onEdit={onEdit}/>:period==='week'?<WeekBody p={p} s={s} cfg={cfg} onEdit={onEdit}/>:<MonthBody p={p} s={s} cfg={cfg} onEdit={onEdit}/>}

    {/* 분위기별 맞춤 하단 선생님 피드백 박스 (피드백이 켜져 있을 때만 표시 · 직접 입력 연동) */}
    {cfg.hasKind('feedback') && (
     theme==='miricheck'?(
      <section className={styles.miriFeedbackBox}>
       <div className={styles.miriFeedbackLabel}>
        <MessageSquareText size={16}/>
        <span>선생님 확인<br/>피드백</span>
       </div>
       <div className={styles.miriFeedbackBody}>
        <span className={styles.miriFeedbackSub}>{periodKor} 수업 · {enabledLabelList.join(' · ')} 코멘트 (클릭하여 직접 작성)</span>
        <div className={styles.miriRuledLines}>
         {Array.from({length:cfg.getRowLimit('feedback',3)}).map((_,i)=>{
          const c=s.comments[i];
          return (
           <p key={i} style={{display:'flex',alignItems:'center',gap:6}}>
            {c?(
             <>
              <b style={{flexShrink:0}}>[{shortDate(c.date)} · {c.tag}]</b>
              {onEdit?(
               <InlineTextField
                value={c.text}
                placeholder="코멘트 수정"
                onCommit={next=>onEdit.onUpdateComment(p.id,c.id,next,c.date)}
               />
              ):c.text}
             </>
            ):i===0?(
             onEdit?(
              <InlineTextField
               value={s.todayWrongMemo}
               placeholder="이 줄을 클릭해 선생님 코멘트·피드백을 직접 입력하세요 (학생관리 탭과 자동 연동)"
               onCommit={next=>onEdit.onUpdateDailyWrong(p.id,p.end,{memo:next})}
              />
             ):(
              <span className={styles.miriMutedLine}>해당 기간에 등록된 선생님 코멘트가 없습니다.</span>
             )
            ):'\u00A0'}
           </p>
          );
         })}
        </div>
       </div>
      </section>
     ):theme==='mirireport'?(
      <section className={styles.miriYellowTakeaway}>
       <h3 className={styles.miriYellowSecTitle}>| 선생님 {periodKor} 피드백 및 지도 코멘트 (클릭하여 직접 작성)</h3>
       <div className={styles.miriTakeawayList}>
        {s.comments.length>0?s.comments.slice(0,cfg.getRowLimit('feedback',3)).map(c=>(
         <p key={c.id} style={{display:'flex',alignItems:'center',gap:6}}>
          <CheckCircle2 size={14} className={styles.miriCheckIconGreen}/>
          <b style={{flexShrink:0}}>[{shortDate(c.date)} · {c.tag}]</b>
          {onEdit?(
           <InlineTextField
            value={c.text}
            placeholder="코멘트 수정"
            onCommit={next=>onEdit.onUpdateComment(p.id,c.id,next,c.date)}
           />
          ):c.text}
         </p>
        )):(
         onEdit?(
          <InlineTextareaField
           value={s.todayWrongMemo}
           placeholder="이곳을 클릭해 선생님 코멘트·피드백을 직접 입력하세요 (학생관리 탭과 자동 연동)"
           onCommit={next=>onEdit.onUpdateDailyWrong(p.id,p.end,{memo:next})}
          />
         ):(
          <p className={styles.miriMutedLine}><AlertCircle size={13}/> 해당 기간에 등록된 선생님 코멘트가 없습니다.</p>
         )
        )}
       </div>
       {cfg.showNextHw && (
        <div className={styles.miriConclusionPill}>
         <Lightbulb size={15} className={styles.miriBulbIcon}/>
         <span style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
          <b style={{flexShrink:0}}>다음 수업 과제 |</b>
          {onEdit?(
           <InlineTextField
            value={s.homeworkTasks[0]?.homework || ''}
            placeholder="다음 수업 과제를 직접 입력하세요"
            onCommit={next=>onEdit.onUpdateProgress(p.id,{bookId:s.homeworkTasks[0]?.bookId||s.bookProgressList[0]?.id,entryId:s.homeworkTasks[0]?.entryId,recordDate:s.homeworkTasks[0]?.date||p.end,homework:next})}
           />
          ):s.homeworkTasks.length>0
           ?s.homeworkTasks.map(t=>`[${t.bookTitle}] ${t.homework}${t.dueDate?` (~${shortDate(t.dueDate)})`:''}`).join(' · ')
           :'해당 기간에 부여된 다음 수업 숙제 기록이 없습니다.'}
         </span>
        </div>
       )}
      </section>
     ):(
      <section className={styles.miriGraphCard}>
       <div className={styles.miriGraphCardHead}>{periodKor} 선생님 종합 피드백 및 코멘트 (클릭하여 직접 작성)</div>
       <div className={styles.miriGraphCommentBody}>
        {s.comments.length>0?s.comments.slice(0,cfg.getRowLimit('feedback',3)).map(c=>(
         <p key={c.id} style={{display:'flex',alignItems:'center',gap:6}}>
          <MessageSquareText size={13} className={styles.miriCommentIcon}/>
          <b style={{flexShrink:0}}>[{shortDate(c.date)} · {c.tag}]</b>
          {onEdit?(
           <InlineTextField
            value={c.text}
            placeholder="코멘트 수정"
            onCommit={next=>onEdit.onUpdateComment(p.id,c.id,next,c.date)}
           />
          ):c.text}
         </p>
        )):(
         onEdit?(
          <InlineTextareaField
           value={s.todayWrongMemo}
           placeholder="이곳을 클릭해 선생님 코멘트·피드백을 직접 입력하세요 (학생관리 탭과 자동 연동)"
           onCommit={next=>onEdit.onUpdateDailyWrong(p.id,p.end,{memo:next})}
          />
         ):(
          <p className={styles.miriMutedLine}><AlertCircle size={13}/> 해당 기간에 등록된 선생님 코멘트가 없습니다.</p>
         )
        )}
       </div>
      </section>
     )
    )}

    {template.footerNotice?.trim() && (
     <footer className={styles.customFooterNotice}>
      <Megaphone size={14}/>
      <span>{template.footerNotice.trim()}</span>
     </footer>
    )}
   </div>
  </article>
 );
}
