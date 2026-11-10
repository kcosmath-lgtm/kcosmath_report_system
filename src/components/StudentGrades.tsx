"use client";
import { useEffect, useRef, useState } from 'react';
import type { StudentGroup } from '../types/student';
import type { StudentDailySave } from '../types/student-daily';
import { loadStudentDaily, loadWrongAnswers, saveStudentDaily } from '../lib/report-storage';
import { parseGradeRows, type ImportedGrade } from '../lib/grade-import';
import styles from './student-daily.module.css';

export default function StudentGrades({ groups, history, onSaved, blocked, show, setShow, onBusyChange }: { groups: StudentGroup[]; history: StudentDailySave[]; onSaved: (date: string) => void; blocked: boolean; show: boolean; setShow: (show: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportedGrade[]>([]);
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkTitleDirty, setBulkTitleDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const input = fileInput.current;
    const cancel = () => onBusyChange(false);
    input?.addEventListener('cancel', cancel);
    return () => input?.removeEventListener('cancel', cancel);
  }, [onBusyChange]);
  const students = groups.flatMap(g => g.students.map(s => ({ ...s, group: g.group })));
  function applyBulkTitle() {
    const nextTitle = bulkTitle.trim();
    if (!nextTitle) return;
    setPending(rows => {
      const hasEnabled = rows.some(r => r.enabled);
      return rows.map(r => (!hasEnabled || r.enabled ? { ...r, title: nextTitle } : r));
    });
    setBulkTitleDirty(false);
  }
  async function read(file: File) {
    onBusyChange(true);
    console.info('[grade-import] file_selected', { size: file.size });
    setMessage(''); setPending([]); setBulkTitle(''); setBulkTitleDirty(false); setError(false);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하 파일을 선택해 주세요.');
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0x50 || bytes[0] === 0xd0) throw new Error('현재는 배정문제지 목록의 HTML 형식 .xls를 지원합니다. 이 파일 형식은 아직 지원하지 않습니다.');
      let text = new TextDecoder('utf-8').decode(buffer);
      if (/charset\s*=\s*["']?(euc-kr|ks_c_5601|cp949)/i.test(text)) text = new TextDecoder('euc-kr').decode(buffer);
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const grid = Array.from(doc.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent?.replace(/\u00a0/g,' ').trim() ?? ''));
      const parsed = parseGradeRows(grid);
      console.info('[grade-import] file_parsed', { graded: parsed.rows.length, skipped: parsed.skipped });
      setPending(parsed.rows.map(r => {
        const matches = students.filter(s => s.name.trim() === r.name.trim() && s.grade.trim() === r.grade.trim());
        return { ...r, studentId: matches.length === 1 ? matches[0].id : '' };
      }));
      setMessage(`${parsed.rows.length}건 확인 · 미채점 ${parsed.skipped}건 제외. 날짜는 생성일 기준이며 시험명과 날짜를 변경할 수 있습니다. 점수 만점은 100점 기준입니다.`);
    } catch(e) { console.error('[grade-import] file_read_failed', e instanceof Error ? e.message : 'Unknown error'); setError(true); setMessage(e instanceof Error ? e.message : '파일을 읽지 못했습니다.'); }
    finally { onBusyChange(false); }
  }
  async function importGrades() {
    if (busy) return;
    if (blocked) { setError(true); setMessage('수업 기록의 변경사항을 먼저 저장한 뒤 성적을 저장해 주세요.'); return; }
    setError(false);
    setBusy(true); onBusyChange(true);
    try {
      const autoTitle = bulkTitleDirty ? bulkTitle.trim() : '';
      const effectiveRows = autoTitle
        ? pending.map(r => (r.enabled ? { ...r, title: autoTitle } : r))
        : pending;
      if (autoTitle) {
        setPending(effectiveRows);
        setBulkTitleDirty(false);
      }
      const chosen = effectiveRows.filter(r => r.enabled);
      if (!chosen.length || chosen.some(r => !r.studentId || !r.date || !r.title.trim())) throw new Error('가져올 학생과 날짜, 시험명을 모두 지정해 주세요.');
      const updates = new Map<string, StudentDailySave>(); let duplicates = 0;
      for (const month of new Set(chosen.map(r => r.date.slice(0,7)))) {
        const [daily, wrong] = await Promise.all([loadStudentDaily(month), loadWrongAnswers(month)]);
        for (const r of chosen.filter(r => r.date.startsWith(month))) {
          const key = `${r.studentId}:${r.date}`;
          const existing = updates.get(key) ?? {
            daily: daily.find(d => d.student_id === r.studentId && d.record_date === r.date) ?? { id: crypto.randomUUID(), student_id: r.studentId, record_date: r.date, attendance: '' as const, reason: '', exams: [], version: 0 },
            wrong: wrong.find(w => w.student_id === r.studentId && w.record_date === r.date) ?? { id: crypto.randomUUID(), student_id: r.studentId, record_date: r.date, total_wrong: 0, corrected_count: 0, memo: '', version: 0 },
          };
          if (existing.daily.exams.some(e => e.id === r.key)) { duplicates++; continue; }
          existing.daily = { ...existing.daily, exams: [...existing.daily.exams, { id: r.key, name: r.title.trim(), score: r.score, max_score: r.max, scope: '', memo: `문제은행 · ${r.total}문항 · 오답 ${r.wrong}문항` }] };
          updates.set(key, existing);
        }
      }
      if (updates.size > 500) throw new Error('한 번에 500개 날짜별 기록까지 가져올 수 있습니다. 파일을 나눠 주세요.');
      if (updates.size) {
        const saved = await saveStudentDaily([...updates.values()]);
        if (saved.length !== updates.size || [...updates.values()].some(expected => {
          const actual = saved.find(s => s.daily.student_id === expected.daily.student_id && s.daily.record_date === expected.daily.record_date);
          return !actual || expected.daily.exams.some(exam => !actual.daily.exams.some(e => e.id === exam.id));
        })) throw new Error('서버 응답에서 저장된 성적을 확인하지 못했습니다. 새로고침 후 확인해 주세요.');
      }
      setPending([]); setBulkTitle(''); setBulkTitleDirty(false); setMessage(`성적 ${chosen.length - duplicates}건 저장 완료 · 중복 ${duplicates}건 제외`); setShow(true); onSaved(chosen[0].date);
    } catch(e) { setError(true); setMessage(e instanceof Error ? e.message : '성적을 저장하지 못했습니다.'); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <>
    <div className={styles.gradeActions}><label className={styles.filePicker} data-disabled={blocked || busy}>성적 엑셀 가져오기<input ref={fileInput} aria-label="성적 엑셀 가져오기" type="file" disabled={blocked || busy} accept=".xls,.html,.htm" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file); else onBusyChange(false); }} /></label>
      <button aria-pressed={show} disabled={busy} onClick={() => setShow(!show)}>{show ? '수업 기록 보기' : '성적 보기'}</button>
    </div>
    {message && <p className={styles.message} role={error ? 'alert' : 'status'} data-error={error}>{message}</p>}
    {!!pending.length && <section className={styles.importPreview}><h3>가져올 성적 확인 · 아직 저장되지 않았습니다</h3><p>선택한 {pending.filter(r => r.enabled).length}건 중 학생 미연결 {pending.filter(r => r.enabled && !r.studentId).length}건</p><div className={styles.importConfirm}><button disabled={busy} onClick={() => void importGrades()}>{busy ? '성적 저장 중…' : '확인한 성적 저장'}</button><span>이 버튼을 눌러야 성적이 저장됩니다. 위의 수업 기록 저장은 출석·오답·숙제용입니다.</span></div><div className={styles.quickBulkBar} style={{ marginBottom: 12 }}><div className={styles.quickBulkExam}><span className={styles.quickBulkTag}>시험명 일괄 변경</span><input type="text" className={styles.bulkExamNameInput} aria-label="일괄 시험명" placeholder="변경할 시험명 입력" value={bulkTitle} disabled={busy} onChange={e => { setBulkTitle(e.target.value); setBulkTitleDirty(true); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyBulkTitle(); } }} /><button type="button" className={styles.bulkExamApplyBtn} disabled={busy || !bulkTitle.trim()} onClick={applyBulkTitle}>시험명 일괄 적용</button></div></div><div className={styles.tableWrap}><table><thead><tr><th>선택</th><th>파일 학생</th><th>연결할 학생</th><th>시험 날짜</th><th>시험명</th><th>점수</th></tr></thead><tbody>{pending.map((r,i) => <tr key={`${r.key}:${i}`}>
      <td><input className={styles.check} type="checkbox" aria-label={`${r.name} 성적 가져오기`} checked={r.enabled} disabled={busy} onChange={e => setPending(rows => rows.map((row,j) => i === j ? { ...row, enabled: e.target.checked } : row))} /></td><td>{r.name}<small>{r.group} · {r.grade}</small></td>
      <td><select aria-label={`${r.name} 연결 학생`} value={r.studentId} disabled={busy} onChange={e => setPending(rows => rows.map((row,j) => i === j ? { ...row, studentId: e.target.value } : row))}><option value="">학생 선택 필요</option>{students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.grade} · {s.group}</option>)}</select></td>
      <td><input type="date" aria-label={`${r.name} 시험 날짜`} value={r.date} disabled={busy} onChange={e => setPending(rows => rows.map((row,j) => i === j ? { ...row, date: e.target.value } : row))} /></td><td><input type="text" className={styles.examTableInput} aria-label={`${r.name} 시험명`} value={r.title} disabled={busy} onChange={e => { const value = e.target.value; setBulkTitleDirty(false); setPending(rows => rows.map((row,j) => i === j ? { ...row, title: value } : row)); }} /></td><td>{r.score} / {r.max}</td>
    </tr>)}</tbody></table></div><button disabled={blocked || busy} onClick={() => void importGrades()}>{busy ? '저장 중…' : '확인한 성적 저장'}</button><button disabled={busy} onClick={() => { setPending([]); setBulkTitle(''); setBulkTitleDirty(false); }}>취소</button></section>}
    {show && <section><h3>이번 달 성적</h3><div className={styles.tableWrap}><table><thead><tr><th>날짜</th><th>학생</th><th>시험명</th><th>점수 / 만점</th><th>범위·메모</th></tr></thead><tbody>{history.flatMap(r => r.daily.exams.map(e => <tr key={`${r.daily.id}:${e.id}`}><td>{r.daily.record_date}</td><td>{students.find(s => s.id === r.daily.student_id)?.name ?? '학생'}</td><td>{e.name}</td><td>{e.score} / {e.max_score}</td><td>{e.scope} {e.memo}</td></tr>))}</tbody></table>{!history.some(r => r.daily.exams.length) && <p>이 달에 저장된 성적이 없습니다. 날짜에서 다른 달을 선택할 수 있습니다.</p>}</div></section>}
  </>;
}
