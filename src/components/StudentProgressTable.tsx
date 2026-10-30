'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Calendar, Check, History, ListChecks, RotateCcw, Save } from 'lucide-react';
import { loadClassBooks, loadProgress, manageClassBook, saveProgressBatch } from '../lib/report-storage';
import {
  completedBookProblems,
  progressPercent,
  resolveRangeSummary,
  syncUnitStatesFromPage,
  totalBookProblems,
  type ClassBook,
  type ProgressBook,
  type ProgressEntry,
} from '../types/progress';
import type { StudentGroup } from '../types/student';
import ProgressDialog from './ProgressDialog';
import ProgressUnitEditor from './ProgressUnitEditor';
import ClassBookManager from './ClassBookManager';
import styles from './student-progress.module.css';

type Saved = { book: ProgressBook; entry: ProgressEntry };
type RowHandle = {
  dirty: boolean;
  ready: boolean;
  book?: ProgressBook;
  scope: string;
  homework: string;
  feedback: string;
  entries: ProgressEntry[];
  patch: (value: { book?: ProgressBook; scope?: string; homework?: string; feedback?: string }) => void;
  accept: (saved: Saved) => void;
};
type Student = StudentGroup['students'][number];

function ProgressRow({
  student,
  checked,
  onToggleCheck,
  date,
  revision,
  catalog,
  onDirty,
  register,
  saving,
  onUnits,
  onHistory,
}: {
  student: Student;
  checked: boolean;
  onToggleCheck: (checked: boolean) => void;
  date: string;
  revision: number;
  catalog: ClassBook[];
  onDirty: (id: string, value: boolean) => void;
  register: (id: string, value: RowHandle | null) => void;
  saving: boolean;
  onUnits: (id: string) => void;
  onHistory: (id: string) => void;
}) {
  const [books, setBooks] = useState<ProgressBook[]>([]);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [bookId, setBookId] = useState('');
  const [draft, setDraft] = useState<ProgressBook | null>(null);
  const [scope, setScope] = useState('');
  const [homework, setHomework] = useState('');
  const [feedbackDraft, setFeedback] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    onDirty(student.id, dirty || busy);
  }, [onDirty, student.id, dirty, busy]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setFailed(false);
      }
    });
    loadProgress(student.id)
      .then(data => {
        if (cancelled) return;
        setBooks(data.books);
        setEntries(data.entries);
        setBookId(id => (data.books.some(b => b.id === id) ? id : data.books[0]?.id ?? ''));
        setDraft(null);
      })
      .catch(e => {
        if (!cancelled) {
          setFailed(true);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [student.id, revision, reload]);

  const todayEntry = [...entries]
    .filter(e => e.book_id === bookId && e.record_date === date)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const lastEntryWithHomework = [...entries]
    .filter(e => e.book_id === bookId && e.homework)
    .sort((a, b) => b.record_date.localeCompare(a.record_date) || b.created_at.localeCompare(a.created_at))[0];

  const lastEntryWithScope = [...entries]
    .filter(e => e.book_id === bookId && e.scope)
    .sort((a, b) => b.record_date.localeCompare(a.record_date) || b.created_at.localeCompare(a.created_at))[0];

  const feedback = feedbackDraft ?? todayEntry?.memo ?? '';
  const book = draft ?? books.find(b => b.id === bookId);
  const locked = saving || busy || loading || failed;

  useEffect(() => {
    register(student.id, {
      dirty,
      ready: !locked,
      book,
      scope,
      homework,
      feedback,
      entries,
      patch: value => {
        if (value.book) {
          setBooks(current => (current.some(b => b.id === value.book!.id) ? current : [...current, value.book!]));
          setBookId(value.book.id);
          setDraft(value.book);
        }
        if (value.scope !== undefined) setScope(value.scope);
        if (value.homework !== undefined) setHomework(value.homework);
        if (value.feedback !== undefined) setFeedback(value.feedback);
        setDirty(true);
      },
      accept: saved => {
        setBooks(current => current.map(b => (b.id === saved.book.id ? saved.book : b)));
        setDraft(null);
        setEntries(current => [saved.entry, ...current]);
        setDirty(false);
        setScope('');
        setHomework('');
        setFeedback(null);
        setMessage('');
      },
    });
    return () => register(student.id, null);
  }, [register, student.id, dirty, locked, book, scope, homework, feedback, entries]);

  async function choose(value: string) {
    if (value.startsWith('assigned:')) {
      setBookId(value.slice(9));
      setDraft(null);
      return;
    }
    const template = catalog.find(b => b.id === value);
    if (!template) return;
    setBusy(true);
    setMessage('');
    try {
      const assigned = (await manageClassBook('assign', template, [student.id])) as ProgressBook[];
      const b = assigned[0];
      setBooks(current => (current.some(x => x.id === b.id) ? current : [...current, b]));
      setBookId(b.id);
      setDraft(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '교재 연결 실패');
    } finally {
      setBusy(false);
    }
  }

  const pct = book ? progressPercent(book) : 0;
  const totalProbs = book ? totalBookProblems(book) : 0;
  const doneProbs = book ? completedBookProblems(book) : 0;
  const activeUnitObjects = book?.units.filter(u => book.states[u.id] === '진행 중') ?? [];
  const activeUnits = activeUnitObjects.map(u => {
    const meta: string[] = [];
    if (u.start_page && u.end_page) meta.push(`p.${u.start_page}~${u.end_page}`);
    if (u.start_problem && u.end_problem) meta.push(`#${u.start_problem}~${u.end_problem}`);
    return meta.length > 0 ? `${u.name}(${meta.join('·')})` : u.name;
  });
  const doneUnitCount = book?.units.filter(u => book.states[u.id] === '완료').length ?? 0;

  function parseShorthand(raw: string) {
    if (!book) return null;
    const trimmed = raw.trim();
    const pageMatch = trimmed.match(/^(?:p\.?\s*)?(\d+)\s*[~-]\s*(\d+)\s*p?$/i);
    if (pageMatch) {
      return resolveRangeSummary(book.units, 'page', Number(pageMatch[1]), Number(pageMatch[2]));
    }
    const probMatch = trimmed.match(/^#\s*(\d+)\s*[~-]\s*(\d+)(?:번)?$/);
    if (probMatch) {
      return resolveRangeSummary(book.units, 'problem', Number(probMatch[1]), Number(probMatch[2]));
    }
    return null;
  }

  const scopeSuggestion = parseShorthand(scope);
  const homeworkSuggestion = parseShorthand(homework);

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          className={styles.check}
          checked={checked}
          onChange={e => onToggleCheck(e.target.checked)}
          aria-label={`${student.name} 진도 일괄 선택`}
        />
      </td>
      <td>
        <div className={styles.studentNameCell}>
          <strong>{student.name}</strong>
          <small>
            {student.grade}
            {dirty ? <em className={styles.dirtyDot}> · 수정됨</em> : ''}
          </small>
        </div>
      </td>
      <td>
        <select
          className={styles.bookSelect}
          aria-label={`${student.name} 교재`}
          value={bookId ? `assigned:${bookId}` : ''}
          disabled={locked || dirty}
          onChange={e => void choose(e.target.value)}
        >
          <option value="">교재 선택 · 연결</option>
          {books.map(b => (
            <option key={b.id} value={`assigned:${b.id}`}>
              {b.title}
            </option>
          ))}
          {catalog.filter(c => !books.some(b => b.library_id === c.id)).length > 0 && (
            <optgroup label="반 교재 새로 연결">
              {catalog
                .filter(c => !books.some(b => b.library_id === c.id))
                .map(c => (
                  <option key={c.id} value={c.id}>
                    + {c.title}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </td>
      <td>
        {book ? (
          <div className={styles.progressCell}>
            <div className={styles.progressTop}>
              <div className={styles.progressBarTrack}>
                <div className={styles.progressBarFill} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
              <strong className={styles.progressPctText}>{pct}%</strong>
            </div>
            <div className={styles.progressSubControls}>
              {book.total_pages ? (
                <div className={styles.inlinePageBox}>
                  <input
                    type="number"
                    min={0}
                    max={book.total_pages}
                    disabled={locked}
                    aria-label={`${student.name} 완료 페이지`}
                    value={book.completed_page ?? 0}
                    onChange={e => {
                      const nextPage = Math.max(0, Math.min(book.total_pages!, Number(e.target.value) || 0));
                      const nextStates = syncUnitStatesFromPage(book.units, book.states, nextPage);
                      setDraft({ ...book, completed_page: nextPage, states: nextStates });
                      setDirty(true);
                    }}
                  />
                  <span>/{book.total_pages}p</span>
                </div>
              ) : null}
              <button
                type="button"
                className={styles.unitCheckBtn}
                disabled={locked}
                onClick={() => onUnits(student.id)}
                title="단원별 미시작 / 진행 중 / 완료 상태 변경"
              >
                <ListChecks size={12} /> 단원 ({doneUnitCount}/{book.units.length})
              </button>
              {totalProbs > 0 && (
                <span className={styles.problemProgressPill} title="완료 문항 수 / 교재 총 문항 수 (추정)">
                  {doneProbs.toLocaleString()}/{totalProbs.toLocaleString()}문항
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className={styles.noBookText}>교재를 먼저 선택하세요</span>
        )}
      </td>
      <td>
        <div className={styles.fieldStack}>
          <input
            type="text"
            className={styles.tableInput}
            disabled={locked || !book}
            aria-label={`${student.name} 오늘 진도 범위`}
            value={scope}
            onChange={e => {
              setScope(e.target.value);
              setDirty(true);
            }}
            placeholder={book ? '예: 26~41 또는 #133~250 입력 시 자동 변환' : '교재 연결 필요'}
          />
          {scopeSuggestion && scopeSuggestion.label !== scope && (
            <button
              type="button"
              className={styles.shorthandSuggestBtn}
              onClick={() => {
                setScope(scopeSuggestion.label);
                if (book && scopeSuggestion.endPage) {
                  const clamped = book.total_pages ? Math.min(book.total_pages, scopeSuggestion.endPage) : scopeSuggestion.endPage;
                  const nextStates = syncUnitStatesFromPage(book.units, book.states, clamped);
                  setDraft({ ...book, completed_page: clamped, states: nextStates });
                }
                setDirty(true);
              }}
            >
              자동완성: {scopeSuggestion.label}
            </button>
          )}
          {book && (
            <small className={styles.prevHint}>
              {activeUnits.length > 0
                ? `진행단원: ${activeUnits.slice(0, 2).join(', ')}${activeUnits.length > 2 ? ' 외' : ''}`
                : lastEntryWithScope
                  ? `직전 진도: ${lastEntryWithScope.scope}`
                  : '기록된 직전 진도 없음'}
            </small>
          )}
        </div>
      </td>
      <td>
        <div className={styles.fieldStack}>
          <input
            type="text"
            className={styles.tableInput}
            disabled={locked || !book}
            aria-label={`${student.name} 오늘 내줄 숙제`}
            value={homework}
            onChange={e => {
              setHomework(e.target.value);
              setDirty(true);
            }}
            placeholder={book ? '예: 26~35 또는 #133~200 입력 시 자동 변환' : '교재 연결 필요'}
          />
          {homeworkSuggestion && homeworkSuggestion.label !== homework && (
            <button
              type="button"
              className={styles.shorthandSuggestBtn}
              onClick={() => {
                setHomework(homeworkSuggestion.label);
                setDirty(true);
              }}
            >
              자동완성: {homeworkSuggestion.label}
            </button>
          )}
          {book && (
            <small className={styles.prevHint}>
              {lastEntryWithHomework ? `직전 과제: ${lastEntryWithHomework.homework}` : '기록된 직전 과제 없음'}
            </small>
          )}
        </div>
      </td>
      <td>
        <input
          type="text"
          className={styles.tableInput}
          disabled={locked || !book}
          aria-label={`${student.name} 수업 피드백`}
          value={feedback}
          onChange={e => {
            setFeedback(e.target.value);
            setDirty(true);
          }}
          placeholder={book ? '진도 이해도·피드백 코멘트' : '교재 연결 필요'}
        />
      </td>
      <td>
        <div className={styles.rowActions}>
          <button type="button" className={styles.historyBtn} disabled={locked || !book} onClick={() => onHistory(student.id)} title="누적 진도 기록 보기">
            <History size={13} /> 이력
          </button>
          {dirty && (
            <button
              type="button"
              className={styles.resetBtn}
              disabled={locked}
              onClick={() => {
                setDraft(null);
                setScope('');
                setHomework('');
                setFeedback(null);
                setDirty(false);
              }}
              title="작성 취소"
            >
              <RotateCcw size={12} /> 취소
            </button>
          )}
          {failed && (
            <button type="button" onClick={() => setReload(v => v + 1)}>
              재시도
            </button>
          )}
        </div>
        {message && (
          <p role="alert" className={styles.rowError}>
            {message}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function StudentProgressTable({
  groups,
  studentIds,
  rosterRevision,
  onDirtyChange,
}: {
  groups: StudentGroup[];
  studentIds: string[];
  rosterRevision: number;
  onDirtyChange: (value: boolean) => void;
}) {
  const [dirtyRows, setDirtyRows] = useState<Record<string, boolean>>({});
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [catalog, setCatalog] = useState<ClassBook[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [manager, setManager] = useState(false);
  const [managerDirty, setManagerDirty] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [unitPopup, setUnitPopup] = useState<{ book: ProgressBook; ids: string[] } | null>(null);
  const [history, setHistory] = useState<{ book: ProgressBook; entries: ProgressEntry[] } | null>(null);
  const [bulkBook, setBulkBook] = useState('');
  const [bulkScope, setBulkScope] = useState('');
  const [bulkHomework, setBulkHomework] = useState('');
  const [bulkPage, setBulkPage] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');

  const handles = useRef<Record<string, RowHandle>>({});
  const register = useCallback((id: string, value: RowHandle | null) => {
    if (value) handles.current[id] = value;
    else delete handles.current[id];
  }, []);
  const onDirty = useCallback(
    (id: string, value: boolean) => setDirtyRows(current => (current[id] === value ? current : { ...current, [id]: value })),
    []
  );
  const changed = useCallback(() => setRevision(v => v + 1), []);

  const dirtyCount = Object.values(dirtyRows).filter(Boolean).length;
  const hasDirty = dirtyCount > 0 || managerDirty || saving;

  useEffect(() => {
    onDirtyChange(hasDirty);
  }, [hasDirty, onDirtyChange]);

  useEffect(() => {
    if (!hasDirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [hasDirty]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(groups.map(g => loadClassBooks(g.id)))
      .then(data => {
        if (!cancelled) {
          setCatalog(data.flat());
          setCatalogFailed(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setCatalogFailed(true);
          setMessage(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groups, revision]);

  const students = groups.flatMap(g => g.students).filter(s => studentIds.includes(s.id) || dirtyRows[s.id]);
  const checkedIds = students.filter(s => checked.includes(s.id)).map(s => s.id);
  const targetIds = checkedIds.length > 0 ? checkedIds : students.map(s => s.id);

  function targets(ids = targetIds) {
    const rows = ids.map(id => handles.current[id]);
    if (!rows.length || rows.some(r => !r?.ready)) {
      setMessage('선택한 학생의 교재와 기록을 먼저 불러와 주세요.');
      return null;
    }
    return rows;
  }

  function editUnits(ids: string[]) {
    const rows = targets(ids);
    if (!rows) return;
    const book = rows[0].book;
    if (
      !book ||
      rows.some(
        r => !r.book || JSON.stringify(r.book.units) !== JSON.stringify(book.units) || r.book.total_pages !== book.total_pages
      )
    ) {
      setMessage('일괄 단원 체크는 동일한 교재를 사용하는 학생들에게 적용할 수 있습니다.');
      return;
    }
    setUnitPopup({ book, ids: [...ids] });
  }

  async function applyUnifiedBulk() {
    const rows = targets(targetIds);
    if (!rows) return;

    let assignedMap: Record<string, ProgressBook> = {};
    if (bulkBook) {
      const template = catalog.find(b => b.id === bulkBook);
      if (!template) return;
      if (rows.some(r => r.dirty)) {
        setMessage('작성 중인 학생 기록을 먼저 저장하거나 취소한 뒤 교재를 일괄 변경해 주세요.');
        return;
      }
      setSaving(true);
      setMessage('');
      try {
        const books = (await manageClassBook('assign', template, targetIds)) as ProgressBook[];
        assignedMap = Object.fromEntries(books.map(b => [b.student_id, b]));
        books.forEach(b => handles.current[b.student_id]?.patch({ book: b }));
      } catch (e) {
        setMessage(e instanceof Error ? e.message : '교재 연결 실패');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    const hasTextOrPage =
      bulkScope.trim() !== '' || bulkHomework.trim() !== '' || bulkPage.trim() !== '' || bulkFeedback.trim() !== '';

    if (hasTextOrPage) {
      if (targetIds.some(id => !assignedMap[id] && !handles.current[id]?.book)) {
        setMessage('대상 학생 모두에게 교재를 먼저 연결해 주세요.');
        return;
      }
      if (
        bulkPage.trim() !== '' &&
        (targetIds.some(id => {
          const b = assignedMap[id] ?? handles.current[id]?.book;
          return !b?.total_pages || Number(bulkPage) > b.total_pages;
        }) ||
          !Number.isInteger(Number(bulkPage)) ||
          Number(bulkPage) < 0)
      ) {
        setMessage('선택한 교재의 총 페이지 범위 안에서 완료 페이지를 입력해 주세요.');
        return;
      }
      targetIds.forEach(id => {
        const r = handles.current[id];
        if (!r) return;
        const baseBook = assignedMap[id] ?? r.book!;
        const nextPatch: { book?: ProgressBook; scope?: string; homework?: string; feedback?: string } = {};

        const expandShorthand = (raw: string) => {
          const t = raw.trim();
          const pm = t.match(/^(?:p\.?\s*)?(\d+)\s*[~-]\s*(\d+)\s*p?$/i);
          if (pm) return resolveRangeSummary(baseBook.units, 'page', Number(pm[1]), Number(pm[2]));
          const prm = t.match(/^#\s*(\d+)\s*[~-]\s*(\d+)(?:번)?$/);
          if (prm) return resolveRangeSummary(baseBook.units, 'problem', Number(prm[1]), Number(prm[2]));
          return null;
        };

        let autoEndPage: number | undefined;
        if (bulkScope.trim()) {
          const resolved = expandShorthand(bulkScope);
          nextPatch.scope = resolved && resolved.matchedUnits.length > 0 ? resolved.label : bulkScope.trim();
          if (resolved?.endPage) autoEndPage = resolved.endPage;
        }
        if (bulkHomework.trim()) {
          const resolved = expandShorthand(bulkHomework);
          nextPatch.homework = resolved && resolved.matchedUnits.length > 0 ? resolved.label : bulkHomework.trim();
        }
        if (bulkFeedback.trim()) nextPatch.feedback = bulkFeedback.trim();
        const targetPage = bulkPage.trim() !== '' ? Number(bulkPage) : autoEndPage;
        if (targetPage !== undefined && (!baseBook.total_pages || targetPage <= baseBook.total_pages)) {
          const nextStates = syncUnitStatesFromPage(baseBook.units, baseBook.states, targetPage);
          nextPatch.book = { ...baseBook, completed_page: targetPage, states: nextStates };
        } else if (assignedMap[id]) {
          nextPatch.book = baseBook;
        }
        r.patch(nextPatch);
      });
    }

    setBulkBook('');
    setBulkScope('');
    setBulkHomework('');
    setBulkPage('');
    setBulkFeedback('');
    setMessage(`${targetIds.length}명에게 일괄 적용했습니다. 우측 상단의 [진도 기록 저장]을 눌러 저장하세요.`);
  }

  async function saveAll() {
    if (saving || manager || unitPopup || !date) return;
    const rows = Object.values(handles.current).filter(r => r.dirty);
    if (!rows.length) {
      setMessage('수정된 진도 기록이 없습니다.');
      return;
    }
    if (rows.some(r => !r.book || !r.ready)) {
      setMessage('교재와 기록을 모두 불러온 뒤 저장해 주세요.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const result = await saveProgressBatch(
        rows.map(r => ({
          book: r.book!,
          entry: {
            id: crypto.randomUUID(),
            book_id: r.book!.id,
            record_date: date,
            unit_ids: r.book!.units.filter(u => r.book!.states[u.id] === '진행 중').map(u => u.id),
            scope: r.scope,
            homework: r.homework,
            due_date: null,
            memo: r.feedback,
            states: r.book!.states,
            created_at: '',
          },
        }))
      );
      result.forEach(saved => rows.find(r => r.book?.id === saved.book.id)?.accept(saved));
      setMessage(`${result.length}명의 수업 진도 기록을 저장했습니다.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const unitEditor = unitPopup ? (
    <ProgressUnitEditor
      book={unitPopup.book}
      count={unitPopup.ids.length}
      scope={handles.current[unitPopup.ids[0]]?.scope}
      homework={handles.current[unitPopup.ids[0]]?.homework}
      feedback={handles.current[unitPopup.ids[0]]?.feedback}
      onFeedback={feedback => unitPopup.ids.forEach(id => handles.current[id]?.patch({ feedback }))}
      onDetails={
        unitPopup.ids.length === 1
          ? (scope, homework) => {
              handles.current[unitPopup.ids[0]]?.patch({ scope, homework });
            }
          : undefined
      }
      onCancel={() => setUnitPopup(null)}
      onApply={(states, page) => {
        unitPopup.ids.forEach(id => {
          const r = handles.current[id];
          if (r?.book) r.patch({ book: { ...r.book, states: { ...states }, completed_page: page } });
        });
        setUnitPopup(null);
      }}
    />
  ) : null;

  return (
    <section className={styles.panel} aria-label="학생 진도 관리">
      <div className={styles.toolbar}>
        <div>
          <h2>학생별 교재 · 진도 · 과제 관리</h2>
          <p>교재 진행률과 당일 진도 범위, 부여 과제, 수업 피드백을 표에서 바로 기록하고 보고서와 연동합니다.</p>
        </div>
        <div className={styles.kpiPills}>
          <span>대상 <b>{students.length}명</b></span>
          <span>등록 반 교재 <b>{catalog.length}권</b></span>
          <span>작성 중 <b>{dirtyCount}명</b></span>
        </div>
        <button type="button" className={styles.bookManageBtn} disabled={hasDirty || !groups.length} onClick={() => setManager(true)}>
          <BookOpen size={15} /> 반 교재 관리
        </button>
        <label className={styles.datePickerLabel}>
          <Calendar size={14} />
          <input
            type="date"
            aria-label="수업 기록 날짜"
            value={date}
            disabled={saving || dirtyCount > 0}
            onChange={e => setDate(e.target.value)}
          />
        </label>
        <button type="button" className={styles.saveBtn} disabled={saving || !date || dirtyCount === 0} onClick={() => void saveAll()}>
          <Save size={15} /> {saving ? '저장 중…' : '진도 기록 저장'}
        </button>
      </div>

      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}

      {!students.length ? (
        <p className={styles.emptyNotice}>왼쪽 목록에서 반 또는 학생을 선택해 주세요.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.progressTable}>
            <thead>
              <tr>
                <th style={{ width: '38px' }}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    aria-label="보이는 학생 전체 선택"
                    checked={students.length > 0 && students.every(s => checked.includes(s.id))}
                    ref={input => {
                      if (input) input.indeterminate = students.some(s => checked.includes(s.id)) && !students.every(s => checked.includes(s.id));
                    }}
                    onChange={e => setChecked(e.target.checked ? students.map(s => s.id) : [])}
                  />
                </th>
                <th style={{ width: '125px' }}>학생</th>
                <th style={{ width: '195px' }}>사용 교재</th>
                <th style={{ width: '215px' }}>진도율 · 페이지 · 단원</th>
                <th>오늘 진도 범위</th>
                <th>오늘 부여 과제</th>
                <th>수업 피드백 · 코멘트</th>
                <th style={{ width: '115px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.bulkTableRow}>
                <td>
                  <span className={styles.bulkRowDot} title="일괄 입력 행" />
                </td>
                <td>
                  <div className={styles.studentNameCell}>
                    <strong className={styles.bulkRowLabel}>공통 일괄 입력</strong>
                    <small>{checkedIds.length > 0 ? `선택 ${checkedIds.length}명 대상` : `전체 ${students.length}명 대상`}</small>
                  </div>
                </td>
                <td>
                  <select
                    aria-label="일괄 교재"
                    className={styles.bookSelect}
                    value={bulkBook}
                    disabled={saving || catalogFailed}
                    onChange={e => setBulkBook(e.target.value)}
                  >
                    <option value="">교재 일괄 변경 ({catalog.length}권)</option>
                    {catalog.map(c => (
                      <option key={c.id} value={c.id}>
                        {groups.find(g => g.id === c.class_id)?.group} · {c.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className={styles.progressSubControls}>
                    <div className={styles.inlinePageBox}>
                      <input
                        type="number"
                        aria-label="일괄 완료 페이지"
                        min={0}
                        value={bulkPage}
                        onChange={e => setBulkPage(e.target.value)}
                        placeholder="페이지"
                      />
                      <span>p</span>
                    </div>
                    <button
                      type="button"
                      className={styles.unitCheckBtn}
                      disabled={saving}
                      onClick={() => editUnits(targetIds)}
                      title="동일 교재 사용 학생 단원 일괄 체크"
                    >
                      <ListChecks size={12} /> 단원 일괄
                    </button>
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    className={styles.tableInput}
                    aria-label="일괄 진행 범위"
                    maxLength={2000}
                    value={bulkScope}
                    onChange={e => setBulkScope(e.target.value)}
                    placeholder="공통 진도 범위 (예: p.42~48)"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className={styles.tableInput}
                    aria-label="일괄 숙제"
                    maxLength={2000}
                    value={bulkHomework}
                    onChange={e => setBulkHomework(e.target.value)}
                    placeholder="공통 부여 과제 (예: 워크북 p.20~24)"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className={styles.tableInput}
                    aria-label="일괄 오늘의 피드백"
                    maxLength={2000}
                    value={bulkFeedback}
                    onChange={e => setBulkFeedback(e.target.value)}
                    placeholder="공통 수업 피드백 코멘트"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    disabled={
                      saving ||
                      (!bulkBook && !bulkScope.trim() && !bulkHomework.trim() && !bulkPage.trim() && !bulkFeedback.trim())
                    }
                    onClick={() => void applyUnifiedBulk()}
                  >
                    <Check size={13} /> 일괄 적용
                  </button>
                </td>
              </tr>
              {students.map(s => (
                <ProgressRow
                  key={s.id}
                  student={s}
                  checked={checked.includes(s.id)}
                  onToggleCheck={next => setChecked(ids => (next ? [...ids, s.id] : ids.filter(id => id !== s.id)))}
                  date={date}
                  revision={rosterRevision + revision}
                  catalog={catalog.filter(c => groups.find(g => g.students.some(x => x.id === s.id))?.id === c.class_id)}
                  onDirty={onDirty}
                  register={register}
                  saving={saving}
                  onUnits={id => editUnits([id])}
                  onHistory={id => {
                    const r = handles.current[id];
                    if (r?.book) setHistory({ book: r.book, entries: r.entries.filter(e => e.book_id === r.book!.id) });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manager && (
        <ProgressDialog title="반 교재 관리" locked={managerDirty} onClose={() => setManager(false)}>
          <ClassBookManager
            groups={groups}
            initialClassId={groups.find(g => g.students.some(s => studentIds.includes(s.id)))?.id ?? ''}
            onChanged={changed}
            onDirtyChange={setManagerDirty}
          />
        </ProgressDialog>
      )}

      {unitPopup && (
        <ProgressDialog title={unitPopup.ids.length > 1 ? '단원 일괄 체크' : '단원별 진도 상태 체크'} onClose={() => setUnitPopup(null)}>
          {unitEditor}
        </ProgressDialog>
      )}

      {history && (
        <ProgressDialog title={`${history.book.title} · 누적 수업 기록`} onClose={() => setHistory(null)}>
          <section className={styles.modalBody}>
            {history.entries.length === 0 ? (
              <p className={styles.emptyNotice}>저장된 진도 기록이 없습니다.</p>
            ) : (
              <div className={styles.historyList}>
                {history.entries
                  .sort((a, b) => b.record_date.localeCompare(a.record_date) || b.created_at.localeCompare(a.created_at))
                  .map(e => {
                    const snapPct = progressPercent({
                      units: e.units_snapshot ?? history.book.units,
                      states: e.states,
                      total_pages: e.total_pages_snapshot ?? 0,
                      completed_page: e.completed_page ?? 0,
                    });
                    return (
                      <div key={e.id} className={styles.historyCard}>
                        <div className={styles.historyCardHead}>
                          <strong>{e.record_date}</strong>
                          <span className={styles.historyPctBadge}>진도율 {snapPct}%</span>
                        </div>
                        <div className={styles.historyCardGrid}>
                          <div>
                            <small>진도 범위</small>
                            <p>{e.scope || '—'}</p>
                          </div>
                          <div>
                            <small>부여 과제</small>
                            <p>{e.homework || '—'}</p>
                          </div>
                        </div>
                        {e.memo && (
                          <div className={styles.historyMemo}>
                            <small>수업 피드백</small>
                            <p>{e.memo}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        </ProgressDialog>
      )}
    </section>
  );
}
