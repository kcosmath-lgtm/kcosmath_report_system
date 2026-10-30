'use client';
import { useState } from 'react';
import { Calculator, Check, ListChecks } from 'lucide-react';
import {
  completedBookProblems,
  progressPercent,
  resolveRangeSummary,
  syncUnitStatesFromPage,
  totalBookProblems,
  totalBookTypes,
  unitProblemCount,
  type ProgressBook,
  type ProgressUnit,
  type UnitStatus,
} from '../types/progress';
import styles from './student-progress.module.css';

const UNIT_STATES: UnitStatus[] = ['미시작', '진행 중', '완료'];

function formatUnitScopeText(u: ProgressUnit): string {
  const parts: string[] = [u.name];
  if (u.start_page && u.end_page) parts.push(`p.${u.start_page}~${u.end_page}`);
  const cnt = unitProblemCount(u);
  if (u.start_problem && u.end_problem) {
    parts.push(`(${u.start_problem}~${u.end_problem}번${cnt > 0 ? `, ${cnt}문항` : ''})`);
  } else if (cnt > 0) {
    parts.push(`(${cnt}문항)`);
  }
  return parts.join(' ');
}

export default function ProgressUnitEditor({
  book,
  count,
  onApply,
  onCancel,
  scope = '',
  homework = '',
  feedback = '',
  onFeedback,
  onDetails,
}: {
  book: ProgressBook;
  count: number;
  onApply: (states: ProgressBook['states'], page: number) => void;
  onCancel: () => void;
  scope?: string;
  homework?: string;
  feedback?: string;
  onFeedback?: (feedback: string) => void;
  onDetails?: (scope: string, homework: string) => void;
}) {
  const [states, setStates] = useState(book.states);
  const [page, setPage] = useState(book.completed_page ?? 0);
  const [draftScope, setDraftScope] = useState(scope);
  const [draftHomework, setDraftHomework] = useState(homework);
  const [draftFeedback, setDraftFeedback] = useState(feedback);
  const [feedbackEdited, setFeedbackEdited] = useState(false);

  // Smart range calculator state
  const [rangeMode, setRangeMode] = useState<'page' | 'problem'>('page');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const currentPct = progressPercent({ ...book, states, completed_page: page });
  const totalProbs = totalBookProblems(book);
  const doneProbs = completedBookProblems({ ...book, states, completed_page: page });
  const totalTypes = totalBookTypes(book);
  const hasRichMeta = book.units.some(u => u.start_page || u.problem_count || u.start_problem);

  const rangePreview =
    rangeStart && rangeEnd
      ? resolveRangeSummary(book.units, rangeMode, Number(rangeStart), Number(rangeEnd))
      : null;

  function handlePageChange(nextPage: number) {
    const clamped = book.total_pages ? Math.max(0, Math.min(book.total_pages, nextPage)) : Math.max(0, nextPage);
    setPage(clamped);
    setStates(prev => syncUnitStatesFromPage(book.units, prev, clamped));
  }

  return (
    <form
      className={styles.modalBody}
      onSubmit={e => {
        e.preventDefault();
        onDetails?.(draftScope, draftHomework);
        if (feedbackEdited) onFeedback?.(draftFeedback);
        onApply(states, page);
      }}
    >
      <div className={styles.unitEditorHeader}>
        <div>
          <h4>{book.title}</h4>
          <p>
            {count}명의 단원별 진행 상태와 완료 페이지를 설정합니다.
            {totalProbs > 0 ? ` · 누적 약 ${doneProbs.toLocaleString()} / ${totalProbs.toLocaleString()}문항` : ''}
            {totalTypes > 0 ? ` · 총 ${totalTypes}개 유형` : ''}
          </p>
        </div>
        <div className={styles.unitEditorPct}>
          <span>예상 진도율</span>
          <strong>{currentPct}%</strong>
        </div>
      </div>

      {!!book.total_pages && (
        <div className={styles.unitPageRow}>
          <span>완료 페이지 (입력 시 단원 상태 자동 연동)</span>
          <div className={styles.pageInputGroup}>
            <input
              aria-label="완료 페이지"
              type="number"
              min={0}
              max={book.total_pages}
              required
              value={page}
              onChange={e => handlePageChange(Number(e.target.value))}
            />
            <span>/ {book.total_pages} 페이지</span>
          </div>
        </div>
      )}

      {onDetails && hasRichMeta && (
        <div className={styles.smartCalcBox}>
          <div className={styles.smartCalcTop}>
            <span className={styles.smartCalcTitle}>
              <Calculator size={14} /> 페이지·문항 번호로 진도/숙제 자동 산출
            </span>
            <div className={styles.smartCalcModeSwitch}>
              <button
                type="button"
                data-active={rangeMode === 'page' || undefined}
                onClick={() => setRangeMode('page')}
              >
                페이지 (p.) 기준
              </button>
              <button
                type="button"
                data-active={rangeMode === 'problem' || undefined}
                onClick={() => setRangeMode('problem')}
              >
                문항 번호 (#) 기준
              </button>
            </div>
          </div>
          <div className={styles.smartCalcControls}>
            <div className={styles.smartCalcInputs}>
              <input
                type="number"
                min={1}
                value={rangeStart}
                onChange={e => setRangeStart(e.target.value)}
                placeholder={rangeMode === 'page' ? '시작 p (예: 26)' : '시작 번호 (예: 133)'}
                aria-label="범위 시작"
              />
              <span>~</span>
              <input
                type="number"
                min={1}
                value={rangeEnd}
                onChange={e => setRangeEnd(e.target.value)}
                placeholder={rangeMode === 'page' ? '끝 p (예: 41)' : '끝 번호 (예: 250)'}
                aria-label="범위 끝"
              />
            </div>
            <div className={styles.smartCalcActions}>
              <button
                type="button"
                className={styles.primaryActionBtn}
                disabled={!rangePreview}
                onClick={() => {
                  if (!rangePreview) return;
                  setDraftScope(rangePreview.label);
                  if (rangePreview.endPage) handlePageChange(rangePreview.endPage);
                }}
              >
                진도 범위로 적용
              </button>
              <button
                type="button"
                className={styles.secondaryActionBtn}
                disabled={!rangePreview}
                onClick={() => {
                  if (!rangePreview) return;
                  setDraftHomework(rangePreview.label);
                }}
              >
                숙제 범위로 적용
              </button>
            </div>
          </div>
          {rangePreview && (
            <p className={styles.smartCalcPreview}>
              산출 결과: <b>{rangePreview.label}</b>
            </p>
          )}
        </div>
      )}

      {onDetails && (
        <div className={styles.columns}>
          <label>
            오늘 진도 범위
            <input
              aria-label="진행 범위"
              maxLength={2000}
              value={draftScope}
              onChange={e => setDraftScope(e.target.value)}
              placeholder="예: 02. 단항식의 계산 p.26~41 (133~250번, 118문항)"
            />
          </label>
          <label>
            오늘 부여 숙제
            <input
              aria-label="내줄 숙제"
              maxLength={2000}
              value={draftHomework}
              onChange={e => setDraftHomework(e.target.value)}
              placeholder="예: 02. 단항식의 계산 p.26~35 (133~200번)"
            />
          </label>
        </div>
      )}

      {onFeedback && (
        <label>
          오늘 수업 피드백
          <input
            aria-label="오늘의 피드백"
            maxLength={2000}
            value={draftFeedback}
            onChange={e => {
              setDraftFeedback(e.target.value);
              setFeedbackEdited(true);
            }}
            placeholder="보고서에 표시될 진도·이해도 코멘트를 입력하세요."
          />
        </label>
      )}

      <div className={styles.unitBulkBar}>
        <span>
          <ListChecks size={15} /> 전체 단원 일괄 변경 ({book.units.length}개 단원)
        </span>
        <div className={styles.unitStatePills}>
          {UNIT_STATES.map((st, idx) => (
            <button
              key={st}
              type="button"
              data-state={idx}
              onClick={() => setStates(Object.fromEntries(book.units.map(u => [u.id, st])))}
            >
              전체 {st}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.unitList}>
        {book.units.map(u => {
          const current = states[u.id] ?? '미시작';
          const cnt = unitProblemCount(u);
          return (
            <div className={styles.unitRow} key={u.id}>
              <div className={styles.unitTitle}>
                {u.group && <small>{u.group}</small>}
                <span>{u.name}</span>
                {(u.start_page || cnt > 0 || u.type_count || u.step_detail) && (
                  <div className={styles.unitMetaBadges}>
                    {u.start_page && u.end_page && <span>p.{u.start_page}~{u.end_page}</span>}
                    {u.start_problem && u.end_problem && <span>#{u.start_problem}~{u.end_problem}</span>}
                    {cnt > 0 && <span>{cnt}문항</span>}
                    {u.type_count && <span>{u.type_count}유형</span>}
                    {u.step_detail && <span>{u.step_detail}</span>}
                  </div>
                )}
              </div>
              <div className={styles.unitRightControls}>
                {onDetails && (u.start_page || cnt > 0) && (
                  <div className={styles.unitQuickScopeBtns}>
                    <button
                      type="button"
                      title="이 단원을 오늘 진도 범위로 넣기"
                      onClick={() => {
                        setDraftScope(formatUnitScopeText(u));
                        setStates(prev => ({ ...prev, [u.id]: prev[u.id] === '완료' ? '완료' : '진행 중' }));
                        if (u.end_page && u.end_page > page) setPage(u.end_page);
                      }}
                    >
                      진도 지정
                    </button>
                    <button
                      type="button"
                      title="이 단원을 오늘 숙제 범위로 넣기"
                      onClick={() => setDraftHomework(formatUnitScopeText(u))}
                    >
                      숙제 지정
                    </button>
                  </div>
                )}
                <div className={styles.unitStatePills} role="group" aria-label={`${u.name} 진도 상태`}>
                  {UNIT_STATES.map((st, idx) => (
                    <button
                      key={st}
                      type="button"
                      data-state={idx}
                      aria-pressed={current === st}
                      onClick={() => {
                        const nextStates = { ...states, [u.id]: st };
                        setStates(nextStates);
                        if (st === '완료' && u.end_page && u.end_page > page) {
                          setPage(u.end_page);
                        }
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.modalFooter}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
          취소
        </button>
        <button type="submit" className={styles.primaryBtn}>
          <Check size={15} /> {count > 1 ? `${count}명에게 적용` : '단원 상태 적용'}
        </button>
      </div>
    </form>
  );
}
