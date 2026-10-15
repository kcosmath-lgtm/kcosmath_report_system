'use client';
import { useEffect, useState } from 'react';
import { loadClassBooks, manageClassBook } from '../lib/report-storage';
import { PROGRESS_TEMPLATES } from '../constants/progressTemplates';
import type { ClassBook } from '../types/progress';
import type { StudentGroup } from '../types/student';
import styles from './student-progress.module.css';

export default function ClassBookManager({ groups, initialClassId, onChanged, onDirtyChange }: { groups: StudentGroup[]; initialClassId: string; onChanged: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [classId,setClassId] = useState(initialClassId || groups[0]?.id || '');
  const [books,setBooks] = useState<ClassBook[]>([]);
  const [editing,setEditing] = useState<ClassBook | null>(null);
  const [title,setTitle] = useState('');
  const [pages,setPages] = useState(0);
  const [text,setText] = useState('');
  const [template,setTemplate] = useState(0);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [revision,setRevision] = useState(0);
  useEffect(() => { onDirtyChange(!!editing || busy); },[editing,busy,onDirtyChange]);
  useEffect(() => {
    let cancelled=false;
    if (!classId) return;
    queueMicrotask(()=>{if (!cancelled) setLoading(true);});
    loadClassBooks(classId).then(data=>{if (!cancelled) setBooks(data);}).catch(e=>{if (!cancelled) setMessage(e.message);}).finally(()=>{if (!cancelled) setLoading(false);});
    return ()=>{cancelled=true;};
  },[classId,revision]);
  function edit(book?: ClassBook) {
    const preset=PROGRESS_TEMPLATES[0];
    const b=book ?? {id:crypto.randomUUID(),class_id:classId,title:'',curriculum:preset.curriculum,course:preset.label,units:[],total_pages:0,version:0};
    setEditing(b);setTitle(b.title);setPages(b.total_pages);setText(b.units.map(u=>u.group ? `${u.group} > ${u.name}` : u.name).join('\n'));setMessage('');
  }
  async function save() {
    if (!editing) return;
    const used=new Set<string>();
    const units=text.split('\n').filter(l=>l.trim()).map(line=>{
      const i=line.indexOf('>'),group=i<0?'':line.slice(0,i).trim(),name=i<0?line.trim():line.slice(i+1).trim();
      const old=editing.units.find(u=>u.group===group && u.name===name && !used.has(u.id));
      const id=old?.id ?? crypto.randomUUID(); used.add(id);return {id,group,name};
    });
    setBusy(true);setMessage('');
    try { await manageClassBook('save',{...editing,title:title.trim(),units,total_pages:pages});setEditing(null);setRevision(v=>v+1);onChanged();setMessage('반 교재를 저장했습니다.'); }
    catch(e){setMessage(e instanceof Error?e.message:'저장하지 못했습니다.');} finally{setBusy(false);}
  }
  async function remove(book:ClassBook) {
    if(!window.confirm(`${book.title}을 이 반의 교재 목록과 학생별 사용 교재에서 삭제할까요? 저장된 수업 이력은 보존됩니다.`))return;
    setBusy(true);setMessage('');
    try{await manageClassBook('delete',book);setRevision(v=>v+1);onChanged();setMessage('교재를 삭제했습니다.');}catch(e){setMessage(e instanceof Error?e.message:'삭제하지 못했습니다.');}finally{setBusy(false);}
  }
  return <section className={styles.panel}><label>관리할 반<select aria-label="교재 관리 반" value={classId} disabled={busy||!!editing} onChange={e=>setClassId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.group}</option>)}</select></label>
    <p>반 교재를 등록한 뒤 진도 표에서 학생에게 연결하세요. 교재를 수정하면 연결된 학생에게 반영되며, 이전 수업 기록의 목차·진행률은 보존됩니다.</p>
    {message&&<p role="status" className={styles.message}>{message}</p>}
    {!editing&&<><button disabled={busy||loading||!classId} onClick={()=>edit()}>새 교재 등록</button>{loading?<p>불러오는 중…</p>:books.map(b=><div className={styles.bookItem} key={b.id}><div><strong>{b.title}</strong><small>{b.total_pages ? `${b.total_pages}페이지` : '페이지 미등록'} · {b.units.length}개 단원</small></div><button disabled={busy} onClick={()=>edit(b)}>편집</button><button disabled={busy} onClick={()=>void remove(b)}>삭제</button></div>)}{!loading&&!books.length&&<p>등록된 반 교재가 없습니다.</p>}</>}
    {editing&&<form className={styles.card} onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}>
      <label>교재명<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>총 페이지 수<input type="number" required min={1} max={10000} value={pages||''} onChange={e=>setPages(Number(e.target.value))}/></label>
      <div className={styles.columns}><label>목차 템플릿<select value={template} onChange={e=>setTemplate(Number(e.target.value))}>{PROGRESS_TEMPLATES.map((t,i)=><option key={t.id} value={i}>{t.label} · {t.curriculum}</option>)}</select></label><button type="button" onClick={()=>{const t=PROGRESS_TEMPLATES[template];setText(t.units.map(u=>u.group?`${u.group} > ${u.name}`:u.name).join('\n'));setEditing({...editing,curriculum:t.curriculum,course:t.label});}}>템플릿 불러오기</button></div>
      <label>목차 · 한 줄에 한 단원<textarea rows={9} required value={text} onChange={e=>setText(e.target.value)}/></label><p>직접 목차를 입력해도 됩니다. “대단원 &gt; 소단원” 형식을 사용할 수 있습니다.</p>
      <div className={styles.actions}><button>{busy?'저장 중…':'교재 저장'}</button><button type="button" onClick={()=>setEditing(null)}>취소</button></div>
    </fieldset></form>}
  </section>;
}
