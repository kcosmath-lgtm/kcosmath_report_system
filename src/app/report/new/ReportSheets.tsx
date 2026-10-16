import dayjs from 'dayjs';
import type {ProgressBook,ProgressEntry} from '../../../types/progress';
import type {StudentDailyRecord} from '../../../types/student-daily';
import type {WrongAnswerRecord} from '../../../types/wrong-answer';
import styles from './daily-report.module.css';
export type Preview={id:string;name:string;grade:string;group:string;start:string;end:string;daily:StudentDailyRecord[];wrong:WrongAnswerRecord[];books:ProgressBook[];entries:ProgressEntry[]};
const shortDate=(date:string)=>dayjs(date).format('M/D');
export default function ReportSheets({preview:p}:{preview:Preview}){
 const daily=p.daily.find(r=>r.record_date===p.end);
 const wrong=p.wrong.find(r=>r.record_date===p.end);
 const recent=p.wrong.filter(r=>r.record_date<=p.end).sort((a,b)=>a.record_date.localeCompare(b.record_date)).slice(-5);
 const exams=p.daily.filter(r=>r.record_date<=p.end).sort((a,b)=>a.record_date.localeCompare(b.record_date)).flatMap(r=>r.exams.filter(e=>Number.isFinite(e.score)&&Number.isFinite(e.max_score)&&e.max_score>0&&e.score>=0&&e.score<=e.max_score).map(e=>({...e,date:r.record_date,rate:Math.round(e.score/e.max_score*100)}))).slice(-5);
 const lessons=p.entries.filter(e=>e.record_date===p.end).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 const homework=lessons.filter(e=>e.homework.trim());
 const latestLessons=[...new Map(lessons.map(e=>[e.book_id,e])).values()];
 const memo=latestLessons.map(e=>e.memo.trim()).filter(Boolean).join('\n');
 const remaining=wrong?Math.max(0,wrong.total_wrong-wrong.corrected_count):0;
 const homeworkStatus=wrong?.homework_status?{O:'완료','△':'일부 완료',X:'미완료'}[wrong.homework_status]:'미기록';
 const maxWrong=Math.max(1,...recent.map(r=>r.total_wrong));
 return <article className={styles.sheet} data-sheet>
  <header className={styles.header}><div><span>COSMATH / DAILY LEARNING</span><b>{dayjs(p.end).format('YYYY.MM.DD')}</b></div><h2>오늘의 배움, 내일의 성장</h2><p>{p.name} <span>{p.grade} · {p.group}</span></p></header>
  <section className={styles.metrics} aria-label="오늘의 학습 결과">
   <div><span>오늘 출석</span><strong>{daily?.attendance||'미기록'}</strong><small>{daily?.reason||'수업일 기준 출결'}</small></div>
   <div><span>오늘 검사한 숙제</span><strong>{homeworkStatus}</strong><small>숙제 이행 상태</small></div>
   <div><span>오늘 오답 수정</span><strong>{wrong?.total_wrong?`${wrong.corrected_count} / ${wrong.total_wrong}`:wrong?.completed?'완료':wrong?'수량 없음':'미기록'}</strong><small>{wrong?.total_wrong?`수정 완료 · 남은 ${remaining}문제`:wrong?.completed?'완료 표시 · 수량 미입력':'오답 수량 미입력'}</small></div>
  </section>
  <section className={styles.lessons}><h3>오늘 배운 내용</h3>{lessons.length?<><div className={styles.lessonList}>{lessons.slice(0,3).map(e=><div key={e.id}><b>{p.books.find(b=>b.id===e.book_id)?.title||'교재 기록'}</b><p>{e.scope||'학습 범위 미기록'}</p><small>{e.completed_page!=null?`누적 ${e.completed_page}쪽 완료`:e.unit_ids.length?`${e.unit_ids.length}개 단원 학습`:''}</small></div>)}</div>{lessons.length>3&&<small>외 {lessons.length-3}건의 수업 기록</small>}</>:<p className={styles.empty}>오늘 저장된 교재 진도 기록이 없습니다.</p>}</section>
  <div className={styles.trends}>
   <section><h3>최근 시험 성적</h3><p className={styles.caption}>최근 5회 · 100점 환산</p>{exams.length?<><svg className={styles.lineChart} viewBox="0 0 300 145" role="img" aria-label="최근 시험 5회 성적 추이">{[0,50,100].map(v=><g key={v}><line x1="25" x2="282" y1={115-v*.9} y2={115-v*.9} stroke="#e2e8f0"/><text x="0" y={119-v*.9}>{v}</text></g>)}<polyline points={exams.map((e,i)=>`${exams.length===1?150:40+i/(exams.length-1)*225},${115-e.rate*.9}`).join(' ')} fill="none" stroke="#2864a9" strokeWidth="2.5"/>{exams.map((e,i)=>{const x=exams.length===1?150:40+i/(exams.length-1)*225;return <g key={`${e.date}-${e.id}`}><title>{e.date} {e.name}: {e.score}/{e.max_score}</title><circle cx={x} cy={115-e.rate*.9} r="4" fill="#2864a9"/><text x={x} y={105-e.rate*.9} textAnchor="middle">{e.rate}</text><text x={x} y="136" textAnchor="middle">{shortDate(e.date)}</text></g>;})}</svg><div className={styles.examList}>{exams.map(e=><div key={`${e.date}-${e.id}`}><span>{shortDate(e.date)} · {e.name}</span><b>{e.score} / {e.max_score}</b></div>)}</div></>:<p className={styles.empty}>저장된 시험 성적이 없습니다.</p>}<small className={styles.caption}>시험 범위와 난도가 달라 단순 비교에 주의해 주세요.</small></section>
   <section><h3>날마다 쌓은 오답 정리</h3><p className={styles.caption}>최근 기록 5일 · 진한색: 수정 / 연한색: 남음</p>{recent.length?<div className={styles.bars}>{recent.map(r=><div key={r.id} data-today={r.record_date===p.end} title={`${r.record_date}: 오답 ${r.total_wrong}, 수정 ${r.corrected_count}`}><b>{r.total_wrong}</b><div className={styles.bar} style={{height:Math.max(3,r.total_wrong/maxWrong*110)}}><i style={{height:`${r.total_wrong?r.corrected_count/r.total_wrong*100:0}%`}}/></div><small>{shortDate(r.record_date)}</small><span>{r.corrected_count}개 수정</span></div>)}</div>:<p className={styles.empty}>저장된 오답 기록이 없습니다.</p>}<small className={styles.caption}>보고 날짜까지 기록된 날짜 기준입니다.</small></section>
  </div>
  <section className={styles.feedback}><h3>오늘의 피드백</h3><p>{memo||'등록된 피드백이 없습니다.'}</p></section>
  <section className={styles.homework}><h3>다음 수업까지 할 일</h3>{homework.length?<>{homework.slice(0,2).map(e=><p key={e.id}><b>{p.books.find(b=>b.id===e.book_id)?.title||'숙제'}</b> · {e.homework}{e.due_date&&<small>제출 {shortDate(e.due_date)}</small>}</p>)}{homework.length>2&&<small>외 {homework.length-2}건의 숙제 · 상세 내용은 진도 기록에서 확인해 주세요.</small>}</>:<p>오늘 새로 등록된 숙제가 없습니다.</p>}</section>
  <footer className={styles.footer}><span>매일의 배움이 쌓이는 곳 · 일일 학습 보고서</span><b>COSMATH.</b></footer>
 </article>;
}
