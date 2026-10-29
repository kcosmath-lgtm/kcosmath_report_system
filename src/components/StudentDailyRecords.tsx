"use client";

import { useEffect, useState, type KeyboardEvent } from 'react';
import dayjs from 'dayjs';
import { Plus, Trash2, Check, Award, Calendar, Save } from 'lucide-react';
import { loadStudents, loadStudentDaily, loadWrongAnswers, saveStudentDaily } from '../lib/report-storage';
import type { StudentGroup } from '../types/student';
import type { Attendance, DailyExam, StudentDailySave } from '../types/student-daily';
import { wrongAnswerStatus } from '../types/student-daily';
import StudentGrades from './StudentGrades';
import styles from './student-daily.module.css';

const attendance: Attendance[] = ['출석', '지각', '결석'];

function StatusButtons({
  label,
  values,
  displayLabels,
  value,
  onChange,
}: {
  label: string;
  values: readonly string[];
  displayLabels?: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.statusButtons} role="group" aria-label={label}>
      {values.map((option, index) => {
        const titleText = option === 'O' ? '완료' : option === '△' ? '일부 완료' : option === 'X' ? '미완료' : option;
        const text = displayLabels?.[index] ?? option;
        return (
          <button
            type="button"
            key={option}
            data-state={index}
            aria-pressed={value === option}
            aria-label={`${label} ${titleText}`}
            title={titleText}
            onClick={() => onChange(option)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function WrongStatus({ total, done, completed }: { total: number; done: number; completed?: boolean }) {
  const symbol = completed ? '○' : wrongAnswerStatus(total, done);
  const label = symbol === '○' ? '전체 완료' : symbol === '△' ? '50% 이상 완료' : symbol === 'X' ? '50% 미만 완료' : '오답 개수 미입력 또는 확인 필요';
  return <span className={styles.stateBadge} data-state={symbol} aria-label={`오답 상태: ${label}`} title={label}>{symbol}</span>;
}

function moveCountFocus(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const input = event.currentTarget;
  const table = input.closest('table');
  const totals = Array.from(table?.querySelectorAll<HTMLInputElement>('input[data-count="total"]') ?? []);
  const done = Array.from(table?.querySelectorAll<HTMLInputElement>('input[data-count="done"]') ?? []);
  const order = [...totals, ...done];
  const next = order[order.indexOf(input) + (event.shiftKey ? -1 : 1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

function moveExamScoreFocus(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const input = event.currentTarget;
  const table = input.closest('table');
  const scores = Array.from(table?.querySelectorAll<HTMLInputElement>('input[data-count="exam-score"]') ?? []);
  const next = scores[scores.indexOf(input) + (event.shiftKey ? -1 : 1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
  next.select();
}

export default function StudentDailyRecords({
  rosterRevision = 0,
  onDirtyChange,
  studentIds,
  viewMode = 'daily',
}: {
  rosterRevision?: number;
  onDirtyChange?: (dirty: boolean) => void;
  studentIds?: string[];
  viewMode?: 'daily' | 'exams';
}) {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [dateReady, setDateReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('cosmath-student-record-date');
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setDate(saved);
    } catch {
      /* Date selection still works when browser storage is unavailable. */
    }
    setDateReady(true);
  }, []);

  useEffect(() => {
    if (!dateReady) return;
    try {
      sessionStorage.setItem('cosmath-student-record-date', date);
    } catch {
      /* Optional UI state. */
    }
  }, [date, dateReady]);

  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState<Record<string, StudentDailySave>>({});
  const [history, setHistory] = useState<StudentDailySave[]>([]);
  const [dirty, setDirty] = useState<string[]>([]);
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
  const [bulkExamName, setBulkExamName] = useState('단원평가');
  const [bulkExamScope, setBulkExamScope] = useState('');
  const [bulkExamMax, setBulkExamMax] = useState(100);

  useEffect(() => {
    onDirtyChange?.(dirty.length > 0 || busy);
  }, [dirty.length, busy, onDirtyChange]);

  useEffect(() => {
    if (!dateReady) return;
    let cancelled = false;
    Promise.all([loadStudents(), loadStudentDaily(date.slice(0, 7)), loadWrongAnswers(date.slice(0, 7))])
      .then(([roster, daily, wrong]) => {
        if (cancelled) return;
        setGroups(roster);
        setGroupId(current => (roster.some(g => g.id === current) ? current : roster[0]?.id ?? ''));
        const next: Record<string, StudentDailySave> = {};
        for (const student of roster.flatMap(g => g.students)) {
          next[student.id] = {
            daily: daily.find(r => r.student_id === student.id && r.record_date === date) ?? {
              id: crypto.randomUUID(),
              student_id: student.id,
              record_date: date,
              attendance: '출석',
              reason: '',
              exams: [],
              version: 0,
            },
            wrong: wrong.find(r => r.student_id === student.id && r.record_date === date) ?? {
              id: crypto.randomUUID(),
              student_id: student.id,
              record_date: date,
              total_wrong: 0,
              corrected_count: 0,
              completed: false,
              homework_status: 'O',
              memo: '',
              version: 0,
            },
          };
        }
        setRows(next);
        setHistory(
          daily.map(d => ({
            daily: d,
            wrong: wrong.find(w => w.student_id === d.student_id && w.record_date === d.record_date) ?? {
              id: '',
              student_id: d.student_id,
              record_date: d.record_date,
              total_wrong: 0,
              corrected_count: 0,
              memo: '',
              version: 0,
            },
          }))
        );
        setDirty([]);
        setFailed(false);
      })
      .catch(e => {
        if (!cancelled) {
          setMessage(e.message);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reload, rosterRevision, dateReady]);

  useEffect(() => {
    if (!dirty.length) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty.length]);

  const students = studentIds
    ? groups.flatMap(g => g.students).filter(s => studentIds.includes(s.id))
    : groups.find(g => g.id === groupId)?.students ?? [];

  function edit(id: string, change: (row: StudentDailySave) => StudentDailySave) {
    setRows(current => {
      const next = change(current[id]);
      if (next.wrong.total_wrong !== current[id].wrong.total_wrong || next.wrong.corrected_count !== current[id].wrong.corrected_count) {
        next.wrong.completed = next.wrong.total_wrong > 0 && next.wrong.corrected_count === next.wrong.total_wrong;
      }
      return { ...current, [id]: next };
    });
    setDirty(current => (current.includes(id) ? current : [...current, id]));
    setMessage('');
  }

  function completeWrongAnswers(id: string) {
    edit(id, r => ({ ...r, wrong: { ...r.wrong, corrected_count: r.wrong.total_wrong, completed: true } }));
  }

  function addExamFor(studentId: string) {
    const examTitle = bulkExamName.trim() || '단원평가';
    const maxScore = Number(bulkExamMax) > 0 ? Number(bulkExamMax) : 100;
    const newExam: DailyExam = {
      id: crypto.randomUUID(),
      name: examTitle,
      score: maxScore,
      max_score: maxScore,
      scope: bulkExamScope.trim(),
      memo: '',
    };
    edit(studentId, r => ({
      ...r,
      daily: { ...r.daily, exams: [...r.daily.exams, newExam] },
    }));
  }

  const checkedStudents = students.filter(s => checked.includes(s.id));
  const targetStudents = checkedStudents.length > 0 ? checkedStudents : students;

  function applyBulkExam() {
    const examTitle = bulkExamName.trim() || '단원평가';
    const maxScore = Number(bulkExamMax) > 0 ? Number(bulkExamMax) : 100;
    const scopeText = bulkExamScope.trim();
    if (!targetStudents.length) return;
    targetStudents.forEach(s => {
      edit(s.id, r => {
        const exists = r.daily.exams.some(e => e.name === examTitle);
        const nextExams = exists
          ? r.daily.exams.map(e => (e.name === examTitle ? { ...e, max_score: maxScore, scope: scopeText || e.scope } : e))
          : [
              ...r.daily.exams,
              {
                id: crypto.randomUUID(),
                name: examTitle,
                score: maxScore,
                max_score: maxScore,
                scope: scopeText,
                memo: '',
              },
            ];
        return { ...r, daily: { ...r.daily, exams: nextExams } };
      });
    });
  }

  function examChangeFor(studentId: string, examId: string, patch: Partial<DailyExam>) {
    edit(studentId, r => ({
      ...r,
      daily: { ...r.daily, exams: r.daily.exams.map(e => (e.id === examId ? { ...e, ...patch } : e)) },
    }));
  }

  function removeExamFor(studentId: string, examId: string) {
    edit(studentId, r => ({
      ...r,
      daily: { ...r.daily, exams: r.daily.exams.filter(e => e.id !== examId) },
    }));
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const ids = [
        ...new Set([
          ...dirty,
          ...students.filter(s => rows[s.id]?.daily.version === 0 || rows[s.id]?.wrong.version === 0).map(s => s.id),
        ]),
      ];
      const saved = await saveStudentDaily(ids.map(id => rows[id]));
      setRows(current => ({ ...current, ...Object.fromEntries(saved.map(r => [r.daily.student_id, r])) }));
      setHistory(current => [
        ...current.filter(r => !saved.some(s => s.daily.student_id === r.daily.student_id && s.daily.record_date === r.daily.record_date)),
        ...saved,
      ]);
      setDirty([]);
      setMessage('저장했습니다. 이전 날짜의 기록은 그대로 보존됩니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const unsavedDefaults = students.some(s => rows[s.id]?.daily.version === 0 || rows[s.id]?.wrong.version === 0);
  const attendedCount = students.filter(s => rows[s.id]?.daily.attendance === '출석').length;
  const hwDoneCount = students.filter(s => rows[s.id]?.wrong.homework_status === 'O').length;
  const examStudentCount = students.filter(s => (rows[s.id]?.daily.exams.length ?? 0) > 0).length;
  const examTotalCount = students.reduce((acc, s) => acc + (rows[s.id]?.daily.exams.length ?? 0), 0);

  return (
    <section className={styles.records} aria-label="학생 날짜별 기록">
      <div className={styles.toolbar}>
        <div>
          <h2>{viewMode === 'exams' ? '당일 시험 · 성적 일괄 관리' : '학생별 출결 · 숙제 · 오답 기록'}</h2>
          <p>
            {viewMode === 'exams'
              ? '반 전체 또는 선택한 학생에게 시험을 일괄 생성하고, 표에서 바로 점수와 피드백을 입력합니다.'
              : '학생별 출결 상태, 숙제 수행도, 오답 클리닉 문항 수를 한 화면에서 쾌적하게 기록합니다.'}
          </p>
        </div>
        <div className={styles.kpiPills}>
          <span>대상 <b>{students.length}명</b></span>
          {viewMode === 'exams' ? (
            <>
              <span>응시 학생 <b>{examStudentCount}명</b></span>
              <span>등록 시험 <b>{examTotalCount}건</b></span>
            </>
          ) : (
            <>
              <span>출석 <b>{attendedCount}명</b></span>
              <span>숙제완료 <b>{hwDoneCount}명</b></span>
            </>
          )}
        </div>
        <label className={styles.datePickerLabel}>
          <Calendar size={14} />
          <input
            type="date"
            aria-label="기록 날짜"
            value={date}
            disabled={busy || loading}
            onChange={e => {
              if (!e.target.value || (dirty.length && !confirm('저장하지 않은 내용을 버리고 날짜를 바꿀까요?'))) return;
              setLoading(true);
              setMessage('');
              setDate(e.target.value);
            }}
          />
        </label>
        {!studentIds && (
          <label>
            반
            <select
              value={groupId}
              disabled={busy || loading}
              onChange={e => {
                setGroupId(e.target.value);
              }}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.group}
                </option>
              ))}
            </select>
          </label>
        )}
        <button disabled={busy || loading || failed || (!dirty.length && !unsavedDefaults)} onClick={() => void save()}>
          <Save size={15} /> {busy ? '저장 중…' : '기록 저장'}
        </button>
      </div>

      {viewMode === 'exams' && (
        <StudentGrades
          groups={groups}
          history={history.filter(r => !studentIds || !studentIds.length || studentIds.includes(r.daily.student_id))}
          blocked={busy || loading || failed || dirty.length > 0}
          show={showGrades}
          setShow={setShowGrades}
          onBusyChange={setBusy}
          onSaved={importDate => {
            setLoading(true);
            setDate(importDate);
            setReload(v => v + 1);
          }}
        />
      )}

      {message && (
        <p role="status" className={styles.message} data-error={failed || undefined}>
          {message}
          {failed && (
            <button
              onClick={() => {
                setLoading(true);
                setReload(v => v + 1);
              }}
            >
              다시 불러오기
            </button>
          )}
        </p>
      )}

      {loading ? (
        <p className={styles.loadingState}>기록을 불러오는 중…</p>
      ) : viewMode === 'exams' ? (
        !showGrades && (
          <fieldset disabled={busy || failed} className={styles.fullWidthLayout}>
            {students.length > 0 && (
              <div className={styles.quickBulkBar}>
                <div className={styles.quickBulkExam}>
                  <span className={styles.quickBulkTag}>
                    <Award size={14} /> 시험 일괄 배정
                  </span>
                  <input
                    type="text"
                    className={styles.bulkExamNameInput}
                    value={bulkExamName}
                    onChange={e => setBulkExamName(e.target.value)}
                    placeholder="시험명 (예: 3단원 단원평가)"
                    aria-label="일괄 시험명"
                  />
                  <input
                    type="text"
                    className={styles.bulkExamScopeInput}
                    value={bulkExamScope}
                    onChange={e => setBulkExamScope(e.target.value)}
                    placeholder="범위·단원 (선택)"
                    aria-label="일괄 시험 범위"
                  />
                  <div className={styles.bulkExamMaxBox}>
                    <span>만점</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={bulkExamMax}
                      onChange={e => setBulkExamMax(Number(e.target.value))}
                      aria-label="일괄 시험 만점"
                    />
                  </div>
                  <button type="button" className={styles.bulkExamApplyBtn} onClick={applyBulkExam}>
                    <Plus size={14} />{' '}
                    {checkedStudents.length > 0
                      ? `선택 ${checkedStudents.length}명에 시험 일괄 생성`
                      : `전체 ${students.length}명에 시험 일괄 생성`}
                  </button>
                </div>
              </div>
            )}

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '38px' }}>
                      <input
                        className={styles.check}
                        type="checkbox"
                        aria-label="보이는 학생 전체 선택"
                        checked={students.length > 0 && students.every(s => checked.includes(s.id))}
                        ref={input => {
                          if (input) input.indeterminate = students.some(s => checked.includes(s.id)) && !students.every(s => checked.includes(s.id));
                        }}
                        onChange={e => setChecked(e.target.checked ? students.map(s => s.id) : [])}
                      />
                    </th>
                    <th style={{ width: '140px' }}>학생</th>
                    <th style={{ width: '200px' }}>시험명</th>
                    <th style={{ width: '170px' }}>점수 / 만점 (Tab 이동)</th>
                    <th style={{ width: '200px' }}>범위 · 단원</th>
                    <th>시험 피드백 · 코멘트</th>
                    <th style={{ width: '110px' }}>시험 관리</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => {
                    const r = rows[s.id];
                    if (!r) return null;
                    const exams = r.daily.exams;
                    if (exams.length === 0) {
                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              className={styles.check}
                              type="checkbox"
                              aria-label={`${s.name} 일괄 선택`}
                              checked={checked.includes(s.id)}
                              onChange={e => setChecked(ids => (e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id)))}
                            />
                          </td>
                          <td>
                            <div className={styles.studentNameCell}>
                              <strong>{s.name}</strong>
                              <small>
                                {s.grade}
                                {dirty.includes(s.id) ? <em className={styles.dirtyDot}> · 수정됨</em> : ''}
                              </small>
                            </div>
                          </td>
                          <td colSpan={4} className={styles.noExamRowText}>
                            등록된 당일 시험이 없습니다. 상단에서 <b>시험 일괄 생성</b>을 누르거나 우측의 <b>+ 시험 추가</b>를 눌러주세요.
                          </td>
                          <td>
                            <button type="button" className={styles.addExamInlineBtn} onClick={() => addExamFor(s.id)}>
                              <Plus size={12} /> 시험 추가
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    return exams.map((ex, idx) => (
                      <tr key={`${s.id}:${ex.id}`}>
                        {idx === 0 && (
                          <>
                            <td rowSpan={exams.length}>
                              <input
                                className={styles.check}
                                type="checkbox"
                                aria-label={`${s.name} 일괄 선택`}
                                checked={checked.includes(s.id)}
                                onChange={e => setChecked(ids => (e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id)))}
                              />
                            </td>
                            <td rowSpan={exams.length}>
                              <div className={styles.studentNameCell}>
                                <strong>{s.name}</strong>
                                <small>
                                  {s.grade}
                                  {dirty.includes(s.id) ? <em className={styles.dirtyDot}> · 수정됨</em> : ''}
                                </small>
                              </div>
                            </td>
                          </>
                        )}
                        <td>
                          <input
                            type="text"
                            className={styles.examTableInput}
                            value={ex.name}
                            maxLength={150}
                            onChange={e => examChangeFor(s.id, ex.id, { name: e.target.value })}
                            placeholder="예: 단원평가"
                            aria-label={`${s.name} 시험명`}
                          />
                        </td>
                        <td>
                          <div className={styles.examScoreBox}>
                            <input
                              type="number"
                              min="0"
                              max={ex.max_score}
                              step="any"
                              data-count="exam-score"
                              onKeyDown={moveExamScoreFocus}
                              aria-label={`${s.name} ${ex.name} 점수`}
                              value={ex.score}
                              onChange={e => examChangeFor(s.id, ex.id, { score: Number(e.target.value) })}
                            />
                            <span>/</span>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              aria-label={`${s.name} ${ex.name} 만점`}
                              value={ex.max_score}
                              onChange={e => examChangeFor(s.id, ex.id, { max_score: Number(e.target.value) })}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            className={styles.examTableInput}
                            value={ex.scope}
                            onChange={e => examChangeFor(s.id, ex.id, { scope: e.target.value })}
                            placeholder="예: 이차방정식 활용"
                            aria-label={`${s.name} 시험 범위`}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className={styles.examTableInput}
                            value={ex.memo}
                            onChange={e => examChangeFor(s.id, ex.id, { memo: e.target.value })}
                            placeholder="시험 결과 코멘트 · 피드백"
                            aria-label={`${s.name} 시험 메모`}
                          />
                        </td>
                        <td>
                          <div className={styles.examRowActions}>
                            <button type="button" className={styles.addExamInlineBtn} onClick={() => addExamFor(s.id)} title="이 학생에게 시험 추가">
                              <Plus size={12} /> 추가
                            </button>
                            <button
                              type="button"
                              className={styles.deleteExamRowBtn}
                              onClick={() => removeExamFor(s.id, ex.id)}
                              aria-label={`${s.name} ${ex.name} 삭제`}
                              title="이 시험 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
              {!students.length && <p className={styles.emptyNotice}>왼쪽 목록에서 반 또는 학생을 선택해 주세요.</p>}
            </div>
          </fieldset>
        )
      ) : (
        <fieldset disabled={busy || failed} className={styles.fullWidthLayout}>
          {students.length > 0 && (
            <div className={styles.quickBulkBar}>
              <div className={styles.quickBulkActions}>
                <span className={styles.quickBulkTag}>빠른 일괄 처리</span>
                <button
                  type="button"
                  onClick={() =>
                    targetStudents.forEach(s => edit(s.id, r => ({ ...r, daily: { ...r.daily, attendance: '출석' } })))
                  }
                >
                  <Check size={13} /> {checkedStudents.length > 0 ? `선택 ${checkedStudents.length}명 출석` : `전체 ${students.length}명 전원 출석`}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    targetStudents.forEach(s => edit(s.id, r => ({ ...r, wrong: { ...r.wrong, homework_status: 'O' } })))
                  }
                >
                  <Check size={13} /> {checkedStudents.length > 0 ? `선택 ${checkedStudents.length}명 숙제완료` : `전체 ${students.length}명 전원 숙제완료`}
                </button>
              </div>
              {checkedStudents.length > 0 && (
                <div className={styles.bulkInline}>
                  <strong>{checkedStudents.length}명 상세 일괄 적용:</strong>
                  <StatusButtons
                    label="일괄 출석"
                    values={attendance}
                    displayLabels={['출석', '지각', '결석']}
                    value={bulkAttendance}
                    onChange={value => setBulkAttendance(value as Attendance)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      checkedStudents.forEach(s => edit(s.id, r => ({ ...r, daily: { ...r.daily, attendance: bulkAttendance } })))
                    }
                  >
                    출결 적용
                  </button>
                  <StatusButtons
                    label="일괄 숙제"
                    values={['O', '△', 'X']}
                    displayLabels={['O 완료', '△ 일부', 'X 미완료']}
                    value={bulkHomework}
                    onChange={value => setBulkHomework(value as typeof bulkHomework)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      checkedStudents.forEach(s => edit(s.id, r => ({ ...r, wrong: { ...r.wrong, homework_status: bulkHomework } })))
                    }
                  >
                    숙제 적용
                  </button>
                  <input
                    aria-label="일괄 전체 오답"
                    type="number"
                    min="0"
                    style={{ width: '56px' }}
                    value={bulkTotal}
                    onChange={e => setBulkTotal(Number(e.target.value))}
                  />
                  <span>중</span>
                  <input
                    aria-label="일괄 완료 오답"
                    type="number"
                    min="0"
                    max={bulkTotal}
                    style={{ width: '56px' }}
                    value={bulkDone}
                    onChange={e => setBulkDone(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    disabled={!Number.isInteger(bulkTotal) || !Number.isInteger(bulkDone) || bulkTotal < bulkDone || bulkDone < 0}
                    onClick={() =>
                      checkedStudents.forEach(s => edit(s.id, r => ({ ...r, wrong: { ...r.wrong, total_wrong: bulkTotal, corrected_count: bulkDone } })))
                    }
                  >
                    오답 적용
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '38px' }}>
                    <input
                      className={styles.check}
                      type="checkbox"
                      aria-label="보이는 학생 전체 선택"
                      checked={students.length > 0 && students.every(s => checked.includes(s.id))}
                      ref={input => {
                        if (input) input.indeterminate = students.some(s => checked.includes(s.id)) && !students.every(s => checked.includes(s.id));
                      }}
                      onChange={e => setChecked(e.target.checked ? students.map(s => s.id) : [])}
                    />
                  </th>
                  <th style={{ width: '130px' }}>학생</th>
                  <th style={{ width: '185px' }}>출결 상태</th>
                  <th style={{ width: '215px' }}>숙제 검사</th>
                  <th style={{ width: '290px' }}>오답 클리닉 (전체 / 수정)</th>
                  <th>출결 사유 · 수업 특이사항</th>
                  <th>오답 · 숙제 코멘트</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const r = rows[s.id];
                  if (!r) return null;
                  const complete =
                    r.daily.attendance === '출석' &&
                    (r.wrong.completed || wrongAnswerStatus(r.wrong.total_wrong, r.wrong.corrected_count) === '○') &&
                    r.wrong.homework_status === 'O';
                  const isDoneWrong = r.wrong.completed || (r.wrong.total_wrong > 0 && r.wrong.corrected_count === r.wrong.total_wrong);
                  return (
                    <tr key={s.id} data-complete={!!complete}>
                      <td>
                        <input
                          className={styles.check}
                          type="checkbox"
                          aria-label={`${s.name} 일괄 편집 선택`}
                          checked={checked.includes(s.id)}
                          onChange={e => setChecked(ids => (e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id)))}
                        />
                      </td>
                      <td>
                        <div className={styles.studentNameCell}>
                          <strong>{s.name}</strong>
                          <small>
                            {s.grade}
                            {dirty.includes(s.id) ? <em className={styles.dirtyDot}> · 수정됨</em> : ''}
                          </small>
                        </div>
                      </td>
                      <td>
                        <StatusButtons
                          label={`${s.name} 출석`}
                          values={attendance}
                          displayLabels={['출석', '지각', '결석']}
                          value={r.daily.attendance}
                          onChange={value => edit(s.id, v => ({ ...v, daily: { ...v.daily, attendance: value as Attendance } }))}
                        />
                      </td>
                      <td>
                        <StatusButtons
                          label={`${s.name} 숙제`}
                          values={['O', '△', 'X']}
                          displayLabels={['O 완료', '△ 일부', 'X 미완료']}
                          value={r.wrong.homework_status ?? ''}
                          onChange={value => edit(s.id, v => ({ ...v, wrong: { ...v.wrong, homework_status: value as 'O' | '△' | 'X' } }))}
                        />
                      </td>
                      <td>
                        <div className={styles.wrongCounts}>
                          <input
                            type="number"
                            min="0"
                            data-count="total"
                            onKeyDown={moveCountFocus}
                            aria-label={`${s.name} 전체 오답`}
                            value={r.wrong.total_wrong}
                            onChange={e =>
                              edit(s.id, v => {
                                const total = Number(e.target.value);
                                return {
                                  ...v,
                                  wrong: { ...v.wrong, total_wrong: total, completed: total > 0 && v.wrong.corrected_count === total },
                                };
                              })
                            }
                          />
                          <span>문항 중</span>
                          <input
                            type="number"
                            min="0"
                            max={r.wrong.total_wrong}
                            data-count="done"
                            onKeyDown={moveCountFocus}
                            aria-label={`${s.name} 완료 오답`}
                            value={r.wrong.corrected_count}
                            onChange={e =>
                              edit(s.id, v => {
                                const count = Number(e.target.value);
                                return {
                                  ...v,
                                  wrong: { ...v.wrong, corrected_count: count, completed: v.wrong.total_wrong > 0 && count === v.wrong.total_wrong },
                                };
                              })
                            }
                          />
                          <span>수정</span>
                          <WrongStatus total={r.wrong.total_wrong} done={r.wrong.corrected_count} completed={r.wrong.completed} />
                          <button
                            type="button"
                            className={styles.completeWrong}
                            aria-label={`${s.name} 오답 완료`}
                            disabled={isDoneWrong || !Number.isInteger(r.wrong.total_wrong) || r.wrong.total_wrong <= 0}
                            onClick={() => completeWrongAnswers(s.id)}
                          >
                            <Check size={12} /> {isDoneWrong ? '완료됨' : '오답 완료'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.examTableInput}
                          aria-label={`${s.name} 출결 사유`}
                          value={r.daily.reason}
                          onChange={e => edit(s.id, v => ({ ...v, daily: { ...v.daily, reason: e.target.value } }))}
                          placeholder="지각·결석 사유 또는 수업 메모"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.examTableInput}
                          aria-label={`${s.name} 비고`}
                          value={r.wrong.memo}
                          onChange={e => edit(s.id, v => ({ ...v, wrong: { ...v.wrong, memo: e.target.value } }))}
                          placeholder="오답·숙제 코멘트 입력"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!students.length && <p className={styles.emptyNotice}>왼쪽 목록에서 반 또는 학생을 선택해 주세요.</p>}
          </div>
        </fieldset>
      )}
    </section>
  );
}
