'use client';
import { useState } from 'react';
import { progressPercent, type ProgressBook, type UnitStatus } from '../types/progress';
import styles from './student-progress.module.css';
export default function ProgressUnitEditor({ book, count, onApply, onCancel, scope = '', homework = '', onDetails }: { book: ProgressBook; count: number; onApply: (states: ProgressBook['states'], page: number) => void; onCancel: () => void; scope?: string; homework?: string; onDetails?: (scope: string, homework: string) => void }) {
  const [states,setStates]=useState(book.states);
  const [page,setPage]=useState(book.completed_page??0);
  const [bulkStatus,setBulkStatus]=useState<UnitStatus>('완료');
  const [draftScope,setDraftScope]=useState(scope),[draftHomework,setDraftHomework]=useState(homework);
  return <form className={styles.panel} onSubmit={e=>{e.preventDefault();onDetails?.(draftScope,draftHomework);onApply(states,page);}}><h4>{book.title} · {count}명</h4><p>단원 상태와 페이지 진도를 적용한 뒤 상단의 수업 기록 저장으로 저장하세요.</p>
    {onDetails&&<div className={styles.columns}><label>진행 범위<textarea aria-label="진행 범위" maxLength={2000} value={draftScope} onChange={e=>setDraftScope(e.target.value)}/></label><label>내줄 숙제<textarea aria-label="내줄 숙제" maxLength={2000} value={draftHomework} onChange={e=>setDraftHomework(e.target.value)}/></label></div>}
    {!!book.total_pages&&<label>완료한 페이지 수<input aria-label="완료 페이지" type="number" min={0} max={book.total_pages} required value={page} onChange={e=>setPage(Number(e.target.value))}/><small>전체 {book.total_pages}페이지 · {progressPercent({...book,states,completed_page:page})}%</small></label>}
    <div className={styles.toolbar}><label>단원 상태 일괄 변경<select aria-label="전체 단원 상태" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value as UnitStatus)}>{['미시작','진행 중','완료'].map(s=><option key={s}>{s}</option>)}</select></label><button type="button" onClick={()=>setStates(Object.fromEntries(book.units.map(u=>[u.id,bulkStatus])))}>전체 단원에 적용</button></div>
    {book.units.map(u=><div className={styles.unit} key={u.id}><label htmlFor={`state-${u.id}`}>{u.group ? `${u.group} / ` : ''}{u.name}</label><select id={`state-${u.id}`} aria-label={`${u.name} 진도 상태`} value={states[u.id]??'미시작'} onChange={e=>setStates({...states,[u.id]:e.target.value as UnitStatus})}>{['미시작','진행 중','완료'].map(s=><option key={s}>{s}</option>)}</select></div>)}
    <div className={styles.actions}><button type="submit">{count>1?`${count}명에게 적용`:'적용'}</button><button type="button" onClick={onCancel}>취소</button></div>
  </form>;
}
