'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { loadClassBooks, manageClassBook } from '../lib/report-storage';
import { PROGRESS_TEMPLATES } from '../constants/progressTemplates';
import type { ClassBook } from '../types/progress';
import type { StudentGroup } from '../types/student';
import styles from './student-progress.module.css';

export default function ClassBookManager({
  groups,
  initialClassId,
  onChanged,
  onDirtyChange,
}: {
  groups: StudentGroup[];
  initialClassId: string;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [classId, setClassId] = useState(initialClassId || groups[0]?.id || '');
  const [books, setBooks] = useState<ClassBook[]>([]);
  const [editing, setEditing] = useState<ClassBook | null>(null);
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState(0);
  const [text, setText] = useState('');
  const [template, setTemplate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    onDirtyChange(!!editing || busy);
  }, [editing, busy, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    if (!classId) return;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    loadClassBooks(classId)
      .then(data => {
        if (!cancelled) setBooks(data);
      })
      .catch(e => {
        if (!cancelled) setMessage(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, revision]);

  function edit(book?: ClassBook) {
    const preset = PROGRESS_TEMPLATES[0];
    const b = book ?? {
      id: crypto.randomUUID(),
      class_id: classId,
      title: '',
      curriculum: preset.curriculum,
      course: preset.label,
      units: [],
      total_pages: 0,
      version: 0,
    };
    setEditing(b);
    setTitle(b.title);
    setPages(b.total_pages);
    setText(b.units.map(u => (u.group ? `${u.group} > ${u.name}` : u.name)).join('\n'));
    setMessage('');
  }

  async function save() {
    if (!editing) return;
    const used = new Set<string>();
    const units = text
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        const i = line.indexOf('>');
        const group = i < 0 ? '' : line.slice(0, i).trim();
        const name = i < 0 ? line.trim() : line.slice(i + 1).trim();
        const old = editing.units.find(u => u.group === group && u.name === name && !used.has(u.id));
        const id = old?.id ?? crypto.randomUUID();
        used.add(id);
        return { id, group, name };
      });
    setBusy(true);
    setMessage('');
    try {
      await manageClassBook('save', { ...editing, title: title.trim(), units, total_pages: pages });
      setEditing(null);
      setRevision(v => v + 1);
      onChanged();
      setMessage('반 교재를 저장했습니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(book: ClassBook) {
    if (!window.confirm(`${book.title}을 이 반의 교재 목록과 학생별 사용 교재에서 삭제할까요? 저장된 수업 이력은 보존됩니다.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await manageClassBook('delete', book);
      setRevision(v => v + 1);
      onChanged();
      setMessage('교재를 삭제했습니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.modalBody}>
      <div className={styles.bookManagerTop}>
        <label style={{ flex: 1 }}>
          관리할 반 선택
          <select aria-label="교재 관리 반" value={classId} disabled={busy || !!editing} onChange={e => setClassId(e.target.value)}>
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.group}
              </option>
            ))}
          </select>
        </label>
        {!editing && (
          <button type="button" className={styles.primaryBtn} disabled={busy || loading || !classId} onClick={() => edit()}>
            <Plus size={15} /> 새 반 교재 등록
          </button>
        )}
      </div>

      <p className={styles.helperText}>
        반 교재를 등록해 두면 진도 관리 표에서 학생들에게 한 번에 연결할 수 있습니다.
      </p>

      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}

      {!editing && (
        <div className={styles.bookListWrap}>
          {loading ? (
            <p className={styles.loadingState}>교재 목록을 불러오는 중…</p>
          ) : books.length === 0 ? (
            <p className={styles.emptyNotice}>등록된 반 교재가 없습니다. 우측 상단의 <b>+ 새 반 교재 등록</b>을 눌러 추가하세요.</p>
          ) : (
            books.map(b => (
              <div className={styles.bookItem} key={b.id}>
                <div className={styles.bookIcon}>
                  <BookOpen size={18} />
                </div>
                <div className={styles.bookMeta}>
                  <strong>{b.title}</strong>
                  <small>
                    {b.course ? `${b.course} · ` : ''}
                    {b.total_pages ? `총 ${b.total_pages}페이지` : '페이지 미등록'} · {b.units.length}개 단원
                  </small>
                </div>
                <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => edit(b)}>
                  <Pencil size={13} /> 편집
                </button>
                <button type="button" className={styles.dangerBtn} disabled={busy} onClick={() => void remove(b)}>
                  <Trash2 size={13} /> 삭제
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {editing && (
        <form
          className={styles.card}
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className={styles.formFieldset}>
            <div className={styles.columns}>
              <label>
                교재명
                <input required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 개념원리 중학수학 2-1" />
              </label>
              <label>
                총 페이지 수
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={pages || ''}
                  onChange={e => setPages(Number(e.target.value))}
                  placeholder="예: 240"
                />
              </label>
            </div>

            <div className={styles.templateRow}>
              <label style={{ flex: 1 }}>
                교과 과정 단원 템플릿 불러오기
                <select value={template} onChange={e => setTemplate(Number(e.target.value))}>
                  {PROGRESS_TEMPLATES.map((t, i) => (
                    <option key={t.id} value={i}>
                      {t.label} · {t.curriculum}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const t = PROGRESS_TEMPLATES[template];
                  setText(t.units.map(u => (u.group ? `${u.group} > ${u.name}` : u.name)).join('\n'));
                  setEditing({ ...editing, curriculum: t.curriculum, course: t.label });
                }}
              >
                목차 자동 채우기
              </button>
            </div>

            <label>
              단원 목차 (한 줄에 한 단원, &ldquo;대단원 &gt; 소단원&rdquo; 형식 지원)
              <textarea rows={8} required value={text} onChange={e => setText(e.target.value)} placeholder="I. 수와 식의 계산 > 1. 유리수와 순환소수" />
            </label>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setEditing(null)}>
                취소
              </button>
              <button type="submit" className={styles.primaryBtn}>
                <Check size={15} /> {busy ? '저장 중…' : '교재 저장'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
