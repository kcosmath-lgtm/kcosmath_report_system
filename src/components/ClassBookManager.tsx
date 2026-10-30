'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Check, Library, Search, Sparkles, Table, AlignLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { loadClassBooks, manageClassBook } from '../lib/report-storage';
import { PROGRESS_TEMPLATES } from '../constants/progressTemplates';
import { TEXTBOOK_CATALOG, formatUnitToTextLine, parseTextLineToUnit, type TextbookPreset } from '../constants/textbookCatalog';
import { totalBookProblems, totalBookTypes, unitProblemCount, type ClassBook, type ProgressUnit } from '../types/progress';
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
  const [unitsDraft, setUnitsDraft] = useState<ProgressUnit[]>([]);
  const [text, setText] = useState('');
  const [editorMode, setEditorMode] = useState<'table' | 'text'>('table');
  const [template, setTemplate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  // Catalog browser state
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogGrade, setCatalogGrade] = useState<'전체' | '중등' | '고등'>('전체');
  const [catalogCategory, setCatalogCategory] = useState<'전체' | '유형서' | '개념서' | '심화서'>('전체');
  const [catalogSeries, setCatalogSeries] = useState<string>('전체');
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);

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

  function syncTextFromUnits(nextUnits: ProgressUnit[]) {
    setUnitsDraft(nextUnits);
    setText(nextUnits.map(formatUnitToTextLine).join('\n'));
  }

  function syncUnitsFromText(rawText: string, baseUnits: ProgressUnit[]) {
    setText(rawText);
    const used = new Set<string>();
    const parsed = rawText
      .split('\n')
      .filter(l => l.trim())
      .map(line => parseTextLineToUnit(line, baseUnits, used));
    setUnitsDraft(parsed);
  }

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
    setUnitsDraft(b.units);
    setText(b.units.map(formatUnitToTextLine).join('\n'));
    setEditorMode(b.units.some(u => u.start_page || u.problem_count) ? 'table' : 'table');
    setShowCatalog(false);
    setMessage('');
  }

  function applyPresetToEditor(preset: TextbookPreset) {
    const base = editing ?? {
      id: crypto.randomUUID(),
      class_id: classId,
      title: preset.title,
      curriculum: preset.curriculum,
      course: preset.course,
      units: [],
      total_pages: preset.total_pages,
      version: 0,
    };
    const nextUnits: ProgressUnit[] = preset.units.map(u => ({
      id: crypto.randomUUID(),
      group: u.group,
      name: u.name,
      start_page: u.start_page,
      end_page: u.end_page,
      start_problem: u.start_problem,
      end_problem: u.end_problem,
      problem_count: u.problem_count,
      type_count: u.type_count,
      step_detail: u.step_detail,
    }));
    setEditing({ ...base, title: preset.title, curriculum: preset.curriculum, course: preset.course, total_pages: preset.total_pages, units: nextUnits });
    setTitle(preset.title);
    setPages(preset.total_pages);
    syncTextFromUnits(nextUnits);
    setEditorMode('table');
    setShowCatalog(false);
    setMessage(`'${preset.title}'의 단원·페이지·문항 수 데이터를 불러왔습니다. 확인 후 [교재 저장]을 눌러주세요.`);
  }

  async function quickRegisterPreset(preset: TextbookPreset) {
    if (!classId) return;
    if (books.some(b => b.title === preset.title)) {
      setMessage(`이미 이 반에 '${preset.title}' 교재가 등록되어 있습니다.`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const nextBook: ClassBook = {
        id: crypto.randomUUID(),
        class_id: classId,
        title: preset.title,
        curriculum: preset.curriculum,
        course: preset.course,
        total_pages: preset.total_pages,
        version: 0,
        units: preset.units.map(u => ({
          id: crypto.randomUUID(),
          group: u.group,
          name: u.name,
          start_page: u.start_page,
          end_page: u.end_page,
          start_problem: u.start_problem,
          end_problem: u.end_problem,
          problem_count: u.problem_count,
          type_count: u.type_count,
          step_detail: u.step_detail,
        })),
      };
      await manageClassBook('save', nextBook);
      setRevision(v => v + 1);
      onChanged();
      setMessage(`'${preset.title}' (${preset.total_pages}p · ${totalBookProblems(nextBook).toLocaleString()}문항) 교재를 반 교재로 즉시 등록했습니다.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '교재를 등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function updateUnitRow(index: number, patch: Partial<ProgressUnit>) {
    const next = unitsDraft.map((u, i) => {
      if (i !== index) return u;
      const merged = { ...u, ...patch };
      if (
        (patch.start_problem !== undefined || patch.end_problem !== undefined) &&
        merged.start_problem &&
        merged.end_problem &&
        merged.end_problem >= merged.start_problem
      ) {
        merged.problem_count = merged.end_problem - merged.start_problem + 1;
      }
      return merged;
    });
    syncTextFromUnits(next);
  }

  function addUnitRow() {
    const last = unitsDraft.at(-1);
    const nextStartPage = last?.end_page ? last.end_page + 1 : undefined;
    const nextEndPage = nextStartPage ? nextStartPage + 15 : undefined;
    const nextUnit: ProgressUnit = {
      id: crypto.randomUUID(),
      group: last?.group ?? '',
      name: `${String(unitsDraft.length + 1).padStart(2, '0')}. 새 단원`,
      ...(nextStartPage ? { start_page: nextStartPage, end_page: nextEndPage } : {}),
    };
    const next = [...unitsDraft, nextUnit];
    syncTextFromUnits(next);
    if (nextEndPage && nextEndPage > pages) setPages(nextEndPage);
  }

  function removeUnitRow(index: number) {
    const next = unitsDraft.filter((_, i) => i !== index);
    syncTextFromUnits(next);
  }

  function recalculateSequentialProblems() {
    let cursor = 1;
    const next = unitsDraft.map(u => {
      const cnt = unitProblemCount(u);
      if (cnt <= 0) return u;
      const start_problem = cursor;
      const end_problem = cursor + cnt - 1;
      cursor += cnt;
      return { ...u, start_problem, end_problem, problem_count: cnt };
    });
    syncTextFromUnits(next);
  }

  async function save() {
    if (!editing) return;
    const finalUnits =
      editorMode === 'text'
        ? (() => {
            const used = new Set<string>();
            return text
              .split('\n')
              .filter(l => l.trim())
              .map(line => parseTextLineToUnit(line, editing.units, used));
          })()
        : unitsDraft.filter(u => u.name.trim());

    const maxUnitEndPage = finalUnits.reduce((m, u) => Math.max(m, u.end_page ?? 0), 0);
    const finalPages = Math.max(pages || 0, maxUnitEndPage);

    setBusy(true);
    setMessage('');
    try {
      await manageClassBook('save', {
        ...editing,
        title: title.trim(),
        units: finalUnits,
        total_pages: finalPages,
      });
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

  const seriesList = ['전체', ...Array.from(new Set(TEXTBOOK_CATALOG.map(item => item.series)))];
  const filteredCatalog = TEXTBOOK_CATALOG.filter(item => {
    if (catalogGrade !== '전체' && item.gradeGroup !== catalogGrade) return false;
    if (catalogCategory !== '전체' && item.category !== catalogCategory) return false;
    if (catalogSeries !== '전체' && item.series !== catalogSeries) return false;
    if (catalogSearch.trim()) {
      const q = catalogSearch.trim().toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.series.toLowerCase().includes(q) ||
        item.course.toLowerCase().includes(q) ||
        item.publisher.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const draftTotalProblems = totalBookProblems({ units: unitsDraft });
  const draftTotalTypes = totalBookTypes({ units: unitsDraft });

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
          <div className={styles.bookTopActions}>
            <button
              type="button"
              className={showCatalog ? styles.secondaryBtn : styles.catalogToggleBtn}
              disabled={busy || loading || !classId}
              onClick={() => setShowCatalog(v => !v)}
            >
              <Library size={15} /> {showCatalog ? '시중 교재 카탈로그 닫기' : '시중 교재(쎈·개념원리 등) 불러오기'}
            </button>
            <button type="button" className={styles.primaryBtn} disabled={busy || loading || !classId} onClick={() => edit()}>
              <Plus size={15} /> 새 반 교재 직접 등록
            </button>
          </div>
        )}
      </div>

      <p className={styles.helperText}>
        시중 교재(쎈, 개념원리, RPM, 라이트쎈, 마플시너지, 일품 등)의 실제 단원별 페이지·문항 수·유형 수를 불러와 반 교재로 등록하면, 진도 관리에서 페이지·문항 번호만 입력해도 단원과 문제 수가 자동 계산됩니다.
      </p>

      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}

      {/* 시중 교재 카탈로그 브라우저 */}
      {showCatalog && !editing && (
        <div className={styles.catalogPanel} aria-label="시중 교재 카탈로그">
          <div className={styles.catalogHeader}>
            <div>
              <h4>
                <Sparkles size={15} /> 시중 대표 수학 교재 카탈로그 ({filteredCatalog.length}종)
              </h4>
              <p>단원별 시작~끝 페이지, 문항 번호 범위, 총 문항 수, 대표 유형 수가 모두 입력되어 있습니다.</p>
            </div>
            <div className={styles.catalogSearchBox}>
              <Search size={14} />
              <input
                type="search"
                aria-label="시중 교재 검색"
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                placeholder="교재명·과정 검색 (예: 쎈 2-1, 공통수학1, RPM)"
              />
            </div>
          </div>

          <div className={styles.catalogFilterRow}>
            <div className={styles.catalogFilterGroup}>
              <span>학교급</span>
              {(['전체', '중등', '고등'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  data-active={catalogGrade === g || undefined}
                  onClick={() => setCatalogGrade(g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className={styles.catalogFilterGroup}>
              <span>교재 분류</span>
              {(['전체', '유형서', '개념서', '심화서'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  data-active={catalogCategory === cat || undefined}
                  onClick={() => setCatalogCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className={styles.catalogFilterGroup}>
              <span>시리즈</span>
              {seriesList.map(s => (
                <button
                  key={s}
                  type="button"
                  data-active={catalogSeries === s || undefined}
                  onClick={() => setCatalogSeries(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.catalogGrid}>
            {filteredCatalog.map(preset => {
              const totalProbs = preset.units.reduce((sum, u) => sum + u.problem_count, 0);
              const totalTypes = preset.units.reduce((sum, u) => sum + (u.type_count ?? 0), 0);
              const alreadyAdded = books.some(b => b.title === preset.title);
              return (
                <div key={preset.id} className={styles.catalogCard}>
                  <div className={styles.catalogCardTop}>
                    <span className={styles.catalogCategoryBadge} data-category={preset.category}>
                      {preset.category}
                    </span>
                    <span className={styles.catalogCourseBadge}>
                      {preset.course} · {preset.publisher}
                    </span>
                  </div>
                  <strong className={styles.catalogCardTitle}>{preset.title}</strong>
                  <p className={styles.catalogCardDesc}>{preset.description}</p>
                  <div className={styles.catalogSpecPills}>
                    <span>총 {preset.total_pages}p</span>
                    <span>{totalProbs.toLocaleString()}문항</span>
                    {totalTypes > 0 && <span>{totalTypes}개 유형</span>}
                    <span>{preset.units.length}개 단원</span>
                  </div>
                  <div className={styles.catalogCardActions}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={busy || alreadyAdded}
                      onClick={() => void quickRegisterPreset(preset)}
                    >
                      <Plus size={14} /> {alreadyAdded ? '등록 완료' : '반 교재로 즉시 추가'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      disabled={busy}
                      onClick={() => applyPresetToEditor(preset)}
                    >
                      <Pencil size={13} /> 편집 후 등록
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!editing && (
        <div className={styles.bookListWrap}>
          {loading ? (
            <p className={styles.loadingState}>교재 목록을 불러오는 중…</p>
          ) : books.length === 0 ? (
            <p className={styles.emptyNotice}>
              등록된 반 교재가 없습니다. 상단의 <b>시중 교재(쎈·개념원리 등) 불러오기</b> 또는 <b>+ 새 반 교재 직접 등록</b>을 눌러 추가하세요.
            </p>
          ) : (
            books.map(b => {
              const totalProbs = totalBookProblems(b);
              const totalTypes = totalBookTypes(b);
              const isExpanded = expandedBookId === b.id;
              return (
                <div className={styles.bookItemCard} key={b.id}>
                  <div className={styles.bookItem}>
                    <div className={styles.bookIcon}>
                      <BookOpen size={18} />
                    </div>
                    <div className={styles.bookMeta}>
                      <strong>{b.title}</strong>
                      <small>
                        {b.course ? `${b.course} · ` : ''}
                        {b.total_pages ? `총 ${b.total_pages}페이지` : '페이지 미등록'}
                        {totalProbs > 0 ? ` · 총 ${totalProbs.toLocaleString()}문항` : ''}
                        {totalTypes > 0 ? ` · ${totalTypes}개 유형` : ''} · {b.units.length}개 단원
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setExpandedBookId(isExpanded ? null : b.id)}
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} 단원·문항표
                    </button>
                    <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => edit(b)}>
                      <Pencil size={13} /> 편집
                    </button>
                    <button type="button" className={styles.dangerBtn} disabled={busy} onClick={() => void remove(b)}>
                      <Trash2 size={13} /> 삭제
                    </button>
                  </div>
                  {isExpanded && (
                    <div className={styles.bookUnitPreviewWrap}>
                      <table className={styles.bookUnitPreviewTable}>
                        <thead>
                          <tr>
                            <th>대단원</th>
                            <th>중단원명</th>
                            <th>페이지 범위</th>
                            <th>문항 번호</th>
                            <th>문항 수</th>
                            <th>유형 수</th>
                            <th>구성 단계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.units.map(u => {
                            const cnt = unitProblemCount(u);
                            return (
                              <tr key={u.id}>
                                <td>{u.group || '—'}</td>
                                <td><strong>{u.name}</strong></td>
                                <td>{u.start_page && u.end_page ? `p.${u.start_page} ~ ${u.end_page}` : '—'}</td>
                                <td>{u.start_problem && u.end_problem ? `${u.start_problem}번 ~ ${u.end_problem}번` : '—'}</td>
                                <td>{cnt > 0 ? `${cnt}문항` : '—'}</td>
                                <td>{u.type_count ? `${u.type_count}유형` : '—'}</td>
                                <td>{u.step_detail || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
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
                <input required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 쎈 중등 수학 2-1" />
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
                  placeholder="예: 216"
                />
              </label>
            </div>

            <div className={styles.templateRow}>
              <label style={{ flex: 1 }}>
                시중 교재 프리셋 불러오기 (단원 · 페이지 · 문항수 자동 입력)
                <select
                  defaultValue=""
                  onChange={e => {
                    const found = TEXTBOOK_CATALOG.find(item => item.id === e.target.value);
                    if (found) applyPresetToEditor(found);
                  }}
                >
                  <option value="">시중 교재 선택 (쎈, 개념원리, RPM, 라이트쎈, 마플시너지, 일품…)</option>
                  {TEXTBOOK_CATALOG.map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.category}] {item.title} ({item.total_pages}p · {item.units.reduce((s, u) => s + u.problem_count, 0)}문항)
                    </option>
                  ))}
                </select>
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
                  const nextUnits: ProgressUnit[] = t.units.map(u => ({
                    id: crypto.randomUUID(),
                    group: u.group,
                    name: u.name,
                  }));
                  syncTextFromUnits(nextUnits);
                  setEditing({ ...editing, curriculum: t.curriculum, course: t.label, units: nextUnits });
                }}
              >
                목차 자동 채우기
              </button>
            </div>

            <div className={styles.editorModeBar}>
              <div className={styles.editorSummaryBadges}>
                <span>단원 <b>{unitsDraft.length}개</b></span>
                <span>총 문항 <b>{draftTotalProblems.toLocaleString()}문항</b></span>
                {draftTotalTypes > 0 && <span>총 유형 <b>{draftTotalTypes}개</b></span>}
              </div>
              <div className={styles.editorModeButtons}>
                <button
                  type="button"
                  className={editorMode === 'table' ? styles.primaryActionBtn : styles.secondaryActionBtn}
                  onClick={() => setEditorMode('table')}
                >
                  <Table size={13} /> 단원별 페이지·문항 표 편집
                </button>
                <button
                  type="button"
                  className={editorMode === 'text' ? styles.primaryActionBtn : styles.secondaryActionBtn}
                  onClick={() => setEditorMode('text')}
                >
                  <AlignLeft size={13} /> 텍스트 일괄 편집
                </button>
              </div>
            </div>

            {editorMode === 'table' && (
              <div className={styles.unitTableEditorWrap}>
                <div className={styles.unitTableHelperBar}>
                  <span>단원별 시작·끝 페이지와 문항 수(또는 시작~끝 문항 번호)를 입력하면 진도 관리에서 자동 계산됩니다.</span>
                  <div className={styles.unitTableHelperBtns}>
                    <button type="button" className={styles.secondaryActionBtn} onClick={recalculateSequentialProblems}>
                      1번부터 연속 문항번호 자동 채우기
                    </button>
                    <button type="button" className={styles.secondaryActionBtn} onClick={addUnitRow}>
                      <Plus size={12} /> 단원 행 추가
                    </button>
                  </div>
                </div>
                {unitsDraft.length > 0 && (
                  <div className={styles.unitEditTableScroll}>
                    <table className={styles.unitEditTable}>
                      <thead>
                        <tr>
                          <th style={{ width: '150px' }}>대단원</th>
                          <th>중단원명</th>
                          <th style={{ width: '68px' }}>시작p</th>
                          <th style={{ width: '68px' }}>끝p</th>
                          <th style={{ width: '74px' }}>시작번</th>
                          <th style={{ width: '74px' }}>끝번</th>
                          <th style={{ width: '74px' }}>문항수</th>
                          <th style={{ width: '68px' }}>유형수</th>
                          <th style={{ width: '150px' }}>단계 구성 (예: A·B·C단계)</th>
                          <th style={{ width: '48px' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitsDraft.map((u, idx) => (
                          <tr key={u.id}>
                            <td>
                              <input
                                type="text"
                                value={u.group}
                                onChange={e => updateUnitRow(idx, { group: e.target.value })}
                                placeholder="예: I. 수와 식"
                                aria-label={`${idx + 1}단원 대단원`}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                required
                                value={u.name}
                                onChange={e => updateUnitRow(idx, { name: e.target.value })}
                                placeholder="예: 01. 유리수와 순환소수"
                                aria-label={`${idx + 1}단원 중단원명`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={u.start_page ?? ''}
                                onChange={e => updateUnitRow(idx, { start_page: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="8"
                                aria-label={`${idx + 1}단원 시작 페이지`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={u.end_page ?? ''}
                                onChange={e => {
                                  const endP = e.target.value ? Number(e.target.value) : undefined;
                                  updateUnitRow(idx, { end_page: endP });
                                  if (endP && endP > pages) setPages(endP);
                                }}
                                placeholder="25"
                                aria-label={`${idx + 1}단원 끝 페이지`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={u.start_problem ?? ''}
                                onChange={e => updateUnitRow(idx, { start_problem: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="1"
                                aria-label={`${idx + 1}단원 시작 문항번호`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={u.end_problem ?? ''}
                                onChange={e => updateUnitRow(idx, { end_problem: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="132"
                                aria-label={`${idx + 1}단원 끝 문항번호`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={u.problem_count ?? ''}
                                onChange={e => updateUnitRow(idx, { problem_count: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="132"
                                aria-label={`${idx + 1}단원 문항수`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={u.type_count ?? ''}
                                onChange={e => updateUnitRow(idx, { type_count: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="18"
                                aria-label={`${idx + 1}단원 유형수`}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={u.step_detail ?? ''}
                                onChange={e => updateUnitRow(idx, { step_detail: e.target.value || undefined })}
                                placeholder="A·B·C단계"
                                aria-label={`${idx + 1}단원 단계 구성`}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.unitDeleteRowBtn}
                                onClick={() => removeUnitRow(idx)}
                                aria-label={`${idx + 1}단원 삭제`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <label style={{ display: editorMode === 'text' || unitsDraft.length === 0 ? 'flex' : 'none' }}>
              단원 목차 (한 줄에 한 단원, &ldquo;대단원 &gt; 소단원 | p.8~25 | #1~132 | 132문항 | 18유형&rdquo; 형식 지원)
              <textarea
                rows={8}
                required={unitsDraft.length === 0}
                value={text}
                onChange={e => syncUnitsFromText(e.target.value, editing.units)}
                placeholder="I. 수와 식의 계산 > 01. 유리수와 순환소수 | p.8~25 | #1~132 | 132문항 | 18유형"
              />
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
