import type {CSSProperties,ReactNode} from 'react';
import dayjs from 'dayjs';
import Image from 'next/image';
import type {ProgressBook,ProgressEntry} from '../../../types/progress';
import type {StudentDailyRecord} from '../../../types/student-daily';
import type {WrongAnswerRecord} from '../../../types/wrong-answer';
import {kinds,presets,themeArtwork,themeColors,type Template,type Block} from './templates';
import styles from './builder.module.css';
export type Preview={id:string;name:string;grade:string;group:string;start:string;end:string;daily:StudentDailyRecord[];wrong:WrongAnswerRecord[];books:ProgressBook[];entries:ProgressEntry[]};
function Illustration({name,className}:{name:string;className:string}){
 return <Image src={`/report-art/${name}.webp`} alt="" aria-hidden="true" width={name==='study-desk'?720:name==='well-done'?240:360} height={name==='well-done'?360:name==='growing-books'?300:name==='study-desk'?480:240} className={className} unoptimized loading="eager"/>;
}
const date=(v:string)=>dayjs(v).format('M/D');
function Table({rows}:{rows:string[][]}){return <table><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>;}
function Bars({rows}:{rows:{label:string;value:number;max:number}[]}){return <div className={styles.bars}>{rows.map((r,i)=><div key={i}><span>{r.label}</span><div><i style={{width:`${Math.max(0,Math.min(100,r.max?r.value/r.max*100:0))}%`}}/></div><b>{r.value}{r.max?` / ${r.max}`:''}</b></div>)}</div>;}
function Content({block:b,p}:{block:Block;p:Preview}){
 const daily=p.daily.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const wrong=p.wrong.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const entries=p.entries.filter(r=>r.record_date>=p.start&&r.record_date<=p.end);
 const single=p.start===p.end;
 let body:ReactNode;
 if(b.kind==='attendance'){
  const rows=['출석','지각','결석','조퇴'].map(label=>({label,value:daily.filter(r=>r.attendance===label).length,max:daily.filter(r=>r.attendance).length}));
  body=!rows[0].max?<p>출결 미기록</p>:b.view==='table'?<Table rows={daily.map(r=>[date(r.record_date),r.attendance||'미기록',r.reason])}/>:b.view==='chart'?<Bars rows={rows}/>:<div className={styles.metrics}>{single?<strong>{daily[0]?.attendance||'미기록'}</strong>:rows.map(r=><div key={r.label}><span>{r.label}</span><strong>{r.value}<small>일</small></strong></div>)}</div>;
 }else if(b.kind==='grades'){
  const exams=daily.flatMap(r=>r.exams.filter(e=>Number.isFinite(e.score)&&Number.isFinite(e.max_score)&&e.max_score>0&&e.score>=0&&e.score<=e.max_score).map(e=>({...e,date:r.record_date,rate:Math.round(e.score/e.max_score*100)})));
  body=!exams.length?<p>저장된 시험 성적이 없습니다.</p>:b.view==='table'?<Table rows={exams.map(e=>[date(e.date),e.name,`${e.score} / ${e.max_score}`,`${e.rate}점`])}/>:b.view==='card'?<div className={styles.metrics}>{exams.map((e,i)=><div key={i}><span>{date(e.date)} · {e.name}</span><strong>{e.rate}<small>점</small></strong><small>{e.score} / {e.max_score}</small></div>)}</div>:<><svg viewBox="0 0 320 145" role="img" aria-label="시험별 100점 환산 성적 추이">{[0,50,100].map(v=><g key={v}><line x1="26" x2="305" y1={115-v*.9} y2={115-v*.9} stroke="#e2e8f0"/><text x="0" y={119-v*.9}>{v}</text></g>)}<polyline points={exams.map((e,i)=>`${exams.length===1?165:35+i/(exams.length-1)*260},${115-e.rate*.9}`).join(' ')} fill="none" stroke="var(--accent,#2864a9)" strokeWidth="3"/>{exams.map((e,i)=>{const x=exams.length===1?165:35+i/(exams.length-1)*260;return <g key={i}><circle cx={x} cy={115-e.rate*.9} r="4" fill="var(--accent,#2864a9)"/><text x={x} y={105-e.rate*.9} textAnchor="middle">{e.rate}</text><text x={x} y="137" textAnchor="middle">{date(e.date)}</text></g>;})}</svg><small>시험별 100점 환산 · 범위와 난도가 다를 수 있습니다.</small></>;
  if(b.emphasis&&b.view==='chart'&&exams.length){const latest=exams[exams.length-1];body=<div className={styles.featuredContent}><div className={styles.featuredScore}><span>최근 시험 · 100점 환산</span><strong>{latest.rate}<small>점</small></strong><span>{latest.name}</span><small>{latest.score} / {latest.max_score}</small></div><div>{body}</div></div>;}
 }else if(b.kind==='wrong'){
  const total=wrong.reduce((n,r)=>n+r.total_wrong,0),done=wrong.reduce((n,r)=>n+r.corrected_count,0);
  body=!wrong.length?<p>오답 미기록</p>:b.view==='table'?<Table rows={wrong.map(r=>[date(r.record_date),`전체 ${r.total_wrong}`,`수정 ${r.corrected_count}`,`남음 ${Math.max(0,r.total_wrong-r.corrected_count)}`])}/>:b.view==='chart'?<><Bars rows={wrong.map(r=>({label:date(r.record_date),value:r.corrected_count,max:r.total_wrong}))}/><small>수정 문제 / 전체 오답 · 수량 기록 기준</small></>:<div className={styles.metrics}><div><span>수정 / 전체 오답</span><strong>{done} / {total}</strong><small>남은 {Math.max(0,total-done)}문제{total===0?' · 수량 없음':''}</small></div></div>;
 }else if(b.kind==='homework'){
  const labels={O:'완료','△':'일부 완료',X:'미완료'};
  const recorded=wrong.filter(r=>r.homework_status);
  const tasks=entries.filter(e=>e.homework.trim());
  body=<>{b.view==='table'?<Table rows={wrong.map(r=>[date(r.record_date),r.homework_status?labels[r.homework_status]:'미기록'])}/>:b.view==='chart'?<Bars rows={(Object.keys(labels) as (keyof typeof labels)[]).map(s=>({label:labels[s],value:recorded.filter(r=>r.homework_status===s).length,max:recorded.length}))}/>:<div className={styles.metrics}>{single?<strong>{recorded[0]?.homework_status?labels[recorded[0].homework_status]:'미기록'}</strong>:<><div><span>완료 / 검사 기록</span><strong>{recorded.filter(r=>r.homework_status==='O').length} / {recorded.length}</strong></div><small>일부 완료 {recorded.filter(r=>r.homework_status==='△').length}일 · 미완료 {recorded.filter(r=>r.homework_status==='X').length}일</small></>}</div>}{tasks.length>0&&<div className={styles.tasks}><b>다음 수업까지 할 일</b>{tasks.map(e=><p key={e.id}>{p.books.find(book=>book.id===e.book_id)?.title} · {e.homework}{e.due_date&&<small> 제출 {date(e.due_date)}</small>}</p>)}</div>}</>;
 }else if(b.kind==='progress'){
  const latest=[...new Map(entries.map(e=>[e.book_id,e])).values()];
  body=latest.length?latest.map(e=>{const book=p.books.find(book=>book.id===e.book_id),units=e.units_snapshot??book?.units??[],total=e.total_pages_snapshot||units.length,done=e.total_pages_snapshot?e.completed_page:units.filter(u=>e.states[u.id]==='완료').length;return <div className={styles.task} key={e.id}><b>{book?.title||'교재 기록'}</b><p>{e.scope||'학습 범위 미기록'}</p>{b.view==='table'?<Table rows={[[date(e.record_date),'누적 진도',total&&done!=null?`${done} / ${total}`:'미기록']]}/>:b.view==='chart'?<Bars rows={[{label:'누적 진도',value:done??0,max:total}]}/>:<small>{total&&done!=null?`누적 진도 ${Math.min(100,Math.round(done/total*100))}% (${done}/${total})`:'진도율 미기록'}</small>}</div>;}):<p>이 기간에 저장된 교재 진도 기록이 없습니다.</p>;
 }else{
  const memos=entries.filter(e=>e.memo.trim());
  body=memos.length?memos.map(e=><div key={e.id} className={b.view==='chart'?styles.note:styles.task}><small>{date(e.record_date)} · {p.books.find(book=>book.id===e.book_id)?.title}</small><p>{e.memo}</p></div>):<p>등록된 피드백이 없습니다.</p>;
 }
 return <>{body}{b.kind==='wrong'&&b.view!=='card'&&wrong.length>0&&<small>남은 {wrong.reduce((n,r)=>n+Math.max(0,r.total_wrong-r.corrected_count),0)}문제</small>}</>;
}
// Keep each printed page small; long record lists continue in separate cards.
function fragments(block:Block,p:Preview,theme?:Template['theme']):{block:Block;p:Preview;continued:boolean}[]{
 const entries=p.entries.filter(e=>e.record_date>=p.start&&e.record_date<=p.end);
 const chunks=(text:string)=>text.match(/[\s\S]{1,260}/g)||[''];
 let records=entries;
 if(block.kind==='feedback')records=entries.filter(e=>e.memo.trim()).flatMap(e=>chunks(e.memo).map((memo,i)=>({...e,id:e.id+'-'+i,memo})));
 if(block.kind==='homework')records=entries.filter(e=>e.homework.trim()).flatMap(e=>chunks(e.homework).map((homework,i)=>({...e,id:e.id+'-'+i,homework})));
 if(block.kind==='progress')records=(theme==='timeline'?entries:[...new Map(entries.map(e=>[e.book_id,e])).values()]).flatMap(e=>chunks(e.scope).map((scope,i)=>({...e,id:e.id+'-'+i,scope})));
 let daily=block.kind==='grades'?p.daily.flatMap(r=>r.exams.map(e=>({...r,exams:[e]}))):p.daily.flatMap(r=>chunks(r.reason).map(reason=>({...r,reason})));
 if(theme==='summary'&&block.kind==='grades'&&block.view==='card')daily=daily.slice(-1);
 const limit=block.kind==='feedback'||block.kind==='progress'||block.kind==='homework'?1:block.kind==='grades'&&block.view==='card'?2:5;
 const count=block.kind==='grades'?daily.length:block.kind==='attendance'?(block.view==='card'||block.view==='chart'?1:daily.length):block.kind==='homework'?Math.max(records.length,block.view==='table'?Math.ceil(p.wrong.length/5):1):block.kind==='progress'||block.kind==='feedback'?records.length:block.view==='card'?1:p.wrong.length;
 const result=[];
 for(let i=0;i<Math.max(1,count);i+=limit)result.push({block,p:{...p,
 daily:block.kind==='grades'||block.kind==='attendance'&&block.view==='table'?daily.slice(i,i+limit):p.daily,
 wrong:block.kind==='homework'&&block.view==='table'?p.wrong.slice(i*5,(i+1)*5):block.kind==='wrong'&&block.view!=='card'?p.wrong.slice(i,i+limit):p.wrong,
 entries:records.slice(i,i+limit)},continued:i>0});
 return result;
}
export default function ReportSheets({preview:p,template=presets[0]}:{preview:Preview;template?:Template}){
 const theme=template.theme??'clean';
 const notebook=theme==='notebook',illustrated=theme!=='clean'&&template.illustrations!==false;
 const titles={summary:'오늘의 학습, 한눈에',timeline:'배움의 발자취',briefing:'성적 브리핑',planner:'이번 주 학습 플랜',letter:p.name+' 학생에게'};
 const items=template.blocks.flatMap(b=>fragments(b,p,theme));
 const pages:typeof items[]=[];let page:typeof items=[],used=0;
 const columns=theme==='planner'?2:template.orientation==='landscape'?3:2;
 const capacity=(notebook||theme==='summary')&&template.orientation==='portrait'?8:6;
 for(const item of items){const size=item.block.wide?columns:1;const occupied=item.block.wide?Math.ceil(used/columns)*columns:used;if(occupied+size>capacity){pages.push(page);page=[];used=0;}else used=occupied;page.push(item);used+=size;}if(page.length)pages.push(page);
 return <>{pages.map((items,index)=><article key={index} className={`${styles.sheet} ${notebook?styles.notebook:''}`} data-sheet data-theme={template.theme??'clean'} style={{'--accent':themeColors[theme]} as CSSProperties}>
 <header className={styles.header}><div><span>COSMATH · LEARNING REPORT</span><b>{p.start===p.end?dayjs(p.end).format('YYYY.MM.DD'):`${p.start} — ${p.end}`}</b></div><h2>{notebook?<>차곡차곡 쌓이는<br/>나의 배움 노트</>:theme==='clean'?'한눈에 보는 학습 관리 리포트':titles[theme as keyof typeof titles]}</h2><p>{p.name} <span>{p.grade} · {p.group}</span></p>{notebook&&<small className={styles.headerCaption}>오늘의 기록이 내일의 성장을 만듭니다.</small>}{illustrated&&themeArtwork[theme]&&<Illustration name={themeArtwork[theme]!} className={notebook?styles.heroArt:styles.themeHeroArt}/>}</header>
 <div className={styles.grid}>{items.map((item,i)=><section key={`${item.block.id}-${i}`} data-kind={item.block.kind} data-emphasis={item.block.emphasis||undefined} className={`${styles.card} ${item.block.wide?styles.wide:''}`}><h3>{kinds[item.block.kind]}{item.continued?' · 계속':''}{theme!=='clean'&&<span className={styles.sectionNumber}>{String(i+1).padStart(2,'0')}</span>}</h3>{illustrated&&notebook&&item.block.kind==='progress'&&<Illustration name="growing-books" className={styles.growthArt}/>}{theme==='timeline'&&<small className={styles.timelineDate}>{item.p.entries[0]?.record_date??item.p.daily[0]?.record_date??item.p.wrong[0]?.record_date??p.end}</small>}<Content block={item.block} p={item.p}/>{illustrated&&notebook&&item.block.kind==='feedback'&&<Illustration name="pencil-note" className={styles.memoArt}/>}</section>)}</div>
 <footer className={styles.footer}>{illustrated&&notebook&&<Illustration name="well-done" className={styles.footerArt}/>}<span>매일의 배움이 쌓이는 곳 · {template.name}</span><span>{index+1} / {pages.length}</span></footer>
 </article>)}</>;
}
