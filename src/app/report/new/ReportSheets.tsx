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
 Star,
 MessageSquareText,
 PenLine,
 Sparkles,
 GraduationCap,
 Clock,
 AlertCircle,
 Calendar,
 TrendingUp,
} from 'lucide-react';
import {progressPercent,type ProgressBook,type ProgressEntry} from '../../../types/progress';
import {wrongAnswerStatus,type StudentDailyRecord} from '../../../types/student-daily';
import type {WrongAnswerRecord} from '../../../types/wrong-answer';
import {presets,type Template,type Theme} from './templates';
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

function computeStudentData(p:Preview){
 const daily=p.daily.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const wrong=p.wrong.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const entriesInPeriod=p.entries.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const single=p.start===p.end;
 const dateLabel=single?dayjs(p.end).format('YYYY.MM.DD'):`${dayjs(p.start).format('YYYY.MM.DD')} ~ ${dayjs(p.end).format('YYYY.MM.DD')}`;

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
  const refEntry=periodBookEntries[periodBookEntries.length-1]??latestEntry;
  const units=refEntry?.units_snapshot??book.units;
  const totalPages=refEntry?.total_pages_snapshot||book.total_pages||units.length;
  const donePages=refEntry?.total_pages_snapshot?(refEntry.completed_page??0):book.total_pages?(book.completed_page??0):units.filter(u=>(refEntry?.states??book.states)[u.id]==='완료').length;
  const pct=totalPages>0?Math.min(100,Math.round(donePages/totalPages*100)):progressPercent(book);
  const scopes=periodBookEntries.map(e=>e.scope.trim()).filter(Boolean);
  return {
   id:book.id,
   title:book.title,
   curriculum:book.curriculum,
   course:book.course,
   scope:scopes.length?scopes.join(' / '):(refEntry?.scope.trim()||'진도 범위 미기록'),
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
   date:e.record_date,
   bookTitle:book?.title||'교재',
   scope:e.scope.trim()||'학습 범위 미기록',
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

/* ============================================================================
 * [A] 일간 보고서 전용 본문 (DayBody)
 * - 출결: 도장 스탬프 (출석 / 지각 / 결석 / 조퇴)
 * - 숙제: 도장 스탬프 (완료 O / 일부 △ / 미완료 X) + 오늘 나간 과제 강조
 * - 오답: 당일 오답 수정 카운터 (전체 → 수정 → 남음)
 * - 성적: 당일 테스트 결과 스코어 카드
 * - 진도: 오늘 수업한 교재 진도 범위 체크
 * ============================================================================ */
function DayBody({s}:{s:StudentData}){
 const attOptions=['출석','지각','결석'] as const;
 const hwOptions:[ 'O'|'△'|'X', string ][]=[['O','완료 (O)'],['△','일부 (△)'],['X','미완료 (X)']];
 const todayLogs=s.periodProgressLogs.length>0?s.periodProgressLogs:s.bookProgressList.map(b=>({
  id:b.id,
  date:b.recordDate,
  bookTitle:b.title,
  scope:b.scope,
  homework:'',
  dueDate:null,
  pct:b.pct,
  done:b.donePages,
  total:b.totalPages,
 }));

 return (
  <div className={styles.periodBody}>
   {/* 1단: 오늘의 출결 도장 + 오늘의 숙제 검사 도장 + 당일 오답 해결 도장 */}
   <div className={styles.dayStampGrid}>
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><CalendarCheck2 size={14}/> 오늘 출결 확인</h3>
     <div className={styles.stampRow}>
      {attOptions.map(opt=>{
       const active=s.todayAtt===opt;
       return (
        <div key={opt} className={`${styles.stampCircle} ${active?styles.stampActive:''}`}>
         {active&&<Check size={11} className={styles.stampCheck}/>}
         <span>{opt}</span>
        </div>
       );
      })}
     </div>
     <small className={styles.moduleCaption}>
      {s.todayAtt?(s.todayAttReason?`비고: ${s.todayAttReason}`:`당일 ${s.todayAtt} 확인 완료`):'오늘 출결 미기록'}
     </small>
    </section>

    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><ClipboardCheck size={14}/> 오늘 숙제 검사</h3>
     <div className={styles.stampRow}>
      {hwOptions.map(([code,label])=>{
       const active=s.todayHwStatus===code;
       return (
        <div key={code} className={`${styles.stampCircle} ${styles.stampWide} ${active?styles.stampActive:''}`}>
         {active&&<Check size={11} className={styles.stampCheck}/>}
         <strong>{code}</strong>
         <small>{label.split(' ')[0]}</small>
        </div>
       );
      })}
     </div>
     <small className={styles.moduleCaption}>
      {s.todayHwStatus?`전시간 과제 수행: ${s.hwLabels[s.todayHwStatus]}`:'오늘 숙제 검사 미기록'}
     </small>
    </section>

    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><FileWarning size={14}/> 당일 오답 클리닉</h3>
     <div className={styles.dayWrongCounter}>
      <div><span>전체 오답</span><strong>{s.totalWrong}<small>문항</small></strong></div>
      <i>→</i>
      <div><span>수정 완료</span><strong className={styles.accentNum}>{s.fixedWrong}<small>문항</small></strong></div>
      <i>·</i>
      <div><span>남은 오답</span><strong>{s.remainWrong}<small>문항</small></strong></div>
     </div>
     <small className={styles.moduleCaption}>
      {s.hasWrongRecord?`당일 오답 정리 상태: ${s.wrongSymbol} (${s.wrongRate??100}% 해결)`:'오늘 등록된 오답 기록 없음'}
     </small>
    </section>
   </div>

   {/* 2단: 오늘 수업 진도 & 다음 과제 (좌) + 오늘 테스트 성적 스코어보드 (우) */}
   <div className={styles.twoColGrid}>
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><BookOpen size={14}/> 오늘 수업 진도 및 다음 숙제</h3>
     <div className={styles.moduleContent}>
      <table className={styles.dataTable}>
       <thead>
        <tr><th>교재명 · 오늘 학습 범위</th><th style={{width:'88px',textAlign:'center'}}>누적 진도</th></tr>
       </thead>
       <tbody>
        {todayLogs.length>0?todayLogs.slice(0,4).map(log=>(
         <tr key={log.id}>
          <td>
           <b className={styles.tableBookTitle}>{log.bookTitle}</b>
           <span className={styles.tableSubScope}>{log.scope}</span>
          </td>
          <td style={{textAlign:'center'}}>
           <span className={styles.inlineCheckBadge}>
            <em>{log.pct}%</em>
            <i className={`${styles.checkSquare} ${styles.checkSquareOn}`}><Check size={11} strokeWidth={3}/></i>
           </span>
          </td>
         </tr>
        )):(
         <tr><td colSpan={2} className={styles.emptyCell}>등록된 교재 및 진도 기록이 없습니다.</td></tr>
        )}
       </tbody>
      </table>

      <div className={styles.nextHwCallout}>
       <div className={styles.nextHwTitle}><Lightbulb size={14}/> 다음 수업까지 해올 숙제 (HOMEWORK)</div>
       {s.homeworkTasks.length>0?s.homeworkTasks.slice(0,2).map(t=>(
        <p key={t.id}>
         <span className={styles.hwBookTag}>{t.bookTitle}</span> {t.homework}
         {t.dueDate&&<small> · 제출기한 {shortDate(t.dueDate)}</small>}
        </p>
       )):(
        <p className={styles.mutedText}>오늘 새로 부여된 숙제 기록이 없습니다.</p>
       )}
      </div>
     </div>
    </section>

    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><Award size={14}/> 오늘 테스트 결과 (Daily Test)</h3>
     <div className={styles.moduleContent}>
      {s.exams.length>0?(
       <div className={styles.dayExamList}>
        {s.exams.slice(0,3).map(ex=>(
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
   </div>
  </div>
 );
}

/* ============================================================================
 * [B] 주간 보고서 전용 본문 (WeekBody)
 * - 출결/숙제/오답: 월~일 7일 요일별 주간 현황표 (Table)
 * - 진도/과제: 이번 주 수업 진도 및 과제 히스토리 표
 * - 성적: 주간 테스트 성적 비교표 & 막대 그래프
 * ============================================================================ */
function WeekBody({s}:{s:StudentData}){
 return (
  <div className={styles.periodBody}>
   {/* 1단: 월~일 주간 출결 · 숙제 · 오답 통합 점검표 */}
   <section className={styles.moduleCard}>
    <h3 className={styles.moduleHeader}>
     <Calendar size={14}/> 주간 요일별 출결 · 숙제 · 오답 현황표 (월~일)
     <span className={styles.headerStatRight}>
      주간 출석 {s.attended}일 · 숙제완료 {s.hwDone}회 · 오답수정 {s.fixedWrong}/{s.totalWrong}문항
     </span>
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
       <tr>
        <td className={styles.matrixRowLabel}>오답 수정</td>
        {s.weekDays.map(d=>(
         <td key={d.date} style={{textAlign:'center',fontSize:'11px',fontWeight:700}}>
          {d.totalWrong!==null?`${d.fixedWrong}/${d.totalWrong}문항`:<span className={styles.dashCell}>-</span>}
         </td>
        ))}
       </tr>
      </tbody>
     </table>
    </div>
   </section>

   {/* 2단: 주간 진도 및 과제 히스토리 표 (좌) + 주간 테스트 성적 비교 (우) */}
   <div className={styles.twoColGrid}>
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><BookOpen size={14}/> 이번 주 진도 및 과제 내역표</h3>
     <div className={styles.moduleContent}>
      <table className={styles.dataTable}>
       <thead>
        <tr>
         <th style={{width:'52px'}}>날짜</th>
         <th>교재 · 진도 범위</th>
         <th>부여된 과제</th>
        </tr>
       </thead>
       <tbody>
        {s.periodProgressLogs.length>0?s.periodProgressLogs.slice(0,5).map(log=>(
         <tr key={log.id}>
          <td style={{fontWeight:700}}>{shortDate(log.date)}</td>
          <td>
           <b className={styles.tableBookTitle}>{log.bookTitle} ({log.pct}%)</b>
           <span className={styles.tableSubScope}>{log.scope}</span>
          </td>
          <td>{log.homework||'-'}</td>
         </tr>
        )):s.bookProgressList.length>0?s.bookProgressList.slice(0,4).map(b=>(
         <tr key={b.id}>
          <td style={{fontWeight:700}}>{b.recordDate?shortDate(b.recordDate):'-'}</td>
          <td>
           <b className={styles.tableBookTitle}>{b.title} ({b.pct}%)</b>
           <span className={styles.tableSubScope}>{b.scope}</span>
          </td>
          <td>-</td>
         </tr>
        )):(
         <tr><td colSpan={3} className={styles.emptyCell}>이번 주 기록된 진도 내역이 없습니다.</td></tr>
        )}
       </tbody>
      </table>
     </div>
    </section>

    <section className={styles.moduleCard}>
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
          {s.exams.slice(0,4).map(ex=>(
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
   </div>
  </div>
 );
}

/* ============================================================================
 * [C] 월간 보고서 전용 본문 (MonthBody)
 * - 출결: 월간 출결 캘린더 (일~토 달력 그리드 + 출석/지각/결석 마크)
 * - 성적: 월간 시험 성적 추이 그래프 (막대+꺾은선 복합 차트)
 * - 진도: 교재별 월말 누적 달성률 블록 차트
 * - 숙제/오답: 월간 누적 과제 수행률 & 오답 해결 게이지
 * ============================================================================ */
function MonthBody({s}:{s:StudentData}){
 const chartExams=s.exams.slice(-6);
 return (
  <div className={styles.periodBody}>
   {/* 1단: 월간 출결 캘린더 (좌) + 월간 성적 변화 추이 그래프 (우) */}
   <div className={styles.twoColGrid}>
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}>
      <CalendarCheck2 size={14}/> {s.monthLabel} 출결 달력
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
         <div key={cell.date} className={`${styles.calDayCell} ${badgeClass}`}>
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

    <section className={styles.moduleCard}>
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
   </div>

   {/* 2단: 월간 교재별 누적 완주율 블록 (좌) + 월간 숙제·오답 종합 달성도 (우) */}
   <div className={styles.twoColGrid}>
    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><BookOpen size={14}/> 교재별 월말 누적 진도 달성률</h3>
     <div className={styles.moduleContent}>
      {s.bookProgressList.length>0?(
       <div className={styles.miriBlockBarList}>
        {s.bookProgressList.slice(0,4).map(b=>{
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
           <small>최근 진도 범위: {b.scope} ({b.donePages}/{b.totalPages})</small>
          </div>
         );
        })}
       </div>
      ):(
       <div className={styles.emptyBox}><p>등록된 교재 진도 내역이 없습니다.</p></div>
      )}
     </div>
    </section>

    <section className={styles.moduleCard}>
     <h3 className={styles.moduleHeader}><ClipboardCheck size={14}/> 월간 과제 성실도 및 오답 클리닉 총괄</h3>
     <div className={styles.moduleContent}>
      <div className={styles.monthGaugeGroup}>
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
      </div>
     </div>
    </section>
   </div>
  </div>
 );
}

/* ============================================================================
 * 통합 시트 렌더러 (하늘색 miricheck / 노란색 mirireport / 파스텔 mirigraph)
 * - 3가지 분위기 테마 각각의 헤더·프레임·하단 피드백 스타일을 유지하면서
 *   내부 본문은 일간(DayBody) / 주간(WeekBody) / 월간(MonthBody)으로 차별화!
 * ============================================================================ */
export default function ReportSheets({preview:p,template=presets[0]}:{preview:Preview;template?:Template}){
 const s=computeStudentData(p);
 const theme:Theme=(template.theme==='mirireport'||template.theme==='mirigraph')?template.theme:'miricheck';
 const period=template.period==='week'?'week':template.period==='month'?'month':'day';
 const periodKor=period==='week'?'주간':period==='month'?'월간':'일일';
 const periodEng=period==='week'?'Weekly Learning Report':period==='month'?'Monthly Learning Report':'Daily Learning Report';

 return (
  <article className={styles.sheet} data-sheet data-theme={theme} data-period={period}>
   <div className={styles.sheetInner}>
    {/* 분위기별 맞춤 상단 헤더 */}
    {theme==='miricheck'&& (
     <>
      <header className={styles.miriCheckHeader}>
       <div>
        <span className={styles.miriCheckEngTitle}>{periodEng}</span>
        <h2>유니데스크 학원 {periodKor} 학습 점검 리포트</h2>
       </div>
       <div className={styles.miriHeaderIconWrap} aria-hidden="true">
        <Sparkles size={18} className={styles.miriSparkleIcon}/>
        <div className={styles.miriHeaderBadgeIcon}>
         <PenLine size={24} strokeWidth={2.2}/>
        </div>
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
      <h2>{p.name} 학생의 {periodKor} 학습 성취도 종합 리포트</h2>
      <p>UNIDESK {periodEng.toUpperCase()} · 출결 · 숙제 · 오답 · 진도 · 시험 통합 분석</p>
      <div className={styles.miriYellowStudentPill}>
       <GraduationCap size={14}/> {p.grade} · {p.group} · <b>{p.name}</b> &nbsp;|&nbsp; <Clock size={13}/> {period==='day'?'기준일':'조회 기간'}: {s.dateLabel}
      </div>
     </header>
    )}

    {theme==='mirigraph'&&(
     <header className={styles.miriGraphHeader}>
      <div>
       <span className={styles.miriGraphEyebrow}>UNIDESK · {periodEng.toUpperCase()}</span>
       <h2>{periodKor} 학습 성취도 리포트</h2>
      </div>
      <div className={styles.miriGraphMetaLines}>
       <div><span>{period==='day'?'날 짜':'기 간'} :</span> <b>{s.dateLabel}</b></div>
       <div><span>학 생 :</span> <b>{p.name} ({p.grade} · {p.group})</b></div>
      </div>
     </header>
    )}

    {/* 일간 / 주간 / 월간 차별화 본문 */}
    {period==='day'?<DayBody s={s}/>:period==='week'?<WeekBody s={s}/>:<MonthBody s={s}/>}

    {/* 분위기별 맞춤 하단 선생님 피드백 박스 */}
    {theme==='miricheck'?(
     <section className={styles.miriFeedbackBox}>
      <div className={styles.miriFeedbackLabel}>
       <MessageSquareText size={16}/>
       <span>선생님 확인<br/>피드백</span>
      </div>
      <div className={styles.miriFeedbackBody}>
       <span className={styles.miriFeedbackSub}>{periodKor} 수업 · 시험 · 오답 코멘트</span>
       <div className={styles.miriRuledLines}>
        {Array.from({length:3}).map((_,i)=>{
         const c=s.comments[i];
         return (
          <p key={i}>
           {c?(
            <><b>[{shortDate(c.date)} · {c.tag}]</b> {c.text}</>
           ):i===0&&s.comments.length===0?(
            <span className={styles.miriMutedLine}>해당 기간에 등록된 선생님 코멘트(진도·오답·시험 메모)가 없습니다.</span>
           ):'\u00A0'}
          </p>
         );
        })}
       </div>
      </div>
     </section>
    ):theme==='mirireport'?(
     <section className={styles.miriYellowTakeaway}>
      <h3 className={styles.miriYellowSecTitle}>| 선생님 {periodKor} 피드백 및 지도 코멘트</h3>
      <div className={styles.miriTakeawayList}>
       {s.comments.length>0?s.comments.slice(0,3).map(c=>(
        <p key={c.id}><CheckCircle2 size={14} className={styles.miriCheckIconGreen}/> <b>[{shortDate(c.date)} · {c.tag}]</b> {c.text}</p>
       )):(
        <p className={styles.miriMutedLine}><AlertCircle size={13}/> 해당 기간에 등록된 선생님 코멘트가 없습니다.</p>
       )}
      </div>
      <div className={styles.miriConclusionPill}>
       <Lightbulb size={15} className={styles.miriBulbIcon}/>
       <span>
        <b>다음 수업 과제 |</b> &nbsp;
        {s.homeworkTasks.length>0
         ?s.homeworkTasks.map(t=>`[${t.bookTitle}] ${t.homework}${t.dueDate?` (~${shortDate(t.dueDate)})`:''}`).join(' · ')
         :'해당 기간에 부여된 다음 수업 숙제 기록이 없습니다.'}
       </span>
      </div>
     </section>
    ):(
     <section className={styles.miriGraphCard}>
      <div className={styles.miriGraphCardHead}>{periodKor} 선생님 종합 피드백 및 코멘트</div>
      <div className={styles.miriGraphCommentBody}>
       {s.comments.length>0?s.comments.slice(0,3).map(c=>(
        <p key={c.id}><MessageSquareText size={13} className={styles.miriCommentIcon}/> <b>[{shortDate(c.date)} · {c.tag}]</b> {c.text}</p>
       )):(
        <p className={styles.miriMutedLine}><AlertCircle size={13}/> 해당 기간에 등록된 선생님 코멘트가 없습니다.</p>
       )}
      </div>
     </section>
    )}
   </div>
  </article>
 );
}
