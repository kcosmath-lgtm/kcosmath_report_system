"use client";

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { loadStudents, loadStudentDaily, loadWrongAnswers, saveStudentDaily } from '../lib/report-storage';
import type { StudentGroup } from '../types/student';
import type { Attendance, DailyExam, StudentDailySave } from '../types/student-daily';
import styles from './student-daily.module.css';
import StudentGrades from './StudentGrades';

const attendance: Attendance[] = ['', '출석', '지각', '결석', '조퇴'];
export default function StudentDailyRecords({ rosterRevision = 0, onDirtyChange, studentIds }: { rosterRevision?: number; onDirtyChange?: (dirty: boolean) => void; studentIds?: string[] }) {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState<Record<string, StudentDailySave>>({});
  const [history, setHistory] = useState<StudentDailySave[]>([]);
  const [dirty, setDirty] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [showGrades, setShowGrades] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkAttendance, setBulkAttendance] = useState<Attendance>('출석');
  const [bulkHomework, setBulkHomework] = useState<'O' | '△' | 'X'>('O');
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);
  useEffect(() => {
    onDirtyChange?.(dirty.length > 0 || busy);
  }, [dirty.length, busy, onDirtyChange]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadStudents(), loadStudentDaily(date.slice(0, 7)), loadWrongAnswers(date.slice(0, 7))]).then(([roster, daily, wrong]) => {
      if (cancelled) return;
      setGroups(roster); setGroupId(current => roster.some(g => g.id === current) ? current : roster[0]?.id ?? '');
      const next: Record<string, StudentDailySave> = {};
      for (const student of roster.flatMap(g => g.students)) next[student.id] = {
        daily: daily.find(r => r.student_id === student.id && r.record_date === date) ?? { id: crypto.randomUUID(), student_id: student.id, record_date: date, attendance: '출석', reason: '', exams: [], version: 0 },
        wrong: wrong.find(r => r.student_id === student.id && r.record_date === date) ?? { id: crypto.randomUUID(), student_id: student.id, record_date: date, total_wrong: 0, corrected_count: 0, completed: false, homework_status: 'O', memo: '', version: 0 },
      };
      setRows(next); setHistory(daily.map(d => ({ daily: d, wrong: wrong.find(w => w.student_id === d.student_id && w.record_date === d.record_date) ?? { id: '', student_id: d.student_id, record_date: d.record_date, total_wrong: 0, corrected_count: 0, memo: '', version: 0 } })));
      setDirty([]); setFailed(false);
    }).catch(e => { if (!cancelled) { setMessage(e.message); setFailed(true); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, reload, rosterRevision]);
  useEffect(() => {
    if (!dirty.length) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty.length]);
  function edit(id: string, change: (row: StudentDailySave) => StudentDailySave) {
    setRows(current => {
      const next = change(current[id]);
      if (next.wrong.total_wrong !== current[id].wrong.total_wrong || next.wrong.corrected_count !== current[id].wrong.corrected_count) next.wrong.completed = next.wrong.total_wrong > 0 && next.wrong.corrected_count === next.wrong.total_wrong;
      return { ...current, [id]: next };
    });
    setDirty(current => current.includes(id) ? current : [...current, id]); setMessage('');
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const ids = [...new Set([...dirty, ...students.filter(s => rows[s.id]?.daily.version === 0 || rows[s.id]?.wrong.version === 0).map(s => s.id)])];
      const saved = await saveStudentDaily(ids.map(id => rows[id]));
      setRows(current => ({ ...current, ...Object.fromEntries(saved.map(r => [r.daily.student_id, r])) }));
      setHistory(current => [...current.filter(r => !saved.some(s => s.daily.student_id === r.daily.student_id && s.daily.record_date === r.daily.record_date)), ...saved]);
      setDirty([]); setMessage('저장했습니다. 이전 날짜의 기록은 그대로 보존됩니다.');
    } catch (e) { setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  const students = studentIds ? groups.flatMap(g => g.students).filter(s => studentIds.includes(s.id)) : groups.find(g => g.id === groupId)?.students ?? [];
  const unsavedDefaults = students.some(s => rows[s.id]?.daily.version === 0 || rows[s.id]?.wrong.version === 0);
  const student = students.find(s => s.id === selected), row = student ? rows[student.id] : undefined;
  function examChange(id: string, patch: Partial<DailyExam>) {
    edit(selected, r => ({ ...r, daily: { ...r.daily, exams: r.daily.exams.map(e => e.id === id ? { ...e, ...patch } : e) } }));
  }
  return <section className={styles.records} aria-label="학생 날짜별 기록">
    <div className={styles.toolbar}><div><h2>학생별 수업 기록</h2><p>출석·오답·숙제·성적을 날짜별로 기록하세요. 기본값도 저장 버튼을 눌러야 기록됩니다.</p></div>
      <input type="date" aria-label="기록 날짜" value={date} disabled={busy || loading} onChange={e => {
        if (!e.target.value || (dirty.length && !confirm('저장하지 않은 내용을 버리고 날짜를 바꿀까요?'))) return;
        setLoading(true); setMessage(''); setDate(e.target.value);
      }} />
      {!studentIds && <label>반<select value={groupId} disabled={busy || loading} onChange={e => { setGroupId(e.target.value); setSelected(''); }}>{groups.map(g => <option key={g.id} value={g.id}>{g.group}</option>)}</select></label>}
      <button disabled={busy || loading || failed || (!dirty.length && !unsavedDefaults)} onClick={() => void save()}>{busy ? '저장 중…' : '수업 기록 저장'}</button>
    </div>
    <StudentGrades groups={groups} history={history.filter(r => !studentIds || !studentIds.length || studentIds.includes(r.daily.student_id))} blocked={busy || loading || failed || dirty.length > 0} show={showGrades} setShow={setShowGrades} onBusyChange={setBusy} onSaved={importDate => { setLoading(true); setDate(importDate); setReload(v => v + 1); }} />
    {message && <p role="status" className={styles.message}>{message}{failed && <button onClick={() => { setLoading(true); setReload(v => v + 1); }}>다시 불러오기</button>}</p>}
    {!showGrades && (loading ? <p>기록을 불러오는 중…</p> : <fieldset disabled={busy || failed} className={styles.layout}>
      {students.some(s => checked.includes(s.id)) && <div className={styles.bulk}><strong>{students.filter(s => checked.includes(s.id)).length}명 일괄 편집</strong>
        <select aria-label="일괄 출석 상태" value={bulkAttendance} onChange={e => setBulkAttendance(e.target.value as Attendance)}>{attendance.map(a => <option key={a} value={a}>{a || '미기록'}</option>)}</select><button onClick={() => students.filter(s => checked.includes(s.id)).forEach(s => edit(s.id, r => ({ ...r, daily: { ...r.daily, attendance: bulkAttendance } })))}>출석 적용</button>
        <select aria-label="일괄 숙제 상태" value={bulkHomework} onChange={e => setBulkHomework(e.target.value as typeof bulkHomework)}><option value="O">완료</option><option value="△">일부 완료</option><option value="X">미완료</option></select><button onClick={() => students.filter(s => checked.includes(s.id)).forEach(s => edit(s.id, r => ({ ...r, wrong: { ...r.wrong, homework_status: bulkHomework } })))}>숙제 적용</button>
        <input aria-label="일괄 전체 오답" type="number" min="0" value={bulkTotal} onChange={e => setBulkTotal(Number(e.target.value))} /><span>문제 중</span><input aria-label="일괄 완료 오답" type="number" min="0" max={bulkTotal} value={bulkDone} onChange={e => setBulkDone(Number(e.target.value))} /><span>완료</span><button disabled={!Number.isInteger(bulkTotal) || !Number.isInteger(bulkDone) || bulkTotal < bulkDone || bulkDone < 0} onClick={() => students.filter(s => checked.includes(s.id)).forEach(s => edit(s.id, r => ({ ...r, wrong: { ...r.wrong, total_wrong: bulkTotal, corrected_count: bulkDone } })))}>오답 적용</button>
      </div>}
      <div className={styles.tableWrap}><table><thead><tr><th><input className={styles.check} type="checkbox" aria-label="보이는 학생 전체 선택" checked={students.length > 0 && students.every(s => checked.includes(s.id))} ref={input => { if (input) input.indeterminate = students.some(s => checked.includes(s.id)) && !students.every(s => checked.includes(s.id)); }} onChange={e => setChecked(e.target.checked ? students.map(s => s.id) : [])} /></th><th>학생</th><th>출석</th><th>오답 완료</th><th>숙제</th></tr></thead><tbody>{students.map(s => {
        const r = rows[s.id]; if (!r) return null;
        return <tr key={s.id} data-selected={selected === s.id}><td><input className={styles.check} type="checkbox" aria-label={`${s.name} 일괄 편집 선택`} checked={checked.includes(s.id)} onChange={e => setChecked(ids => e.target.checked ? [...ids,s.id] : ids.filter(id => id !== s.id))} /></td><td><button onClick={() => setSelected(s.id)}>{s.name}</button><small>{s.grade}{dirty.includes(s.id) ? ' · 미저장' : ''}</small></td>
          <td><select aria-label={`${s.name} 출석`} value={r.daily.attendance} onChange={e => edit(s.id, v => ({ ...v, daily: { ...v.daily, attendance: e.target.value as Attendance } }))}>{attendance.map(a => <option key={a} value={a}>{a || '미기록'}</option>)}</select></td>
          <td><div className={styles.wrongCounts}><input type="number" min="0" aria-label={`${s.name} 전체 오답`} value={r.wrong.total_wrong} onChange={e => edit(s.id, v => { const total = Number(e.target.value); return { ...v, wrong: { ...v.wrong, total_wrong: total, completed: total > 0 && v.wrong.corrected_count === total } }; })} /><span>문제 중</span><input type="number" min="0" max={r.wrong.total_wrong} aria-label={`${s.name} 완료 오답`} value={r.wrong.corrected_count} onChange={e => edit(s.id, v => { const count = Number(e.target.value); return { ...v, wrong: { ...v.wrong, corrected_count: count, completed: v.wrong.total_wrong > 0 && count === v.wrong.total_wrong } }; })} /><span>완료</span></div></td>
          <td><select aria-label={`${s.name} 숙제`} value={r.wrong.homework_status ?? ''} onChange={e => edit(s.id, v => ({ ...v, wrong: { ...v.wrong, homework_status: (e.target.value || null) as typeof v.wrong.homework_status } }))}><option value="">미기록</option><option value="O">완료</option><option value="△">일부 완료</option><option value="X">미완료</option></select></td>
          </tr>;
      })}</tbody></table>{!students.length && <p>왼쪽에서 반 또는 학생을 선택해 주세요.</p>}</div>
      <aside className={styles.detail}>{student && row ? <><h3>{student.name} <small>{student.grade} · {date}</small></h3>
        <label>출석 사유·메모<textarea value={row.daily.reason} maxLength={2000} onChange={e => edit(selected, r => ({ ...r, daily: { ...r.daily, reason: e.target.value } }))} placeholder="지각·결석·조퇴 사유 등을 입력하세요." /></label>
        <h4>오답·숙제 상세</h4><div className={styles.numbers}><label>전체 오답<input type="number" min="0" value={row.wrong.total_wrong} onChange={e => edit(selected, r => ({ ...r, wrong: { ...r.wrong, total_wrong: Number(e.target.value) } }))} /></label><label>정리한 오답<input type="number" min="0" max={row.wrong.total_wrong} value={row.wrong.corrected_count} onChange={e => edit(selected, r => ({ ...r, wrong: { ...r.wrong, corrected_count: Number(e.target.value) } }))} /></label></div>
        <label>오답·숙제 메모<textarea value={row.wrong.memo} onChange={e => edit(selected, r => ({ ...r, wrong: { ...r.wrong, memo: e.target.value } }))} /></label>
        <h4>당일 성적</h4>{row.daily.exams.map(exam => <div key={exam.id} className={styles.exam}>
          <label>시험명<input value={exam.name} maxLength={150} onChange={e => examChange(exam.id, { name: e.target.value })} placeholder="예: 단원평가" /></label>
          <div className={styles.numbers}><label>점수<input type="number" min="0" max={exam.max_score} step="any" value={exam.score} onChange={e => examChange(exam.id, { score: Number(e.target.value) })} /></label><label>만점<input type="number" min="0.01" step="any" value={exam.max_score} onChange={e => examChange(exam.id, { max_score: Number(e.target.value) })} /></label></div>
          <label>범위·단원<input value={exam.scope} onChange={e => examChange(exam.id, { scope: e.target.value })} /></label><label>시험 메모<input value={exam.memo} onChange={e => examChange(exam.id, { memo: e.target.value })} /></label>
          <button onClick={() => edit(selected, r => ({ ...r, daily: { ...r.daily, exams: r.daily.exams.filter(e => e.id !== exam.id) } }))}>시험 삭제</button>
        </div>)}
        <details><summary>이번 달 기록 이력</summary>{history.filter(r => r.daily.student_id === selected).sort((a,b) => b.daily.record_date.localeCompare(a.daily.record_date)).map(r => <button className={styles.history} key={r.daily.id} onClick={() => {
          if (dirty.length && !confirm('저장하지 않은 내용을 버리고 이전 기록을 열까요?')) return;
          setLoading(true); setDate(r.daily.record_date); setReload(v => v + 1);
        }}>{r.daily.record_date} · {r.daily.attendance || '출석 미기록'} · 시험 {r.daily.exams.length}건</button>)}</details>
      </> : <p>학생 이름을 눌러 사유·오답 개수·시험 성적을 입력하세요.</p>}</aside>
    </fieldset>)}
  </section>;
}
