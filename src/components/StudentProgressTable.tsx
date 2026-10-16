'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadClassBooks, loadProgress, manageClassBook, saveProgressBatch } from '../lib/report-storage';
import { progressPercent, type ClassBook, type ProgressBook, type ProgressEntry } from '../types/progress';
import type { StudentGroup } from '../types/student';
import ProgressDialog from './ProgressDialog';
import ProgressUnitEditor from './ProgressUnitEditor';
import ClassBookManager from './ClassBookManager';
import styles from './student-progress.module.css';

type Saved = { book: ProgressBook; entry: ProgressEntry };
type RowHandle = { dirty: boolean; ready: boolean; book?: ProgressBook; scope: string; homework: string; feedback: string; entries: ProgressEntry[]; patch: (value: {book?:ProgressBook;scope?:string;homework?:string;feedback?:string})=>void; accept: (saved:Saved)=>void };
type Student=StudentGroup['students'][number];
function ProgressRow({student,date,revision,catalog,onDirty,register,saving,onUnits,onHistory}:{student:Student;date:string;revision:number;catalog:ClassBook[];onDirty:(id:string,value:boolean)=>void;register:(id:string,value:RowHandle|null)=>void;saving:boolean;onUnits:(id:string)=>void;onHistory:(id:string)=>void}) {
  const [books,setBooks]=useState<ProgressBook[]>([]),[entries,setEntries]=useState<ProgressEntry[]>([]);
  const [bookId,setBookId]=useState(''),[draft,setDraft]=useState<ProgressBook|null>(null);
  const [scope,setScope]=useState(''),[homework,setHomework]=useState(''),[feedbackDraft,setFeedback]=useState<string|null>(null);
  const [dirty,setDirty]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[message,setMessage]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{onDirty(student.id,dirty||busy);},[onDirty,student.id,dirty,busy]);
  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{if(!cancelled){setLoading(true);setFailed(false);}});
    loadProgress(student.id).then(data=>{if(cancelled)return;setBooks(data.books);setEntries(data.entries);setBookId(id=>data.books.some(b=>b.id===id)?id:data.books[0]?.id??'');setDraft(null);}).catch(e=>{if(!cancelled){setFailed(true);setMessage(e.message);}}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[student.id,revision,reload]);
  const feedback=feedbackDraft??[...entries].filter(e=>e.book_id===bookId&&e.record_date===date).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]?.memo??'';
  const book=draft??books.find(b=>b.id===bookId),locked=saving||busy||loading||failed;
  useEffect(()=>{
    register(student.id,{dirty,ready:!locked,book,scope,homework,feedback,entries,patch:value=>{
      if(value.book){setBooks(current=>current.some(b=>b.id===value.book!.id)?current:[...current,value.book!]);setBookId(value.book.id);setDraft(value.book);}
      if(value.scope!==undefined)setScope(value.scope);if(value.homework!==undefined)setHomework(value.homework);if(value.feedback!==undefined)setFeedback(value.feedback);setDirty(true);
    },accept:saved=>{setBooks(current=>current.map(b=>b.id===saved.book.id?saved.book:b));setDraft(null);setEntries(current=>[saved.entry,...current]);setDirty(false);setScope('');setHomework('');setFeedback(null);setMessage('');}});
    return()=>register(student.id,null);
  },[register,student.id,dirty,locked,book,scope,homework,feedback,entries]);
  async function choose(value:string){
    if(value.startsWith('assigned:')){setBookId(value.slice(9));setDraft(null);return;}
    const template=catalog.find(b=>b.id===value);if(!template)return;
    setBusy(true);setMessage('');try{const assigned=await manageClassBook('assign',template,[student.id]) as ProgressBook[];const b=assigned[0];setBooks(current=>current.some(x=>x.id===b.id)?current:[...current,b]);setBookId(b.id);setDraft(null);}catch(e){setMessage(e instanceof Error?e.message:'교재 연결 실패');}finally{setBusy(false);}
  }
  return <tr><td><strong>{student.name}</strong><small>{student.grade}</small></td>
    <td><select aria-label={`${student.name} 교재`} value={bookId?`assigned:${bookId}`:''} disabled={locked||dirty} onChange={e=>void choose(e.target.value)}><option value="">교재 선택</option>{books.map(b=><option key={b.id} value={`assigned:${b.id}`}>{b.title}</option>)}<optgroup label="반 교재 연결">{catalog.filter(c=>!books.some(b=>b.library_id===c.id)).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</optgroup></select></td>
    <td>{book?<><strong>{progressPercent(book)}%</strong><progress max={100} value={progressPercent(book)} aria-label={`${student.name} 진행률`}/><small>{book.total_pages?`${book.completed_page??0} / ${book.total_pages}페이지`:'단원 완료 기준'}</small></>:'—'}</td>
    <td><p>{book?.units.filter(u=>book.states[u.id]==='진행 중').map(u=>u.group?`${u.group} / ${u.name}`:u.name).join(', ')||'진행 중인 단원 없음'}</p>{scope&&<small>작성 중: {scope}</small>}</td>
    <td><p>{entries.filter(e=>e.book_id===bookId&&e.homework).sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.created_at.localeCompare(a.created_at))[0]?.homework||'지난 숙제 없음'}</p>{homework&&<small>작성 중: {homework}</small>}</td>
    <td><div className={styles.rowActions}><button disabled={locked||!book} onClick={()=>onUnits(student.id)}>단원 관리</button><button disabled={locked||!book} onClick={()=>onHistory(student.id)}>기록 보기</button>{dirty&&<button disabled={locked} onClick={()=>{setDraft(null);setScope('');setHomework('');setFeedback(null);setDirty(false);}}>취소</button>}{failed&&<button onClick={()=>setReload(v=>v+1)}>다시 불러오기</button>}</div>{message&&<p role="alert">{message}</p>}</td>
  </tr>;
}

export default function StudentProgressTable({groups,studentIds,rosterRevision,onDirtyChange}:{groups:StudentGroup[];studentIds:string[];rosterRevision:number;onDirtyChange:(value:boolean)=>void}){
  const [dirtyRows,setDirtyRows]=useState<Record<string,boolean>>({});
  const [date,setDate]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()));
  const [saving,setSaving]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
  const [catalog,setCatalog]=useState<ClassBook[]>([]),[catalogFailed,setCatalogFailed]=useState(false);
  const [manager,setManager]=useState(false),[managerDirty,setManagerDirty]=useState(false);
  const [bulkOpen,setBulkOpen]=useState(false);
  const [unitPopup,setUnitPopup]=useState<{book:ProgressBook;ids:string[]}|null>(null),[history,setHistory]=useState<{book:ProgressBook;entries:ProgressEntry[]}|null>(null);
  const [bulkBook,setBulkBook]=useState(''),[bulkScope,setBulkScope]=useState(''),[bulkHomework,setBulkHomework]=useState(''),[bulkPage,setBulkPage]=useState(''),[bulkFeedback,setBulkFeedback]=useState('');
  const handles=useRef<Record<string,RowHandle>>({});
  const register=useCallback((id:string,value:RowHandle|null)=>{if(value)handles.current[id]=value;else delete handles.current[id];},[]);
  const onDirty=useCallback((id:string,value:boolean)=>setDirtyRows(current=>current[id]===value?current:{...current,[id]:value}),[]);
  const changed=useCallback(()=>setRevision(v=>v+1),[]);
  const hasDirty=Object.values(dirtyRows).some(Boolean)||managerDirty||saving;
  useEffect(()=>{onDirtyChange(hasDirty);},[hasDirty,onDirtyChange]);
  useEffect(()=>{if(!hasDirty)return;const guard=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[hasDirty]);
  useEffect(()=>{
    let cancelled=false;
    Promise.all(groups.map(g=>loadClassBooks(g.id))).then(data=>{if(!cancelled){setCatalog(data.flat());setCatalogFailed(false);}}).catch(e=>{if(!cancelled){setCatalogFailed(true);setMessage(e.message);}});
    return()=>{cancelled=true;};
  },[groups,revision]);
  const students=groups.flatMap(g=>g.students).filter(s=>studentIds.includes(s.id)||dirtyRows[s.id]);
  function targets(ids=studentIds){const rows=ids.map(id=>handles.current[id]);if(!rows.length||rows.some(r=>!r?.ready)){setMessage('선택한 학생의 교재와 기록을 먼저 불러와 주세요.');return null;}return rows;}
  function editUnits(ids:string[]){const rows=targets(ids);if(!rows)return;const book=rows[0].book;if(!book||rows.some(r=>!r.book||JSON.stringify(r.book.units)!==JSON.stringify(book.units)||r.book.total_pages!==book.total_pages)){setMessage('일괄 단원 관리는 동일한 교재를 연결한 학생들에게 적용할 수 있습니다.');return;}setUnitPopup({book,ids:[...ids]});}
  async function assign(){const template=catalog.find(b=>b.id===bulkBook),rows=targets();if(!template||!rows)return;if(rows.some(r=>r.dirty)){setMessage('입력한 기록을 먼저 저장하거나 취소한 뒤 교재를 변경해 주세요.');return;}setSaving(true);setMessage('');try{const books=await manageClassBook('assign',template,studentIds) as ProgressBook[];books.forEach(b=>handles.current[b.student_id]?.patch({book:b}));setMessage(`${books.length}명에게 교재를 연결했습니다. 수업 기록 저장으로 진행 내용을 저장하세요.`);}catch(e){setMessage(e instanceof Error?e.message:'교재 연결 실패');}finally{setSaving(false);}}
  function apply(field:'scope'|'homework'|'feedback'|'page'){const rows=targets();if(!rows)return;if(rows.some(r=>!r.book)){setMessage('선택한 학생 모두에게 교재를 먼저 연결해 주세요.');return;}if(field==='page'&&(!bulkPage||rows.some(r=>!r.book?.total_pages||Number(bulkPage)>r.book.total_pages)||!Number.isInteger(Number(bulkPage))||Number(bulkPage)<0)){setMessage('선택한 교재의 총 페이지 범위 안에서 완료 페이지를 입력해 주세요.');return;}rows.forEach(r=>r.patch(field==='scope'?{scope:bulkScope}:field==='homework'?{homework:bulkHomework}:field==='feedback'?{feedback:bulkFeedback}:{book:{...r.book!,completed_page:Number(bulkPage)}}));setMessage(`${rows.length}명에게 적용했습니다. 수업 기록 저장을 눌러 저장하세요.`);}
  async function saveAll(){if(saving||manager||unitPopup||!date)return;const rows=Object.values(handles.current).filter(r=>r.dirty);if(!rows.length){setMessage('입력한 수업 기록이 없습니다.');return;}if(rows.some(r=>!r.book||!r.ready)){setMessage('교재와 기록을 모두 불러온 뒤 저장해 주세요.');return;}setSaving(true);setMessage('');try{const result=await saveProgressBatch(rows.map(r=>({book:r.book!,entry:{id:crypto.randomUUID(),book_id:r.book!.id,record_date:date,unit_ids:r.book!.units.filter(u=>r.book!.states[u.id]==='진행 중').map(u=>u.id),scope:r.scope,homework:r.homework,due_date:null,memo:r.feedback,states:r.book!.states,created_at:''}})));result.forEach(saved=>rows.find(r=>r.book?.id===saved.book.id)?.accept(saved));setMessage(`${result.length}명의 수업 기록을 저장했습니다.`);}catch(e){setMessage(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setSaving(false);}}
  const unitEditor=unitPopup?(<ProgressUnitEditor book={unitPopup.book} count={unitPopup.ids.length} scope={handles.current[unitPopup.ids[0]]?.scope} homework={handles.current[unitPopup.ids[0]]?.homework} feedback={handles.current[unitPopup.ids[0]]?.feedback} onFeedback={feedback=>unitPopup.ids.forEach(id=>handles.current[id]?.patch({feedback}))} onDetails={unitPopup.ids.length===1?(scope,homework)=>{handles.current[unitPopup.ids[0]]?.patch({scope,homework});}:undefined} onCancel={()=>setUnitPopup(null)} onApply={(states,page)=>{unitPopup.ids.forEach(id=>{const r=handles.current[id];if(r?.book)r.patch({book:{...r.book,states:{...states},completed_page:page}});});setUnitPopup(null);}}/>):null;
  return <section className={styles.panel}><div className={styles.heading}><div><div className={styles.titleActions}><h3>진도 관리</h3><button disabled={saving||!studentIds.length||catalogFailed} onClick={()=>{setBulkOpen(true);const rows=studentIds.map(id=>handles.current[id]);const book=rows[0]?.book;if(book&&rows.every(r=>r?.ready&&r.book&&JSON.stringify(r.book.units)===JSON.stringify(book.units)&&r.book.total_pages===book.total_pages))setUnitPopup({book,ids:[...studentIds]});}}>일괄 관리</button><button disabled={hasDirty||!groups.length} onClick={()=>setManager(true)}>교재 관리</button></div><p>선택한 학생의 진도와 숙제를 한눈에 확인하고 입력합니다.</p></div><div className={styles.batchActions}><input type="date" aria-label="수업 기록 날짜" value={date} disabled={saving||Object.values(dirtyRows).some(Boolean)} onChange={e=>setDate(e.target.value)}/><button disabled={saving||!date||!Object.values(dirtyRows).some(Boolean)} onClick={()=>void saveAll()}>{saving?'저장 중…':'수업 기록 저장'}</button></div></div>
    {message&&<p role="status" className={styles.message}>{message}</p>}
    {bulkOpen&&<ProgressDialog title="일괄 관리" locked={saving} onClose={()=>{setBulkOpen(false);setUnitPopup(null);}}><div className={styles.panel}>{message&&<p role="status" className={styles.message}>{message}</p>}<fieldset disabled={saving||catalogFailed} className={styles.bulkPanel}><legend>선택한 {studentIds.length}명 일괄 편집</legend><div className={styles.bulkFields}><label>교재<select aria-label="일괄 교재" value={bulkBook} onChange={e=>setBulkBook(e.target.value)}><option value="">반 교재 선택</option>{catalog.map(c=><option key={c.id} value={c.id}>{groups.find(g=>g.id===c.class_id)?.group} · {c.title}</option>)}</select><button type="button" disabled={!bulkBook} onClick={()=>void assign()}>교재 적용</button></label><label>진행 범위<input aria-label="일괄 진행 범위" maxLength={2000} value={bulkScope} onChange={e=>setBulkScope(e.target.value)}/><button type="button" onClick={()=>apply('scope')}>진행 범위 적용</button></label><label>숙제<input aria-label="일괄 숙제" maxLength={2000} value={bulkHomework} onChange={e=>setBulkHomework(e.target.value)}/><button type="button" onClick={()=>apply('homework')}>숙제 적용</button></label><label>오늘의 피드백<textarea aria-label="일괄 오늘의 피드백" maxLength={2000} rows={4} value={bulkFeedback} onChange={e=>setBulkFeedback(e.target.value)} placeholder="선택한 학생에게 공통으로 전달할 피드백"/><button type="button" onClick={()=>apply('feedback')}>피드백 적용</button></label><label>완료 페이지<input type="number" aria-label="일괄 완료 페이지" min={0} value={bulkPage} onChange={e=>setBulkPage(e.target.value)}/><button type="button" onClick={()=>apply('page')}>페이지 적용</button></label></div><button type="button" onClick={()=>editUnits(studentIds)}>단원 일괄 관리</button></fieldset>{unitEditor}</div></ProgressDialog>}
    {hasDirty&&<p className={styles.message}>작성 중인 학생은 선택을 해제해도 저장하거나 취소할 때까지 표시됩니다.</p>}
    {!students.length?<p>왼쪽에서 학생이나 반을 선택해 주세요.</p>:<div className={styles.tableWrap}><table className={styles.progressTable}><thead><tr><th>학생</th><th>교재</th><th>진행률</th><th>현재 진행 단원</th><th>지난 숙제</th><th>관리</th></tr></thead><tbody>{students.map(s=><ProgressRow key={s.id} student={s} date={date} revision={rosterRevision+revision} catalog={catalog.filter(c=>groups.find(g=>g.students.some(x=>x.id===s.id))?.id===c.class_id)} onDirty={onDirty} register={register} saving={saving} onUnits={id=>editUnits([id])} onHistory={id=>{const r=handles.current[id];if(r?.book)setHistory({book:r.book,entries:r.entries.filter(e=>e.book_id===r.book!.id)});}}/>)}</tbody></table></div>}
    {manager&&<ProgressDialog title="교재 관리" locked={managerDirty} onClose={()=>setManager(false)}><ClassBookManager groups={groups} initialClassId={groups.find(g=>g.students.some(s=>studentIds.includes(s.id)))?.id??''} onChanged={changed} onDirtyChange={setManagerDirty}/></ProgressDialog>}
    {unitPopup&&!bulkOpen&&<ProgressDialog title={unitPopup.ids.length>1?'단원 일괄 관리':'단원 관리'} onClose={()=>setUnitPopup(null)}>{unitEditor}</ProgressDialog>}
    {history&&<ProgressDialog title="수업 기록" onClose={()=>setHistory(null)}><section className={styles.panel}>{history.entries.sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.created_at.localeCompare(a.created_at)).map(e=><details key={e.id}><summary>{e.record_date} · {e.scope||e.memo||'진도 기록'} · 저장 당시 {progressPercent({units:e.units_snapshot??history.book.units,states:e.states,total_pages:e.total_pages_snapshot??0,completed_page:e.completed_page??0})}%</summary><p>숙제: {e.homework||'없음'}</p><p>오늘의 피드백: {e.memo||'없음'}</p></details>)}{!history.entries.length&&<p>저장된 기록이 없습니다.</p>}</section></ProgressDialog>}
  </section>;
}
