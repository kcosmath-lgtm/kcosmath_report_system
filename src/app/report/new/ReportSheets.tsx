import {useEffect,useRef,useState,type CSSProperties} from 'react';
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
 X,
 RotateCcw,
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

const shortDate=(v:string)=>dayjs(v).format('M/D');
const korWeekdays=['일','월','화','수','목','금','토'] as const;
const monToSunLabels=['월','화','수','목','금','토','일'] as const;

function isWrongRecordDone(w?: WrongAnswerRecord | null): boolean {
 if (!w) return false;
 return Boolean(w.completed || (w.total_wrong > 0 && w.corrected_count >= w.total_wrong));
}

function computeStudentData(p:Preview){
 const daily=p.daily.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const wrong=p.wrong.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const entriesInPeriod=p.entries.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const single=p.start===p.end;
 const dateLabel=single?dayjs(p.end).format('YYYY.MM.DD'):`${dayjs(p.start).format('YYYY.MM.DD')} ~ ${dayjs(p.end).format('MM.DD')}`;
 const daySpanCount=Math.max(1,dayjs(p.end).diff(dayjs(p.start),'day')+1);

 // 1. 출결 집계 (출석 / 지각 / 결석)
 const attended=daily.filter(r=>r.attendance==='출석').length;
 const late=daily.filter(r=>r.attendance==='지각').length;
 const absent=daily.filter(r=>r.attendance==='결석').length;
 const recordedAtt=daily.filter(r=>Boolean(r.attendance)).length;
 const attRate=recordedAtt>0?Math.round((attended/recordedAtt)*100):null;
 const todayDaily=daily.find(r=>r.record_date===p.end)??daily[daily.length-1];
 const todayAtt=todayDaily?.attendance||'';
 const todayAttReason=todayDaily?.reason?.trim()||'';

 // 주간 요일별(월~일) 배열 생성
 const endRef=dayjs(p.end);
 const mondayRef=endRef.subtract((endRef.day()+6)%7,'day');
 const weekDays=monToSunLabels.map((label,idx)=>{
  const d=mondayRef.add(idx,'day');
  const dStr=d.format('YYYY-MM-DD');
  const dRec=daily.find(r=>r.record_date===dStr);
  const wRec=wrong.find(r=>r.record_date===dStr);
  const eRecs=entriesInPeriod.filter(r=>r.record_date===dStr);
  const wrongDone=isWrongRecordDone(wRec);
  return {
   label,
   date:dStr,
   short:d.format('M/D'),
   dayNum:d.format('D'),
   attendance:dRec?.attendance||'',
   hw:wRec?.homework_status||null,
   wrongCompleted:wrongDone,
   totalWrong:wRec?wRec.total_wrong:null,
   fixedWrong:wRec?wRec.corrected_count:null,
   exams:dRec?.exams??[],
   entries:eRecs,
  };
 });

 // 월간 달력 셀 생성 (기준월 1일 ~ 말일)
 const monthRef=dayjs(p.end).startOf('month');
 const daysInMonth=monthRef.daysInMonth();
 const startDow=monthRef.day();
 const calendarCells:(null|{day:number;date:string;attendance:string;hw:string|null})[]=[];
 for(let i=0;i<startDow;i++)calendarCells.push(null);
 for(let day=1;day<=daysInMonth;day++){
  const dStr=monthRef.date(day).format('YYYY-MM-DD');
  const dRec=p.daily.find(r=>r.record_date===dStr);
  const wRec=p.wrong.find(r=>r.record_date===dStr);
  calendarCells.push({
   day,
   date:dStr,
   attendance:dRec?.attendance||'',
   hw:wRec?.homework_status||null,
  });
 }

 // 2. 숙제 검사 집계
 const hwLabels:Record<'O'|'△'|'X',string> = {O:'완료', '△':'일부 완료', X:'미완료'};
 const hwRecorded=wrong.filter(r=>r.homework_status==='O'||r.homework_status==='△'||r.homework_status==='X');
 const hwDone=hwRecorded.filter(r=>r.homework_status==='O').length;
 const hwPartial=hwRecorded.filter(r=>r.homework_status==='△').length;
 const hwMiss=hwRecorded.filter(r=>r.homework_status==='X').length;
 const hwRate=hwRecorded.length>0?Math.round(((hwDone+hwPartial*0.5)/hwRecorded.length)*100):null;
 const todayWrong=wrong.find(r=>r.record_date===p.end)??wrong[wrong.length-1];
 const todayHwStatus=todayWrong?.homework_status??null;

 // 3. 오답 클리닉 집계 (오답 완료 버튼 또는 전체 수정 시 '오답 완료', 기록 없으면 '기록 없음'으로 표시)
 const todayTotalWrong=todayWrong?.total_wrong??0;
 const todayFixedWrong=todayWrong?.corrected_count??0;
 const todayWrongCompleted=isWrongRecordDone(todayWrong);
 const todayHasWrongRecord=Boolean(todayWrongCompleted||todayTotalWrong>0);
 const endWrong=wrong.find(r=>r.record_date===p.end);
 const todayWrongMemo=endWrong ? endWrong.memo : (todayWrong?.memo ?? '');

 const totalWrong=wrong.reduce((a,b)=>a+b.total_wrong,0);
 const fixedWrong=wrong.reduce((a,b)=>a+b.corrected_count,0);
 const remainWrong=Math.max(0,totalWrong-fixedWrong);
 const wrongWithActivity=wrong.filter(w=>isWrongRecordDone(w)||w.total_wrong>0);
 const wrongCompletedDays=wrong.filter(w=>isWrongRecordDone(w)).length;
 const periodWrongCompleted=Boolean(
  (single && todayWrongCompleted) ||
  (wrongWithActivity.length>0 && wrongWithActivity.every(w=>isWrongRecordDone(w))) ||
  (totalWrong>0 && fixedWrong>=totalWrong)
 );
 const hasWrongRecord=wrongWithActivity.length>0;
 const wrongRate=periodWrongCompleted
  ? 100
  : totalWrong>0
    ? Math.round((fixedWrong/totalWrong)*100)
    : null;
 const wrongSymbol=periodWrongCompleted ? '○' : wrongAnswerStatus(totalWrong,fixedWrong);

 // 4. 시험·테스트 성적 집계 (일간/주간/월간 모두 기준일 이전 최근 성적 히스토리 포함)
 const allDailyUpToEnd=[...p.daily]
  .filter(r=>r.record_date<=p.end)
  .sort((a,b)=>a.record_date.localeCompare(b.record_date));
 const allRecentExams=allDailyUpToEnd.flatMap(r=>
  r.exams.map(e=>({
   ...e,
   date:r.record_date,
   rate:e.max_score>0?Math.round((e.score/e.max_score)*100):0,
  }))
 );
 const exams=allRecentExams.slice(-16);
 const avgScore=exams.length>0?Math.round(exams.reduce((a,b)=>a+b.rate,0)/exams.length):null;
 const maxScore=exams.length>0?Math.max(...exams.map(e=>e.rate)):null;

 // 5. 교재별 진도 및 당일/기간 진도 히스토리
 const activeBooks=p.books.filter(b=>!b.archived);
 const bookProgressList=activeBooks.map(b=>{
  const pct=progressPercent(b);
  const bEntries=p.entries.filter(e=>e.book_id===b.id);
  const periodBEntries=entriesInPeriod.filter(e=>e.book_id===b.id);
  const firstInPeriod=periodBEntries[0]??bEntries[0];
  const latest=bEntries[bEntries.length-1];
  const currentUnits=b.units.filter(u=>b.states[u.id]==='진행 중').map(u=>u.name);
  const doneUnits=b.units.filter(u=>b.states[u.id]==='완료').length;
  const startScope=firstInPeriod?.scope?.trim()||currentUnits[0]||'첫 단원';
  const endScope=latest?.scope?.trim()||currentUnits.slice(0,2).join(', ')||(doneUnits>0?`${doneUnits}개 단원 완료`:'진행 중');
  const journeyLabel=
   periodBEntries.length>=2&&startScope!==endScope
    ? `${startScope} → ${endScope}`
    : endScope;
  return {
   id:b.id,
   title:b.title,
   curriculum:b.curriculum,
   course:b.course,
   pct,
   donePages:latest?.completed_page??b.completed_page??0,
   totalPages:latest?.total_pages_snapshot??b.total_pages??0,
   doneUnits,
   totalUnits:b.units.length,
   scope:latest?.scope?.trim()||currentUnits.slice(0,2).join(', ')||'학습 범위 미기록',
   journeyLabel,
   latestHomework:latest?.homework?.trim()||'',
   latestDueDate:latest?.due_date||null,
   recordDate:latest?.record_date||null,
  };
 });

 const avgProgress=
  bookProgressList.length>0
   ? Math.round(bookProgressList.reduce((a,b)=>a+b.pct,0)/bookProgressList.length)
   : null;

 // 기간 내 작성된 진도 엔트리 상세 목록
 const periodProgressLogs=entriesInPeriod.map(e=>{
  const book=p.books.find(b=>b.id===e.book_id);
  const unitNames=(book?.units??[]).filter(u=>e.unit_ids.includes(u.id)).map(u=>u.name);
  const total=e.total_pages_snapshot??book?.total_pages??0;
  const done=e.completed_page??book?.completed_page??0;
  const pct=total>0?Math.min(100,Math.round((done/total)*100)):book?progressPercent(book):0;
  return {
   id:e.id,
   bookId:e.book_id,
   date:e.record_date,
   bookTitle:book?.title||'교재',
   course:book?.course||'',
   scope:e.scope.trim()||unitNames.join(', ')||'단원 학습 진행',
   homework:e.homework.trim(),
   dueDate:e.due_date,
   memo:e.memo.trim(),
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
  todayWrongCompleted,
  todayHasWrongRecord,
  periodWrongCompleted,
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
 };
}

type StudentData = ReturnType<typeof computeStudentData>;

function AutoGrowFeedbackTextarea({
 value,
 placeholder,
 onChange,
 onBulkApply,
 bulkCount,
}: {
 value: string;
 placeholder: string;
 onChange: (next: string) => void;
 onBulkApply?: (text: string) => void;
 bulkCount?: number;
}) {
 const ref = useRef<HTMLTextAreaElement>(null);
 const lineCount = Math.max(2, value.split('\n').length);

 useEffect(() => {
  const el = ref.current;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(46, el.scrollHeight)}px`;
 }, [value]);

 return (
  <div>
   <textarea
    ref={ref}
    className={styles.inlineTextarea}
    rows={lineCount}
    value={value}
    placeholder={placeholder}
    onKeyDown={e => e.stopPropagation()}
    onChange={e => {
     const el = e.currentTarget;
     el.style.height = 'auto';
     el.style.height = `${Math.max(46, el.scrollHeight)}px`;
     onChange(e.target.value);
    }}
   />
   {onBulkApply && (bulkCount ?? 0) > 1 && (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }} data-export-hide="true">
     <button
      type="button"
      data-export-hide="true"
      onClick={() => onBulkApply(value)}
      style={{
       display: 'inline-flex',
       alignItems: 'center',
       gap: 5,
       padding: '4px 10px',
       borderRadius: 7,
       border: '1px solid #2563eb',
       background: '#eff6ff',
       color: '#1d4ed8',
       fontSize: 11,
       fontWeight: 800,
       cursor: 'pointer',
      }}
     >
      <Check size={12} /> 이 피드백 코멘트를 선택 학생 {bulkCount}명에 일괄 적용
     </button>
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * 시험 시리즈 그룹핑 & 공통 성적 시각화 컴포넌트 (모든 템플릿 · 모든 기간 공통 적용)
 * - 같은 날 시험을 2개 이상 보거나 시험 종류가 여러 개일 때 그래프를 각각 분리 생성
 * - 보여주기 싫은 그래프는 우측 상단 '✕ 그래프 숨기기' 버튼으로 즉시 제거 가능
 * - 각 그래프별 성적 1~3개: 가로 막대 리스트 / 4개 이상: 꺾은선 그래프
 * ============================================================================ */
interface ExamSeriesGroup {
 key: string;
 title: string;
 exams: StudentData['exams'];
 avgScore: number;
 maxScore: number;
}

function buildExamSeriesGroups(allExams: StudentData['exams']): ExamSeriesGroup[] {
 if (allExams.length === 0) return [];
 const buckets = new Map<string, { title: string; exams: StudentData['exams'] }>();
 const perDateNameCount = new Map<string, number>();

 for (const ex of allExams) {
  const baseName = (ex.name || '단원평가').trim() || '단원평가';
  const dateNameKey = `${ex.date}__${baseName}`;
  const slotIdx = (perDateNameCount.get(dateNameKey) ?? 0) + 1;
  perDateNameCount.set(dateNameKey, slotIdx);

  const seriesKey = slotIdx === 1 ? baseName : `${baseName}#${slotIdx}`;
  const seriesTitle = slotIdx === 1 ? baseName : `${baseName} (${slotIdx}차)`;
  const bucket = buckets.get(seriesKey) ?? { title: seriesTitle, exams: [] };
  bucket.exams.push(ex);
  buckets.set(seriesKey, bucket);
 }

 return Array.from(buckets.entries()).map(([key, b]) => {
  const sliced = b.exams.slice(-8);
  const avgScore = sliced.length > 0 ? Math.round(sliced.reduce((sum, e) => sum + e.rate, 0) / sliced.length) : 0;
  const maxScore = sliced.length > 0 ? Math.max(...sliced.map(e => e.rate)) : 0;
  return {
   key,
   title: b.title,
   exams: sliced,
   avgScore,
   maxScore,
  };
 });
}

function SingleSeriesGraph({
 exams,
 avgScore,
 maxScore,
}: {
 exams: StudentData['exams'];
 avgScore: number;
 maxScore: number;
}) {
 const isLineChart = exams.length >= 4;
 const chartExams = isLineChart ? exams.slice(-6) : exams.slice(-3);
 const latestExam = exams[exams.length - 1];

 return (
  <div className={styles.gradesSplitLayout}>
   <div className={styles.gradesSplitLeft}>
    {!isLineChart ? (
     /* 1~3개: 깔끔한 가로 막대형 */
     <div className={styles.saebomHorizBarGroup}>
      {chartExams.map(ex => (
       <div key={ex.id} className={styles.saebomHorizBarRow}>
        <div className={styles.saebomHorizDate}>
         <b>{shortDate(ex.date)}</b>
         <small>{ex.name}</small>
        </div>
        <div className={styles.saebomHorizTrack}>
         <div
          className={styles.saebomBarSolid}
          style={{ width: `${Math.max(8, ex.rate)}%` }}
         />
        </div>
        <div className={styles.saebomHorizScore}>
         <strong>{ex.rate}점</strong>
         <small>{ex.score}/{ex.max_score}</small>
        </div>
       </div>
      ))}
     </div>
    ) : (
     /* 4개 이상: 꺾은선 그래프 (왼쪽 배치) */
     <svg viewBox="0 0 340 132" className={styles.monthTrendSvg} role="img" aria-label="최근 시험 성적 추이 꺾은선 그래프">
      {[25, 50, 75, 100].map(v => {
       const y = 102 - v * 0.74;
       return (
        <g key={v}>
         <line x1="26" x2="322" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="2 2"/>
         <text x="4" y={y + 3} fontSize="8" fill="#64748b">{v}</text>
        </g>
       );
      })}
      <line x1="26" x2="322" y1="102" y2="102" stroke="#cbd5e1" strokeWidth="1.2"/>

      {(() => {
       const count = chartExams.length;
       const step = 272 / Math.max(1, count - 1);
       const pts = chartExams.map((ex, idx) => ({
        ex,
        idx,
        cx: count === 1 ? 174 : 38 + idx * step,
        cy: 102 - Math.max(0, Math.min(100, ex.rate)) * 0.74,
       }));
       const polyPoints = pts.map(pt => `${pt.cx},${pt.cy}`).join(' ');
       const areaPoints = `${pts[0].cx},102 ${polyPoints} ${pts[pts.length - 1].cx},102`;

       return (
        <>
         <polygon
          points={areaPoints}
          fill="var(--theme-bar, #3b82f6)"
          opacity="0.14"
         />
         <polyline
          fill="none"
          stroke="var(--theme-accent, #2563eb)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyPoints}
         />
         {pts.map(({ ex, idx, cx, cy }) => {
          const isLast = idx === pts.length - 1;
          return (
           <g key={ex.id}>
            <circle
             cx={cx}
             cy={cy}
             r={isLast ? 4.5 : 3.8}
             fill={isLast ? 'var(--theme-accent, #2563eb)' : '#ffffff'}
             stroke="var(--theme-accent, #2563eb)"
             strokeWidth="2.2"
            />
            <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fontWeight="800" fill="#0f172a">
             {ex.rate}점
            </text>
            <text x={cx} y="116" textAnchor="middle" fontSize="8" fontWeight="700" fill="#334155">
             {shortDate(ex.date)}
            </text>
            <text x={cx} y="127" textAnchor="middle" fontSize="7.5" fill="#64748b">
             {ex.name.slice(0, 6)}
            </text>
           </g>
          );
         })}
        </>
       );
      })()}
     </svg>
    )}
   </div>

   <div className={styles.gradesSplitRight}>
    <div className={styles.saebomDailyCheckItem}>
     <span>최근 응시 · 최고</span>
     <strong>{exams.length}회 응시 (최고 {maxScore}점)</strong>
    </div>
    <div className={styles.saebomDailyCheckItem}>
     <span>최근 평균 성취도</span>
     <strong style={{ color: 'var(--theme-accent, #2563eb)' }}>
      {avgScore}점
     </strong>
    </div>
    {latestExam && (
     <div className={styles.saebomDailyCheckItem}>
      <span>최근 응시 결과 ({shortDate(latestExam.date)})</span>
      <strong>{latestExam.rate}점</strong>
     </div>
    )}
   </div>
  </div>
 );
}

function AdaptiveGradesDisplay({
 exams,
 variant,
 emptyText,
}: {
 exams: StudentData['exams'];
 avgScore?: number | null;
 maxScore?: number | null;
 variant: 'saebom' | 'theme';
 emptyText: string;
}) {
 const seriesGroups = buildExamSeriesGroups(exams);
 const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

 if (seriesGroups.length === 0) {
  if (variant === 'saebom') {
   return (
    <>
     <p style={{ margin: 0, fontSize: 11.5, color: '#64748b' }}>{emptyText}</p>
     <div className={styles.saebomDailyCheckGrid}>
      <div className={styles.saebomDailyCheckItem}>
       <span>최근 응시 내역</span>
       <strong>미응시</strong>
      </div>
      <div className={styles.saebomDailyCheckItem}>
       <span>평균 성취도</span>
       <strong>-</strong>
      </div>
     </div>
    </>
   );
  }
  return (
   <div className={styles.emptyBox}>
    <GraduationCap size={20}/>
    <p>{emptyText}</p>
   </div>
  );
 }

 const visibleGroups = seriesGroups.filter(g => !hiddenKeys.includes(g.key));
 const hiddenCount = seriesGroups.length - visibleGroups.length;

 return (
  <div className={styles.examSeriesStack}>
   {visibleGroups.map(group => (
    <div key={group.key} className={styles.examSeriesBlock}>
     <div className={styles.examSeriesSubHead}>
      <span className={styles.examSeriesBadge}>
       📊 {group.title} ({group.exams.length}회 · 평균 {group.avgScore}점)
      </span>
      <button
       type="button"
       className={styles.hideGraphBtn}
       data-export-hide="true"
       onClick={() => setHiddenKeys(prev => [...prev, group.key])}
       title="이 성적 그래프를 보고서에서 숨깁니다"
      >
       <X size={11}/> 그래프 숨기기
      </button>
     </div>
     <SingleSeriesGraph
      exams={group.exams}
      avgScore={group.avgScore}
      maxScore={group.maxScore}
     />
    </div>
   ))}

   {hiddenCount > 0 && (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }} data-export-hide="true">
     <button
      type="button"
      className={styles.restoreGraphBtn}
      data-export-hide="true"
      onClick={() => setHiddenKeys([])}
     >
      <RotateCcw size={11}/> 숨긴 성적 그래프 다시 보기 ({hiddenCount}개)
     </button>
    </div>
   )}
  </div>
 );
}

interface CompetencyItem {
 key: string;
 label: string;
 score: number;
 detail: string;
 strengthDesc: string;
 weaknessDesc: string;
}

function computeMonthlyCompetencies(s: StudentData): {
 items: CompetencyItem[];
 topStrengths: CompetencyItem[];
 focusWeaknesses: CompetencyItem[];
} {
 const attScore =
  s.recordedAtt > 0
   ? Math.max(35, Math.min(100, Math.round(((s.attended + s.late * 0.6) / s.recordedAtt) * 100)))
   : 95;
 const hwScore = s.hwRate !== null ? Math.max(25, Math.min(100, s.hwRate)) : 90;
 const wrongScore = s.periodWrongCompleted
  ? 100
  : s.wrongRate !== null
    ? Math.max(25, Math.min(100, s.wrongRate))
    : 78;
 const gradeScore = s.avgScore !== null ? Math.max(25, Math.min(100, s.avgScore)) : 82;
 const progScore =
  s.avgProgress !== null
   ? Math.min(100, Math.max(45, Math.round(s.avgProgress * 0.65 + Math.min(35, Math.max(15, s.periodProgressLogs.length * 7)))))
   : 84;

 const items: CompetencyItem[] = [
  {
   key: 'attendance',
   label: '출결 성실도',
   score: attScore,
   detail: s.recordedAtt > 0 ? `등원 ${s.recordedAtt}일 중 출석 ${s.attended}일` : '규칙적 등원 유지',
   strengthDesc: '결석·지각 없이 규칙적인 등원 리듬과 수업 참여 태도가 매우 안정적입니다.',
   weaknessDesc: '지각·결석으로 인한 학습 흐름 단절을 줄이고 일정한 등원 리듬을 유지해야 합니다.',
  },
  {
   key: 'homework',
   label: '과제 수행력',
   score: hwScore,
   detail: s.hwRecorded.length > 0 ? `검사 ${s.hwRecorded.length}회 중 완료(O) ${s.hwDone}회` : '과제 성실 이행',
   strengthDesc: '부여된 과제를 성실히 완수하여 수업 개념을 스스로 체화하는 자기주도성이 뛰어납니다.',
   weaknessDesc: '과제 미완료·지연을 줄이고 수업 전까지 정해진 분량을 끝까지 풀어오는 습관이 필요합니다.',
  },
  {
   key: 'wrong',
   label: '오답 완성도',
   score: wrongScore,
   detail: !s.hasWrongRecord
    ? '오답 클리닉 기록 없음'
    : s.periodWrongCompleted
      ? '기간 내 오답 클리닉 완료'
      : `오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결`,
   strengthDesc: '틀린 문항을 끝까지 다시 풀어 완벽히 이해하고 넘어가는 오답 정리 습관이 우수합니다.',
   weaknessDesc: '틀린 문항이 누적되지 않도록 오답 클리닉을 미루지 않고 제때 마무리하는 훈련이 필요합니다.',
  },
  {
   key: 'grades',
   label: '평가 성취도',
   score: gradeScore,
   detail: s.exams.length > 0 ? `${s.exams.length}회 응시 · 평균 ${s.avgScore}점` : '정기 평가 점검',
   strengthDesc: '실전 테스트에서 배운 개념을 정확히 적용하여 높은 정답률과 득점력을 보여주고 있습니다.',
   weaknessDesc: '단원·정기 평가에서 자주 실수하는 유형을 점검하고 핵심 문항 득점력을 끌어올려야 합니다.',
  },
  {
   key: 'progress',
   label: '진도 달성력',
   score: progScore,
   detail: s.bookProgressList.length > 0 ? `교재 ${s.bookProgressList.length}권 · 평균 ${s.avgProgress ?? 0}%` : '목표 진도 이행',
   strengthDesc: '계획된 교재 진도와 단원 학습 목표를 흔들림 없이 꾸준히 추진하고 있습니다.',
   weaknessDesc: '계획된 단원 진도가 밀리지 않도록 주간 학습 분량을 일정한 속도로 소화해야 합니다.',
  },
 ];

 const sorted = [...items].sort((a, b) => b.score - a.score);
 const topStrengths = sorted.slice(0, 2);
 const focusWeaknesses = [...sorted].reverse().slice(0, 2);
 return { items, topStrengths, focusWeaknesses };
}

function MonthlyCompetencyDiagnosis({ s }: { s: StudentData }) {
 const { items, topStrengths, focusWeaknesses } = computeMonthlyCompetencies(s);
 const topKeys = new Set(topStrengths.map(i => i.key));
 const weakKey = focusWeaknesses[0]?.key;

 const cx = 86;
 const cy = 78;
 const maxR = 50;
 const angles = items.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5);

 const polygonPoints = (ratio: number) =>
  angles
   .map(a => `${(cx + Math.cos(a) * maxR * ratio).toFixed(1)},${(cy + Math.sin(a) * maxR * ratio).toFixed(1)}`)
   .join(' ');

 const valuePoints = items
  .map((item, i) => {
   const r = (Math.max(20, Math.min(100, item.score)) / 100) * maxR;
   return `${(cx + Math.cos(angles[i]) * r).toFixed(1)},${(cy + Math.sin(angles[i]) * r).toFixed(1)}`;
  })
  .join(' ');

 return (
  <div
   style={{
    display: 'grid',
    gridTemplateColumns: '168px 1.15fr 1fr',
    gap: 12,
    alignItems: 'center',
    background: '#f8fafc',
    border: '1px solid #dbe5f2',
    borderRadius: 10,
    padding: '10px 12px',
   }}
  >
   {/* 1. 오각형 레이더 차트 */}
   <svg viewBox="0 0 172 152" style={{ width: '100%', height: 138, overflow: 'visible' }} role="img" aria-label="월간 5대 학습 역량 오각형 차트">
    {[0.35, 0.68, 1].map(level => (
     <polygon
      key={level}
      points={polygonPoints(level)}
      fill={level === 1 ? '#ffffff' : 'none'}
      stroke="#cbd5e1"
      strokeWidth={level === 1 ? '1.1' : '0.8'}
      strokeDasharray={level < 1 ? '2 2' : undefined}
     />
    ))}
    {angles.map((a, idx) => (
     <line
      key={idx}
      x1={cx}
      y1={cy}
      x2={cx + Math.cos(a) * maxR}
      y2={cy + Math.sin(a) * maxR}
      stroke="#e2e8f0"
      strokeWidth="0.9"
     />
    ))}
    <polygon
     points={valuePoints}
     fill="var(--theme-accent, #2563eb)"
     fillOpacity="0.18"
     stroke="var(--theme-accent, #2563eb)"
     strokeWidth="2"
    />
    {items.map((item, i) => {
     const r = (Math.max(20, Math.min(100, item.score)) / 100) * maxR;
     const px = cx + Math.cos(angles[i]) * r;
     const py = cy + Math.sin(angles[i]) * r;
     const lx = cx + Math.cos(angles[i]) * (maxR + 17);
     const ly = cy + Math.sin(angles[i]) * (maxR + 14);
     const isTop = topKeys.has(item.key);
     const isWeak = item.key === weakKey;
     return (
      <g key={item.key}>
       <circle
        cx={px}
        cy={py}
        r="3.2"
        fill={isTop ? '#16a34a' : isWeak ? '#d97706' : 'var(--theme-accent, #2563eb)'}
        stroke="#ffffff"
        strokeWidth="1.2"
       />
       <text
        x={lx}
        y={ly + 3}
        textAnchor="middle"
        fontSize="7.8"
        fontWeight="800"
        fill={isTop ? '#15803d' : isWeak ? '#b45309' : '#334155'}
       >
        {item.label}
       </text>
      </g>
     );
    })}
   </svg>

   {/* 2. 5대 평가 요소별 점수 바 */}
   <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {items.map(item => {
     const isTop = topKeys.has(item.key);
     const isWeak = item.key === weakKey;
     const barColor = isTop ? '#16a34a' : isWeak ? '#f59e0b' : 'var(--theme-accent, #2563eb)';
     const badgeText = isTop ? '강점' : isWeak ? '보완' : '안정';
     const badgeBg = isTop ? '#dcfce7' : isWeak ? '#fef3c7' : '#dbeafe';
     const badgeColor = isTop ? '#15803d' : isWeak ? '#b45309' : '#1d4ed8';
     return (
      <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
         <strong style={{ color: '#0f172a', fontSize: 10.5 }}>{item.label}</strong>
         <span
          style={{
           fontSize: 8.5,
           fontWeight: 800,
           padding: '0.5px 5px',
           borderRadius: 999,
           background: badgeBg,
           color: badgeColor,
          }}
         >
          {badgeText}
         </span>
        </div>
        <span style={{ fontSize: 9.5, color: '#475569', fontWeight: 700 }}>
         {item.detail} · <b style={{ color: barColor }}>{item.score}점</b>
        </span>
       </div>
       <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${item.score}%`, height: '100%', background: barColor, borderRadius: 999 }} />
       </div>
      </div>
     );
    })}
   </div>

   {/* 3. 강점 & 약점(보완점) 진단 요약 카드 */}
   <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div
     style={{
      background: '#ffffff',
      border: '1px solid #bbf7d0',
      borderLeft: '3.5px solid #16a34a',
      borderRadius: 8,
      padding: '7px 9px',
     }}
    >
     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: '#15803d' }}>💪 이번 달 핵심 강점</span>
      <strong style={{ fontSize: 9.5, color: '#166534' }}>
       {topStrengths.map(t => t.label).join(' · ')}
      </strong>
     </div>
     <p style={{ margin: 0, fontSize: 9.5, color: '#334155', lineHeight: 1.4 }}>
      {topStrengths[0]?.strengthDesc}
     </p>
    </div>

    <div
     style={{
      background: '#ffffff',
      border: '1px solid #fde68a',
      borderLeft: '3.5px solid #f59e0b',
      borderRadius: 8,
      padding: '7px 9px',
     }}
    >
     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: '#b45309' }}>🎯 집중 보완 포인트</span>
      <strong style={{ fontSize: 9.5, color: '#92400e' }}>
       {focusWeaknesses[0]?.label}
       {focusWeaknesses[1] && focusWeaknesses[1].score < 80 ? ` · ${focusWeaknesses[1].label}` : ''}
      </strong>
     </div>
     <p style={{ margin: 0, fontSize: 9.5, color: '#334155', lineHeight: 1.4 }}>
      {focusWeaknesses[0]?.weaknessDesc}
     </p>
    </div>
   </div>
  </div>
 );
}

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
   case 'wrong': return s.hasWrongRecord;
   case 'grades': return s.exams.length > 0;
   case 'progress': return s.bookProgressList.length > 0 || s.periodProgressLogs.length > 0;
   case 'feedback': return true;
  }
 };

 const hasKind = (k: Kind) => enabledSet.has(k) && hasDataFor(k);

 const getSpan = (k: Kind, fallback: BlockSpan): BlockSpan => {
  const found = rawBlocks.find(b => b.kind === k);
  if (found?.span) return found.span;
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

/* ============================================================================
 * [기본형 스타일] 📘 클린 블루 & 화이트 에디토리얼 시트 (SaebomForestSheet)
 * - 깔끔한 순백색(#ffffff) 바탕 + 로열 블루(#2563eb) 포인트
 * - 출석(초록) / 지각(노랑) / 결석(빨강) 직관적 색상 구분
 * - 오답 완료 시 문항 수 대신 '오답 완료'로 깔끔하게 표기
 * - 일간(day) / 주간(week) / 월간(month) 주기에 따라 양식이 각각 다르게 구성
 * ============================================================================ */
function SaebomForestSheet({
 p,
 s,
 cfg,
 template,
 period,
 periodKor,
 onEditFeedback,
 onBulkEditFeedback,
 bulkTargetCount,
}: {
 p: Preview;
 s: StudentData;
 cfg: LayoutConfig;
 template: Template;
 period: 'day' | 'week' | 'month';
 periodKor: string;
 onEditFeedback?: (studentId: string, date: string, memo: string) => void;
 onBulkEditFeedback?: (date: string, memo: string) => void;
 bulkTargetCount?: number;
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

 // 1) '— 한눈에' 카드에 들어갈 활성 지표 수집
 const summaryMetrics: {
  key: Kind;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  toneColor?: string;
 }[] = [];

 if (cfg.hasKind('attendance')) {
  const attStatus = s.todayAtt || '출석';
  const attColor =
   attStatus === '출석' ? '#15803d' : attStatus === '지각' ? '#b45309' : attStatus === '결석' ? '#b91c1c' : '#0f172a';
  if (period === 'day') {
   summaryMetrics.push({
    key: 'attendance',
    label: '오늘 출결 상태',
    value: attStatus,
    sub: s.todayAttReason || (attStatus === '출석' ? '당일 정상 등원 완료' : `${s.dateLabel} 출결 확인`),
    toneColor: attColor,
   });
  } else if (period === 'week') {
   summaryMetrics.push({
    key: 'attendance',
    label: '주간 출석 일수',
    value: `${s.attended}일`,
    sub: `이번 주 기록 ${s.recordedAtt}일 중 출석률 ${s.attRate ?? 100}%`,
    toneColor: '#15803d',
   });
  } else {
   summaryMetrics.push({
    key: 'attendance',
    label: '월간 누적 출석',
    value: `${s.attended}일`,
    sub: `${s.absent === 0 ? '월간 결석 없음' : `결석 ${s.absent}일 · 지각 ${s.late}일`} (출석률 ${s.attRate ?? 100}%)`,
    toneColor: '#15803d',
   });
  }
 }

 if (cfg.hasKind('homework')) {
  if (period === 'day') {
   summaryMetrics.push({
    key: 'homework',
    label: '당일 과제 검사',
    value: s.todayHwStatus ? `${s.hwLabels[s.todayHwStatus]} (${s.todayHwStatus})` : s.hwRate !== null ? `${s.hwRate}%` : '완료 (O)',
    sub: '당일 제출 과제 확인 완료',
   });
  } else {
   summaryMetrics.push({
    key: 'homework',
    label: period === 'week' ? '주간 과제 수행률' : '월간 과제 성실도',
    value: `${s.hwRate ?? 100}%`,
    sub: `검사 ${s.hwRecorded.length}회 중 완료(O) ${s.hwDone}회 · 일부(△) ${s.hwPartial}회`,
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
  const hasRec = period === 'day' ? s.todayHasWrongRecord : s.hasWrongRecord;
  const isWrongDone = period === 'day' ? s.todayWrongCompleted : s.periodWrongCompleted;
  summaryMetrics.push({
   key: 'wrong',
   label: period === 'day' ? '당일 오답 클리닉' : period === 'week' ? '주간 오답 클리닉' : '월간 오답 클리닉',
   value: !hasRec ? '기록 없음' : isWrongDone ? '오답 완료' : s.wrongRate !== null ? `${s.wrongRate}%` : '미완료',
   sub: !hasRec
    ? (period === 'day' ? '당일 등록된 오답 클리닉 기록 없음' : '해당 기간 오답 클리닉 기록 없음')
    : isWrongDone
      ? (period === 'day' ? '당일 오답 클리닉 완료 확인' : '기간 내 오답 클리닉 완료 확인')
      : `오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결 진행 중`,
   accent: hasRec,
   toneColor: !hasRec ? '#64748b' : undefined,
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
      date: b.recordDate || p.end,
      bookTitle: b.title,
      course: b.course,
      scope: b.journeyLabel,
      homework: b.latestHomework,
      dueDate: b.latestDueDate,
      pct: b.pct,
      done: b.donePages,
      total: b.totalPages,
     }));

 const bookRowsLimit = cfg.getRowLimit('progress', 5);

 // 도넛 게이지 계산 (숙제 실행률 또는 오답 해결률)
 const ringPct = cfg.hasKind('homework')
  ? (s.hwRate ?? 100)
  : cfg.hasKind('wrong')
    ? ((period === 'day' ? s.todayHasWrongRecord : s.hasWrongRecord) ? (s.wrongRate ?? 100) : 0)
    : (s.attRate ?? 100);
 const ringRadius = 30;
 const ringCircumference = 2 * Math.PI * ringRadius;
 const ringOffset = ringCircumference - (Math.min(100, Math.max(0, ringPct)) / 100) * ringCircumference;

 const totalHwCount = Math.max(1, s.hwRecorded.length);
 const doneWidth = Math.round((s.hwDone / totalHwCount) * 100);
 const partialWidth = Math.round((s.hwPartial / totalHwCount) * 100);
 const missWidth = Math.max(0, 100 - doneWidth - partialWidth);

 const bluePalette = ['#2563eb', '#3b82f6', '#60a5fa', '#0284c7', '#6366f1'];

 const renderSaebomBlock = (kind: Kind) => {
  if (kind === 'wrong' && cfg.hasKind('homework')) return null;
  const colStyle: CSSProperties = { gridColumn: 'span 12' };

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
     ? `${s.dateLabel} 수업 요약`
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
         className={m.accent ? styles.saebomMetricAccent : styles.saebomMetricValue}
         style={m.toneColor ? { color: m.toneColor } : undefined}
        >
         {m.value}
        </strong>
        <span className={styles.saebomMetricSub}>{m.sub}</span>
       </div>
      ))}
     </div>

     {/* [주간 전용] 월~일 7일 미니 출결·과제 스탬프 바 (출석=초록, 지각=노랑, 결석=빨강) */}
     {period === 'week' && (
      <div className={styles.saebomWeekStrip}>
       {s.weekDays.map(wd => {
        const badgeClass =
         wd.attendance === '출석'
          ? styles.saebomBadgeGood
          : wd.attendance === '지각'
            ? styles.saebomBadgeAmber
            : wd.attendance === '결석'
              ? styles.saebomBadgeRed
              : styles.saebomBadgeSlate;
        return (
         <div key={wd.date} className={styles.saebomWeekDayBox}>
          <b>{wd.label}요일</b>
          <small>{wd.short}</small>
          <span className={`${styles.saebomWeekBadge} ${badgeClass}`}>
           {wd.attendance || '미기록'}
          </span>
          {cfg.hasKind('homework') && (
           <small
            style={{
             fontWeight: 700,
             padding: '1px 4px',
             color: wd.hw === 'O' ? '#15803d' : wd.hw === 'X' ? '#b91c1c' : '#64748b',
            }}
           >
            과제 {wd.hw || '-'}
           </small>
          )}
         </div>
        );
       })}
      </div>
     )}

     {/* [월간 전용] 월간 출결 미니 캘린더 그리드 (출석=초록, 지각=노랑, 결석=빨강) */}
     {period === 'month' && (
      <div className={styles.saebomMonthCalCard}>
       <div className={styles.saebomDailySubHead} style={{ marginTop: 0, marginBottom: 6 }}>
        <span><i className={styles.saebomDash}/> {s.monthLabel} 등원 및 과제 캘린더</span>
        <small>초록=출석 · 노랑=지각 · 빨강=결석</small>
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
          <div key={cell.date} className={`${styles.saebomMonthCalCell} ${cellTone}`}>
           <span>{cell.day}</span>
           {cell.attendance && <b style={{ fontSize: 8.5 }}>{cell.attendance}</b>}
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
   const isWrongDone = period === 'day' ? s.todayWrongCompleted : s.periodWrongCompleted;
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

   const hwStatusLabel = s.todayHwStatus ? `${s.hwLabels[s.todayHwStatus]} (${s.todayHwStatus})` : '완료 (O)';
   const hwColor =
    s.todayHwStatus === 'X' ? '#b91c1c' : s.todayHwStatus === '△' ? '#b45309' : '#15803d';

   return (
    <section key={`saebom-${kind}`} className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {secTitle}</h3>
      <span>{s.dateLabel} 기준</span>
     </div>
     <div className={styles.saebomCard}>
      {period === 'day' ? (
       <div className={styles.gradesSplitLayout}>
        <div className={styles.saebomDonutRow}>
         <div className={styles.saebomDonutWrap}>
          <svg width="72" height="72" viewBox="0 0 76 76">
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
            ? `당일 과제 상태: ${hwStatusLabel}`
            : !s.todayHasWrongRecord
              ? '오답 클리닉: 기록 없음'
              : isWrongDone
                ? '오답 클리닉: 오답 완료'
                : `오답 클리닉 진행 중 (${s.wrongRate ?? 0}%)`}
          </strong>
          <p>
           {cfg.hasKind('homework') && showWrongTogether
            ? !s.todayHasWrongRecord
              ? `과제 성실 수행률 ${s.hwRate ?? 100}% · 당일 오답 클리닉 기록 없음`
              : isWrongDone
                ? `과제 성실 수행률 ${s.hwRate ?? 100}% · 당일 오답 클리닉 완료 확인`
                : `과제 성실 수행률 ${s.hwRate ?? 100}% · 오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결`
            : cfg.hasKind('homework')
              ? `수업 시간마다 제출한 숙제 검사와 학습 계획 이행 기준입니다.`
              : `틀린 문항을 다시 풀어 완벽히 이해했는지 점검한 결과입니다.`}
          </p>
         </div>
        </div>
        <div className={styles.gradesSplitRight}>
         {cfg.hasKind('homework') && (
          <div className={styles.saebomDailyCheckItem}>
           <span>당일 숙제 제출</span>
           <strong style={{ color: hwColor }}>{hwStatusLabel}</strong>
          </div>
         )}
         {showWrongTogether && (
          <div className={styles.saebomDailyCheckItem}>
           <span>당일 오답 클리닉</span>
           <strong style={{ color: !s.todayHasWrongRecord ? '#64748b' : isWrongDone ? '#15803d' : '#2563eb' }}>
            {!s.todayHasWrongRecord
             ? '기록 없음'
             : isWrongDone
               ? '✓ 오답 완료'
               : `${s.todayFixedWrong}/${s.todayTotalWrong}문항 진행중`}
           </strong>
          </div>
         )}
        </div>
       </div>
      ) : (
       /* 주간/월간 전용: 도넛 + 누적 비율 바 & 범례 */
       <>
        <div className={styles.saebomDonutRow}>
         <div className={styles.saebomDonutWrap}>
          <svg width="72" height="72" viewBox="0 0 76 76">
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
            ? `부여된 과제 ${s.hwRecorded.length}회 중 ${s.hwDone}회 완료`
            : !s.hasWrongRecord
              ? '오답 클리닉: 기록 없음'
              : isWrongDone
                ? '오답 클리닉: 오답 완료'
                : `오답 클리닉 진행 중 (${s.wrongRate ?? 0}%)`}
          </strong>
          <p>
           {cfg.hasKind('homework') && showWrongTogether
            ? !s.hasWrongRecord
              ? `과제 성실 수행률 ${s.hwRate ?? 100}% · 기간 내 오답 클리닉 기록 없음`
              : isWrongDone
                ? `과제 성실 수행률 ${s.hwRate ?? 100}% · 기간 내 오답 클리닉 완료 확인`
                : `과제 성실 수행률 ${s.hwRate ?? 100}% · 오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결`
            : cfg.hasKind('homework')
              ? `수업 시간마다 제출한 숙제 검사와 학습 계획 이행 기준입니다.`
              : `틀린 문항을 다시 풀어 완벽히 이해했는지 점검한 결과입니다.`}
          </p>
         </div>
        </div>
        <div className={styles.saebomStackedBar}>
         <i style={{ width: `${doneWidth}%`, background: 'var(--theme-accent, #2563eb)' }}/>
         <i style={{ width: `${partialWidth}%`, background: '#93c5fd' }}/>
         <i style={{ width: `${missWidth}%`, background: '#f87171' }}/>
        </div>
        <div className={styles.saebomLegendRow}>
         <span><i style={{ background: 'var(--theme-accent, #2563eb)' }}/> 완료 {s.hwDone}일</span>
         <span><i style={{ background: '#93c5fd' }}/> 일부완료 {s.hwPartial}일</span>
         <span><i style={{ background: '#f87171' }}/> 미완료 {s.hwMiss}일</span>
         {showWrongTogether && (
          <span>
           <i style={{ background: !s.hasWrongRecord ? '#94a3b8' : '#16a34a' }}/>{' '}
           {!s.hasWrongRecord ? '오답 클리닉: 기록 없음' : isWrongDone ? '오답 클리닉: 오답 완료' : `오답 해결 ${s.wrongRate ?? 0}%`}
          </span>
         )}
        </div>
        {period === 'month' && (
         <div style={{ marginTop: 10 }}>
          <div className={styles.saebomDailySubHead} style={{ marginTop: 0, marginBottom: 6 }}>
           <span><i className={styles.saebomDash}/> 월간 5대 학습 역량 진단 (강점 · 보완점 분석)</span>
           <small>출결 · 과제 · 오답 · 성적 · 진도 종합</small>
          </div>
          <MonthlyCompetencyDiagnosis s={s} />
         </div>
        )}
       </>
      )}
     </div>
    </section>
   );
  }

  if (kind === 'grades') {
   const gradeSecTitle =
    period === 'day'
     ? '당일 및 최근 테스트 성취도'
     : period === 'week'
       ? '주간 및 최근 테스트 성취도'
       : '월간 시험 성취도 및 성적 추이';
   return (
    <section key="saebom-grades" className={styles.saebomSection} style={colStyle}>
     <div className={styles.saebomSecHead}>
      <h3><i className={styles.saebomDash}/> {gradeSecTitle}</h3>
      <span>{s.exams.length > 0 ? `최근 응시 ${s.exams.length}회 · 평균 ${s.avgScore}점` : '성취도 요약'}</span>
     </div>
     <div className={styles.saebomCard}>
      <AdaptiveGradesDisplay
       exams={s.exams}
       avgScore={s.avgScore}
       maxScore={s.maxScore}
       variant="saebom"
       emptyText="최근 실시된 테스트 기록이 없습니다."
      />
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
      <span>{s.bookProgressList.length > 0 ? `총 ${s.bookProgressList.length}권 진행 중` : '진도 기록'}</span>
     </div>
     <div className={styles.saebomCard} style={{ padding: 0, overflow: 'hidden', justifyContent: 'flex-start' }}>
      {period === 'day' ? (
       /* [일간 전용] 오늘 나간 진도 범위 + 다음 수업 숙제 4열 테이블 */
       <table className={styles.saebomTable}>
        <thead>
         <tr>
          <th style={{ width: '30%' }}>교재 · 과정</th>
          <th style={{ width: '13%', textAlign: 'center' }}>구분</th>
          <th style={{ width: '32%' }}>오늘 수업 진도 범위</th>
          <th>부여된 다음 과제</th>
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
              <span>{log.scope && log.scope !== '학습 범위 미기록' ? log.scope : '단원 진도 학습 진행'}</span>
              <b className={styles.saebomPctTag}>{log.pct}%</b>
             </div>
            </td>
            <td style={{ fontSize: 11, color: '#1e3a8a', fontWeight: 600 }}>
             {log.homework ? `${log.homework}${log.dueDate ? ` (~${shortDate(log.dueDate)})` : ''}` : '교재 복습 및 오답 정리'}
            </td>
           </tr>
          ))
         ) : (
          <tr>
           <td colSpan={4} className={styles.emptyCell}>당일 기록된 교재 진도 내역이 없습니다.</td>
          </tr>
         )}
        </tbody>
       </table>
      ) : (
       /* [주간 / 월간 전용] 이 기간에 공부한 교재 (처음 → 마지막 진도 흐름) */
       <table className={styles.saebomTable}>
        <thead>
         <tr>
          <th style={{ width: '34%' }}>교재 · 강의</th>
          <th style={{ width: '14%', textAlign: 'center' }}>종류</th>
          <th>진도 기록 (기간 내 학습 범위)</th>
         </tr>
        </thead>
        <tbody>
         {s.bookProgressList.length > 0 ? (
          s.bookProgressList.slice(0, bookRowsLimit).map((b, idx) => (
           <tr key={b.id}>
            <td>
             <strong className={styles.saebomBookName}>{b.title}</strong>
             <span className={styles.saebomBookCourse}>{b.course}</span>
            </td>
            <td style={{ textAlign: 'center' }}>
             <span className={`${styles.saebomTypePill} ${idx % 2 === 0 ? styles.saebomPillGreen : styles.saebomPillBeige}`}>
              {b.curriculum?.includes('내신') || b.title.includes('교과') ? '내신교재' : '문제집'}
             </span>
            </td>
            <td>
             <div className={styles.saebomJourneyCell}>
              <span>{b.journeyLabel && b.journeyLabel !== '학습 범위 미기록' ? b.journeyLabel : '단원 학습 진행'}</span>
              <b className={styles.saebomPctTag}>
               {b.totalPages > 0 ? `${b.donePages}/${b.totalPages}p (${b.pct}%)` : `${b.pct}%`}
              </b>
             </div>
            </td>
           </tr>
          ))
         ) : (
          <tr>
           <td colSpan={3} className={styles.emptyCell}>등록된 진행 교재가 없습니다.</td>
          </tr>
         )}
        </tbody>
       </table>
      )}

      {s.bookProgressList.length > 0 && (
       <div className={styles.saebomPastelWrap}>
        <div className={styles.saebomDailySubHead} style={{ marginTop: 0 }}>
         <span><i className={styles.saebomDash}/> 교재별 누적 완성도</span>
         <small>진행 교재 {s.bookProgressList.length}권 기준</small>
        </div>
        {s.bookProgressList.slice(0, 4).map((b, idx) => (
         <div key={b.id} className={styles.saebomPastelRow}>
          <span className={styles.saebomPastelLabel}>{b.title}</span>
          <div className={styles.saebomPastelTrack}>
           <div
            className={styles.saebomPastelFill}
            style={{ width: `${Math.max(5, b.pct)}%`, background: bluePalette[idx % bluePalette.length] }}
           />
          </div>
          <strong className={styles.saebomPastelVal}>
           {b.totalPages > 0 ? `${b.donePages}/${b.totalPages}p · ${b.pct}%` : `${b.pct}%`}
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
      <span>{periodKor} 지도 코멘트</span>
     </div>
     <div className={styles.saebomTeacherNote}>
      {onEditFeedback ? (
       <div className={styles.saebomNoteItem}>
        <strong className={styles.saebomNoteDate}>
         {dayjs(p.end).format('M월 D일')} ({korWeekdays[dayjs(p.end).day()]}) · {periodKor} 학습 종합 기록
        </strong>
        <AutoGrowFeedbackTextarea
         value={s.todayWrongMemo}
         placeholder={`${p.name} 학생은 해당 기간 출석률 ${s.attRate ?? 100}%, 과제 수행률 ${s.hwRate ?? 100}%를 기록했습니다. 이곳을 클릭하여 선생님 피드백 코멘트를 직접 입력하거나 수정할 수 있습니다.`}
         onChange={val => onEditFeedback(p.id, p.end, val)}
         onBulkApply={onBulkEditFeedback ? val => onBulkEditFeedback(p.end, val) : undefined}
         bulkCount={bulkTargetCount}
        />
       </div>
      ) : s.comments.length > 0 ? (
       s.comments.slice(0, cfg.getRowLimit('feedback', 3)).map(c => (
        <div key={c.id} className={styles.saebomNoteItem}>
         <strong className={styles.saebomNoteDate}>
          {dayjs(c.date).format('M월 D일')} ({korWeekdays[dayjs(c.date).day()]}) · {c.tag}
         </strong>
         <p>{c.text}</p>
        </div>
       ))
      ) : (
       <div className={styles.saebomNoteItem}>
        <strong className={styles.saebomNoteDate}>
         {dayjs(p.end).format('M월 D일')} ({korWeekdays[dayjs(p.end).day()]}) · {periodKor} 학습 종합 기록
        </strong>
        <p>
         {p.name} 학생은 해당 기간 출석률 {s.attRate ?? 100}%, 과제 수행률 {s.hwRate ?? 100}%를 기록했습니다.{' '}
         {s.periodWrongCompleted || s.todayWrongCompleted
          ? '부여된 오답 클리닉을 성실히 완료하였으며, '
          : s.totalWrong > 0
            ? `오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항을 해결하며 약점 유형을 보완하고 있고, `
            : ''}
         {s.bookProgressList[0]
          ? `현재 '${s.bookProgressList[0].title}' 교재를 ${s.bookProgressList[0].pct}% 성취도로 꾸준히 학습하고 있습니다.`
          : '수업 시간에 배운 핵심 개념을 바탕으로 꾸준히 실력을 다지고 있습니다.'}
        </p>
       </div>
      )}

      {cfg.showNextHw && s.homeworkTasks.length > 0 && (
       <div className={styles.saebomNextHwBar}>
        <b>다음 수업 과제</b>
        <span>
         {s.homeworkTasks
          .slice(0, 2)
          .map(t => `[${t.bookTitle}] ${t.homework}${t.dueDate ? ` (~${shortDate(t.dueDate)})` : ''}`)
          .join('  /  ')}
        </span>
       </div>
      )}
     </div>
    </section>
   );
  }

  return null;
 };

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
 * [A] 일간 보고서 전용 본문 (DayBody)
 * - 출석(초록) / 지각(노랑) / 결석(빨강) 색상 도장
 * - 오답 완료 시 문항 수와 관계없이 '오답 완료' 표시
 * ============================================================================ */
function DayBody({p,s,cfg}:{p:Preview;s:StudentData;cfg:LayoutConfig}){
 const attOptions:('출석'|'지각'|'결석')[]=['출석','지각','결석'];
 const hwOptions:[('O'|'△'|'X'),string][]=[['O','완료'],['△','일부'],['X','미완료']];
 const todayLogs=s.periodProgressLogs.length>0?s.periodProgressLogs:s.bookProgressList.map(b=>({
  id:b.id,
  bookId:b.id,
  date:b.recordDate||p.end,
  bookTitle:b.title,
  course:b.course,
  scope:b.scope,
  homework:b.latestHomework,
  dueDate:b.latestDueDate,
  memo:'',
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
 const progSpan = 12;
 const gradesSpan = 12;

 return (
  <div className={styles.periodBody}>
   {/* 1단: 활성화된 도장 카드 (출석=초록, 지각=노랑, 결석=빨강) */}
   {stampCount > 0 && (
    <div
     className={styles.dayStampGrid}
     style={{ gridTemplateColumns: `repeat(${stampCount}, minmax(0, 1fr))` }}
    >
     {showAtt && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><CalendarCheck2 size={14}/> 오늘 출결 확인</h3>
       <div className={styles.stampRow}>
        {attOptions.map(opt=>{
         const active=(s.todayAtt||'출석')===opt;
         const activeClass=
          opt==='출석'?styles.stampAttGood:opt==='지각'?styles.stampAttWarn:styles.stampAttBad;
         const checkClass=
          opt==='출석'?styles.stampCheckGood:opt==='지각'?styles.stampCheckWarn:styles.stampCheckBad;
         return (
          <div key={opt} className={`${styles.stampCircle} ${active?activeClass:''}`}>
           {active&&<Check size={11} className={`${styles.stampCheck} ${checkClass}`}/>}
           <span>{opt}</span>
          </div>
         );
        })}
       </div>
       <small className={styles.moduleCaption}>
        {s.todayAtt?(s.todayAttReason?`비고: ${s.todayAttReason}`:`당일 ${s.todayAtt} 확인 완료`):'당일 출석 확인 완료'}
       </small>
      </section>
     )}

     {showHw && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><ClipboardCheck size={14}/> 오늘 숙제 검사</h3>
       <div className={styles.stampRow}>
        {hwOptions.map(([code,label])=>{
         const active=(s.todayHwStatus||'O')===code;
         const activeClass=
          code==='O'?styles.stampAttGood:code==='△'?styles.stampAttWarn:styles.stampAttBad;
         const checkClass=
          code==='O'?styles.stampCheckGood:code==='△'?styles.stampCheckWarn:styles.stampCheckBad;
         return (
          <div key={code} className={`${styles.stampCircle} ${styles.stampWide} ${active?activeClass:''}`}>
           {active&&<Check size={11} className={`${styles.stampCheck} ${checkClass}`}/>}
           <strong>{code}</strong>
           <small>{label}</small>
          </div>
         );
        })}
       </div>
       <small className={styles.moduleCaption}>
        {s.todayHwStatus?`과제 수행 상태: ${s.hwLabels[s.todayHwStatus]}`:'당일 과제 제출 완료'}
       </small>
      </section>
     )}

     {showWrong && (
      <section className={styles.moduleCard}>
       <h3 className={styles.moduleHeader}><FileWarning size={14}/> 당일 오답 클리닉</h3>
       <div className={styles.stampRow}>
        {!s.todayHasWrongRecord ? (
         <div className={`${styles.stampCircle} ${styles.stampWide}`} style={{ width: 112 }}>
          <strong style={{ fontSize: 13, color: '#64748b' }}>기록 없음</strong>
          <small>클리닉 미기록</small>
         </div>
        ) : s.todayWrongCompleted ? (
         <div className={`${styles.stampCircle} ${styles.stampWide} ${styles.stampAttGood}`} style={{ width: 112 }}>
          <Check size={11} className={`${styles.stampCheck} ${styles.stampCheckGood}`}/>
          <strong style={{ fontSize: 14 }}>오답 완료</strong>
          <small>클리닉 확인</small>
         </div>
        ) : (
         <div className={styles.dayWrongCounter} style={{ padding: 0 }}>
          <div>
           <span>발생 오답</span>
           <strong>{s.todayTotalWrong}<small>문항</small></strong>
          </div>
          <i>→</i>
          <div>
           <span>해결 완료</span>
           <strong className={styles.accentNum}>{s.todayFixedWrong}<small>문항</small></strong>
          </div>
         </div>
        )}
       </div>
       <small className={styles.moduleCaption}>
        {!s.todayHasWrongRecord
         ? '당일 등록된 오답 클리닉 기록 없음'
         : s.todayWrongCompleted
           ? '당일 오답 클리닉 완료 확인'
           : `남은 오답 ${Math.max(0, s.todayTotalWrong - s.todayFixedWrong)}문항 클리닉 진행 중`}
       </small>
      </section>
     )}
    </div>
   )}

   {/* 2단: 오늘 수업 진도 & 당일 테스트 결과 */}
   {(showProg || showGrades) && (
    <div className={styles.customGrid12}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}><BookOpen size={14}/> 오늘 수업 진도 및 학습 단원</h3>
       <div className={styles.moduleContent}>
        <table className={styles.dataTable}>
         <thead>
          <tr>
           <th style={{width:'38%'}}>교재명 · 과정</th>
           <th>오늘 진도 범위</th>
           <th style={{width:'68px',textAlign:'center'}}>진도율</th>
          </tr>
         </thead>
         <tbody>
          {todayLogs.length>0?todayLogs.slice(0,cfg.getRowLimit('progress',4)).map(log=>(
           <tr key={log.id}>
            <td>
             <b className={styles.tableBookTitle}>{log.bookTitle}</b>
             {log.course&&<span className={styles.tableSubScope}>{log.course}</span>}
            </td>
            <td>{log.scope && log.scope !== '학습 범위 미기록' ? log.scope : '단원 진도 학습'}</td>
            <td style={{textAlign:'center',fontWeight:800}}>{log.pct}%</td>
           </tr>
          )):(
           <tr><td colSpan={3} className={styles.emptyCell}>당일 기록된 교재 진도가 없습니다.</td></tr>
          )}
         </tbody>
        </table>

        {cfg.showNextHw && (
         <div className={styles.nextHwCallout}>
          <div className={styles.nextHwTitle}><Clock size={13}/> 다음 수업까지 해올 숙제 안내</div>
          {s.homeworkTasks.length>0?(
           s.homeworkTasks.slice(0,3).map(t=>(
            <p key={t.id}>
             <span className={styles.hwBookTag}>{t.bookTitle}</span>
             <b>{t.homework}</b>
             {t.dueDate&&<small> (기한: {shortDate(t.dueDate)})</small>}
            </p>
           ))
          ):(
           <p className={styles.mutedText}>교재 복습 및 오답 노트 정리</p>
          )}
         </div>
        )}
       </div>
      </section>
     )}

     {showGrades && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gradesSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <Award size={14}/> 당일 및 최근 테스트 성취도
        {s.avgScore !== null && <span className={styles.headerStatRight}>최근 평균 {s.avgScore}점</span>}
       </h3>
       <div className={styles.moduleContent}>
        <AdaptiveGradesDisplay
         exams={s.exams}
         avgScore={s.avgScore}
         maxScore={s.maxScore}
         variant="theme"
         emptyText="최근 실시된 테스트 기록이 없습니다."
        />
       </div>
      </section>
     )}
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * [B] 주간 보고서 전용 본문 (WeekBody)
 * - 출석(초록) / 지각(노랑) / 결석(빨강) 색상 배지
 * - 오답 완료 시 문항 수 대신 '오답 완료' 배지 표시
 * ============================================================================ */
function WeekBody({p,s,cfg}:{p:Preview;s:StudentData;cfg:LayoutConfig}){
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
  matrixStatParts.push(!s.hasWrongRecord ? '오답 기록 없음' : s.periodWrongCompleted ? '오답 완료' : `오답 해결 ${s.wrongRate ?? 0}%`);
 }

 const showProg = cfg.hasKind('progress');
 const showGrades = cfg.hasKind('grades');
 const progSpan = 12;
 const gradesSpan = 12;

 return (
  <div className={styles.periodBody}>
   {/* 1단: 월~일 주간 점검표 */}
   {showMatrix && (
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}>
      <Calendar size={14}/> 주간 요일별 {matrixTitleParts.join(' · ')} 현황표 (월~일)
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
           <td key={d.date} style={{textAlign:'center'}}>
            {d.attendance?(
             <span className={`${styles.statusPill} ${d.attendance==='출석'?styles.pillGood:d.attendance==='결석'?styles.pillBad:styles.pillWarn}`}>
              {d.attendance}
             </span>
            ):<span className={styles.dashCell}>-</span>}
           </td>
          ))}
         </tr>
        )}
        {showHw && (
         <tr>
          <td className={styles.matrixRowLabel}>숙제 검사</td>
          {s.weekDays.map(d=>(
           <td key={d.date} style={{textAlign:'center'}}>
            {d.hw?(
             <span className={`${styles.statusPill} ${d.hw==='O'?styles.pillGood:d.hw==='X'?styles.pillBad:styles.pillWarn}`}>
              {d.hw==='O'?'O 완료':d.hw==='△'?'△ 일부':'X 미완료'}
             </span>
            ):<span className={styles.dashCell}>-</span>}
           </td>
          ))}
         </tr>
        )}
        {showWrong && (
         <tr>
          <td className={styles.matrixRowLabel}>오답 클리닉</td>
          {s.weekDays.map(d=>(
           <td key={d.date} style={{textAlign:'center',fontSize:'11px',fontWeight:700}}>
            {d.wrongCompleted ? (
             <span className={`${styles.statusPill} ${styles.pillGood}`}>오답 완료</span>
            ) : d.totalWrong !== null && d.totalWrong > 0 ? (
             <span className={`${styles.statusPill} ${styles.pillWarn}`}>
              {d.fixedWrong}/{d.totalWrong}문항
             </span>
            ) : d.attendance || d.hw ? (
             <span className={styles.dashCell}>기록 없음</span>
            ) : (
             <span className={styles.dashCell}>-</span>
            )}
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
    <div className={styles.customGrid12}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <BookOpen size={14}/> 이번 주 진도{cfg.showNextHw ? ' 및 과제' : ''} 내역표
       </h3>
       <div className={styles.moduleContent}>
        <table className={styles.dataTable}>
         <thead>
          <tr>
           <th style={{width:'52px'}}>날짜</th>
           <th>교재 · 진도 범위</th>
           {cfg.showNextHw && <th>부여된 과제</th>}
          </tr>
         </thead>
         <tbody>
          {s.periodProgressLogs.length>0?s.periodProgressLogs.slice(0,cfg.getRowLimit('progress',5)).map(log=>(
           <tr key={log.id}>
            <td style={{fontWeight:700}}>{shortDate(log.date)}</td>
            <td>
             <b className={styles.tableBookTitle}>{log.bookTitle} ({log.pct}%)</b>
             <span className={styles.tableSubScope}>{log.scope && log.scope !== '학습 범위 미기록' ? log.scope : '단원 학습 진행'}</span>
            </td>
            {cfg.showNextHw && <td>{log.homework||'교재 복습'}</td>}
           </tr>
          )):s.bookProgressList.length>0?s.bookProgressList.slice(0,cfg.getRowLimit('progress',4)).map(b=>(
           <tr key={b.id}>
            <td style={{fontWeight:700}}>{b.recordDate?shortDate(b.recordDate):shortDate(p.end)}</td>
            <td>
             <b className={styles.tableBookTitle}>{b.title} ({b.pct}%)</b>
             <span className={styles.tableSubScope}>{b.scope && b.scope !== '학습 범위 미기록' ? b.scope : '단원 학습 진행'}</span>
            </td>
            {cfg.showNextHw && <td>{b.latestHomework||'교재 복습'}</td>}
           </tr>
          )):(
           <tr><td colSpan={cfg.showNextHw ? 3 : 2} className={styles.emptyCell}>이번 주 기록된 진도 내역이 없습니다.</td></tr>
          )}
         </tbody>
        </table>
       </div>
      </section>
     )}

     {showGrades && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${gradesSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <Award size={14}/> 주간 및 최근 테스트 성취도
        {s.avgScore !== null && <span className={styles.headerStatRight}>최근 평균 {s.avgScore}점</span>}
       </h3>
       <div className={styles.moduleContent}>
        <AdaptiveGradesDisplay
         exams={s.exams}
         avgScore={s.avgScore}
         maxScore={s.maxScore}
         variant="theme"
         emptyText="최근 실시된 테스트 기록이 없습니다."
        />
       </div>
      </section>
     )}
    </div>
   )}
  </div>
 );
}

/* ============================================================================
 * [C] 월간 보고서 전용 본문 (MonthBody)
 * - 출석(초록) / 지각(노랑) / 결석(빨강) 월간 달력
 * - 오답 완료 시 '오답 완료' 표시
 * ============================================================================ */
function MonthBody({s,cfg}:{p:Preview;s:StudentData;cfg:LayoutConfig}){
 const showAtt = cfg.hasKind('attendance');
 const showGrades = cfg.hasKind('grades');
 const showProg = cfg.hasKind('progress');
 const showHw = cfg.hasKind('homework');
 const showWrong = cfg.hasKind('wrong');
 const showGauges = showHw || showWrong;

 const attSpan = 12;
 const gradesSpan = 12;
 const progSpan = 12;
 const gaugeSpan = 12;

 return (
  <div className={styles.periodBody}>
   {/* 1단: 월간 출결 캘린더 + 월간 성적 변화 추이 그래프 */}
   {(showAtt || showGrades) && (
    <div className={styles.customGrid12}>
     {showAtt && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${attSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <CalendarCheck2 size={14}/> {s.monthLabel} 출결 캘린더
        <span className={styles.headerStatRight}>출석률 {s.attRate??100}%</span>
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
           <div key={cell.date} className={`${styles.calDayCell} ${badgeClass}`}>
            <span className={styles.calDayNum}>{cell.day}</span>
            {att&&<b className={styles.calAttMark}>{att}</b>}
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
        {s.avgScore!==null&&<span className={styles.headerStatRight}>최근 평균 {s.avgScore}점</span>}
       </h3>
       <div className={styles.moduleContent}>
        <AdaptiveGradesDisplay
         exams={s.exams}
         avgScore={s.avgScore}
         maxScore={s.maxScore}
         variant="theme"
         emptyText="최근 기록된 시험 성적이 없습니다."
        />
       </div>
      </section>
     )}
    </div>
   )}

   {/* 2단: 월간 교재별 누적 완주율 블록 + 월간 숙제·오답 종합 달성도 */}
   {(showProg || showGauges) && (
    <div className={styles.customGrid12}>
     {showProg && (
      <section className={styles.moduleCard} style={{ gridColumn: `span ${progSpan}` }}>
       <h3 className={styles.moduleHeader}>
        <BookOpen size={14}/> 교재별 월말 누적 진도 달성률
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
             <small>
              최근 진도 범위: {b.scope && b.scope !== '학습 범위 미기록' ? b.scope : '단원 학습 진행'}
              {b.totalPages > 0 ? ` (${b.donePages}/${b.totalPages}p)` : ''}
             </small>
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
            <strong>{s.hwRate!==null?`${s.hwRate}%`:'100%'}</strong>
           </div>
           <div className={styles.monthGaugeBar}>
            <i style={{width:`${s.hwRate??100}%`}}/>
           </div>
           <small>완료(O) {s.hwDone}회 · 일부(△) {s.hwPartial}회 · 미완료(X) {s.hwMiss}회 (총 {s.hwRecorded.length}회 검사)</small>
          </div>
         )}

         {showWrong && (
          <div className={styles.monthGaugeItem}>
           <div className={styles.monthGaugeHead}>
            <b>월간 오답 클리닉</b>
            <strong style={!s.hasWrongRecord ? { color: '#64748b' } : s.periodWrongCompleted ? { color: '#15803d' } : undefined}>
             {!s.hasWrongRecord ? '기록 없음' : s.periodWrongCompleted ? '오답 완료' : `${s.wrongRate ?? 0}%`}
            </strong>
           </div>
           <div className={styles.monthGaugeBar}>
            <i style={{width:`${!s.hasWrongRecord ? 0 : s.periodWrongCompleted ? 100 : (s.wrongRate ?? 0)}%`, background: s.periodWrongCompleted ? '#16a34a' : undefined}}/>
           </div>
           <small>
            {!s.hasWrongRecord
             ? '이번 달 등록된 오답 클리닉 기록이 없습니다.'
             : s.periodWrongCompleted
               ? '이번 달 부여된 오답 클리닉이 모두 완료되었습니다.'
               : `한 달간 발생한 오답 ${s.totalWrong}문항 중 ${s.fixedWrong}문항 해결 완료`}
           </small>
          </div>
         )}
        </div>
        <div style={{ marginTop: 10 }}>
         <MonthlyCompetencyDiagnosis s={s} />
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
 onEditFeedback,
 onBulkEditFeedback,
 bulkTargetCount,
}:{
 preview:Preview;
 template?:Template;
 onEditFeedback?: (studentId: string, date: string, memo: string) => void;
 onBulkEditFeedback?: (date: string, memo: string) => void;
 bulkTargetCount?: number;
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
     <SaebomForestSheet
      p={p}
      s={s}
      cfg={cfg}
      template={template}
      period={period}
      periodKor={periodKor}
      onEditFeedback={onEditFeedback}
      onBulkEditFeedback={onBulkEditFeedback}
      bulkTargetCount={bulkTargetCount}
     />
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
         <h2>
          {template.customTitle?.trim() || `${academyTitle} ${periodKor} 학습 점검 리포트`}
         </h2>
        </div>
       </div>
       <div className={styles.miriHeaderIconWrap}>
        {template.logoDataUrl && template.logoPosition === 'right' ? (
         <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
        ) : (
         <>
          <Sparkles size={15} className={styles.miriSparkleIcon}/>
          <div className={styles.miriHeaderBadgeIcon}><PenLine size={20}/></div>
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
        <span className={styles.miriMetaLabel}><CalendarCheck2 size={13}/> 조회 기간</span>
        <strong className={styles.miriMetaValue}>{s.dateLabel}</strong>
       </div>
      </div>
     </>
    )}

    {theme==='mirireport'&& (
     <header className={styles.miriYellowHeader}>
      {template.logoDataUrl && (
       <div style={{display:'flex',justifyContent:template.logoPosition==='right'?'flex-end':template.logoPosition==='left'?'flex-start':'center',marginBottom:6}}>
        <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
       </div>
      )}
      <h2>{template.customTitle?.trim() || `${academyTitle} ${periodKor} 학습 분석 리포트`}</h2>
      <p>
       {period==='day'
        ? `당일 ${enabledLabelList.join('·')} 성취도를 종합한 일일 브리핑`
        : period==='week'
          ? `주간 ${enabledLabelList.join('·')} 추이를 종합한 주간 브리핑`
          : `한 달간의 ${enabledLabelList.join('·')} 성취율을 종합한 월간 리포트`}
      </p>
      <div className={styles.miriYellowStudentPill}>
       <span>소속: <b>{p.group} ({p.grade})</b></span>
       <i>|</i>
       <span>이름: <b>{p.name}</b></span>
       <i>|</i>
       <span>기간: <b>{s.dateLabel}</b></span>
      </div>
     </header>
    )}

    {theme==='mirigraph'&& (
     <header className={styles.miriGraphHeader}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
       {template.logoDataUrl && template.logoPosition !== 'right' && (
        <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
       )}
       <div>
        <span className={styles.miriGraphEyebrow}>{academyTitle.toUpperCase()} · {periodEng.toUpperCase()}</span>
        <h2>{template.customTitle?.trim() || `${periodKor} 성취도 종합 리포트`}</h2>
       </div>
      </div>
      <div className={styles.miriGraphMetaLines}>
       {template.logoDataUrl && template.logoPosition === 'right' && (
        <div style={{borderBottom:0,justifyContent:'flex-end'}}>
         <img src={template.logoDataUrl} alt={academyTitle} className={styles.customLogoImg}/>
        </div>
       )}
       <div><span>학생 이름 :</span><b>{p.name} ({p.grade})</b></div>
       <div><span>소속 반명 :</span><b>{p.group}</b></div>
       <div><span>조회 기간 :</span><b>{s.dateLabel}</b></div>
      </div>
     </header>
    )}

    {/* 주기별 완전히 다른 본문 레이아웃 */}
    {period==='day'&&<DayBody p={p} s={s} cfg={cfg}/>}
    {period==='week'&&<WeekBody p={p} s={s} cfg={cfg}/>}
    {period==='month'&&<MonthBody p={p} s={s} cfg={cfg}/>}

    {/* 하단 피드백 영역 (feedback 블록이 ON일 때만 표시) */}
    {cfg.hasKind('feedback') && theme==='miricheck'&&(
     <footer className={styles.miriFeedbackBox}>
      <div className={styles.miriFeedbackLabel}>
       <MessageSquareText size={16}/>
       <span>선생님 확인<br/>피드백</span>
      </div>
      <div className={styles.miriFeedbackBody}>
       <span className={styles.miriFeedbackSub}>{periodKor} 수업 · {enabledLabelList.join(' · ')} 종합 코멘트</span>
       {onEditFeedback ? (
        <AutoGrowFeedbackTextarea
         value={s.todayWrongMemo}
         placeholder={`${p.name} 학생은 해당 기간 출석률 ${s.attRate ?? 100}%, 과제 수행률 ${s.hwRate ?? 100}%를 기록했습니다. 이곳을 클릭하여 선생님 피드백 코멘트를 입력하세요.`}
         onChange={val => onEditFeedback(p.id, p.end, val)}
         onBulkApply={onBulkEditFeedback ? val => onBulkEditFeedback(p.end, val) : undefined}
         bulkCount={bulkTargetCount}
        />
       ) : (
        <div className={styles.miriRuledLines}>
         {s.comments.length>0?s.comments.slice(0,cfg.getRowLimit('feedback', 3)).map(c=>(
          <p key={c.id}><b>[{c.tag}]</b> {c.text} <small>({shortDate(c.date)})</small></p>
         )):(
          <>
           <p className={styles.miriMutedLine}>
            <Sparkles size={12}/> {p.name} 학생은 해당 기간 출석률 {s.attRate ?? 100}%, 과제 수행률 {s.hwRate ?? 100}%를 기록했습니다.
           </p>
           <p>
            {s.periodWrongCompleted || s.todayWrongCompleted
             ? '당일 및 기간 내 부여된 오답 클리닉을 모두 완료했습니다.'
             : '\u00A0'}
           </p>
          </>
         )}
        </div>
       )}
      </div>
     </footer>
    )}

    {cfg.hasKind('feedback') && theme==='mirireport'&&(
     <footer className={styles.miriYellowTakeaway}>
      <h3 className={styles.miriYellowSecTitle}>{periodKor} 학습 핵심 진단 및 피드백</h3>
      <div className={styles.miriTakeawayList}>
       <p><CheckCircle2 size={13} className={styles.miriCheckIconGreen}/> <span>해당 기간 출석률 {s.attRate??100}% · 숙제 수행률 {s.hwRate??100}% · {!s.hasWrongRecord ? '오답 클리닉 기록 없음' : s.periodWrongCompleted || s.todayWrongCompleted ? '오답 완료' : `오답 해결률 ${s.wrongRate??0}%`}</span></p>
      </div>
      <div className={styles.miriConclusionPill}>
       <Lightbulb size={15} className={styles.miriBulbIcon}/>
       <div style={{ flex: 1 }}>
        <b>담당 교사 종합 코멘트 :</b>
        {onEditFeedback ? (
         <AutoGrowFeedbackTextarea
          value={s.todayWrongMemo}
          placeholder={`${p.name} 학생의 ${periodKor} 학습 태도와 과제 이행 상태를 점검하였으며, 부족한 유형은 클리닉을 통해 보완 지도합니다. (클릭하여 코멘트 입력)`}
          onChange={val => onEditFeedback(p.id, p.end, val)}
          onBulkApply={onBulkEditFeedback ? val => onBulkEditFeedback(p.end, val) : undefined}
          bulkCount={bulkTargetCount}
         />
        ) : (
         <span>
          {' '}
          {s.comments[0]?.text || `${p.name} 학생의 ${periodKor} 학습 태도와 과제 이행 상태를 점검하였으며, 부족한 유형은 클리닉을 통해 보완 지도합니다.`}
         </span>
        )}
       </div>
      </div>
     </footer>
    )}

    {cfg.hasKind('feedback') && theme==='mirigraph'&&(
     <footer className={styles.miriGraphCard}>
      <div className={styles.miriGraphCardHead}>선생님 종합 코멘트 & 학습 가이드</div>
      <div className={styles.miriGraphCommentBody}>
       {onEditFeedback ? (
        <AutoGrowFeedbackTextarea
         value={s.todayWrongMemo}
         placeholder={`${p.name} 학생은 해당 기간 출석률 ${s.attRate ?? 100}%, 과제 수행률 ${s.hwRate ?? 100}%를 기록했습니다. 이곳을 클릭하여 선생님 종합 코멘트를 입력하세요.`}
         onChange={val => onEditFeedback(p.id, p.end, val)}
         onBulkApply={onBulkEditFeedback ? val => onBulkEditFeedback(p.end, val) : undefined}
         bulkCount={bulkTargetCount}
        />
       ) : s.comments.length>0?s.comments.slice(0,cfg.getRowLimit('feedback', 3)).map(c=>(
        <p key={c.id}><MessageSquareText size={13} className={styles.miriCommentIcon}/> <span><b>[{c.tag}]</b> {c.text} ({shortDate(c.date)})</span></p>
       )):(
        <p>
         <MessageSquareText size={13} className={styles.miriCommentIcon}/>
         <span>
          {p.name} 학생은 해당 기간 출석률 {s.attRate??100}%, 과제 수행률 {s.hwRate??100}%를 기록했습니다.{' '}
          {s.periodWrongCompleted || s.todayWrongCompleted
           ? '오답 클리닉을 성실히 완료하였으며, '
           : ''}
          {s.bookProgressList[0]?`'${s.bookProgressList[0].title}' 교재를 ${s.bookProgressList[0].pct}% 성취도로 학습 중입니다.`:'꾸준한 복습과 오답 관리를 통해 실력을 다지고 있습니다.'}
         </span>
        </p>
       )}
      </div>
     </footer>
    )}

    {template.footerNotice?.trim() && (
     <div className={styles.customFooterNotice}>
      <Megaphone size={14}/>
      <span>{template.footerNotice.trim()}</span>
     </div>
    )}
   </div>
  </article>
 );
}
