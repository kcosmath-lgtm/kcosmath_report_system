'use client';
import { useState } from 'react';
import { Check, ListChecks } from 'lucide-react';
import { progressPercent, type ProgressBook, type UnitStatus } from '../types/progress';
import styles from './student-progress.module.css';

const UNIT_STATES: UnitStatus[] = ['미시작', '진행 중', '완료'];

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

  const currentPct = progressPercent({ ...book, states, completed_page: page });

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
          <p>{count}명의 단원별 진행 상태와 완료 페이지를 설정합니다.</p>
        </div>
        <div className={styles.unitEditorPct}>
          <span>예상 진도율</span>
          <strong>{currentPct}%</strong>
        </div>
      </div>

      {!!book.total_pages && (
        <div className={styles.unitPageRow}>
          <span>완료 페이지</span>
          <div className={styles.pageInputGroup}>
            <input
              aria-label="완료 페이지"
              type="number"
              min={0}
              max={book.total_pages}
              required
              value={page}
              onChange={e => setPage(Number(e.target.value))}
            />
            <span>/ {book.total_pages} 페이지</span>
          </div>
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
              placeholder="예: II. 이차방정식 p.42~48"
            />
          </label>
          <label>
            오늘 부여 숙제
            <input
              aria-label="내줄 숙제"
              maxLength={2000}
              value={draftHomework}
              onChange={e => setDraftHomework(e.target.value)}
              placeholder="예: 워크북 p.20~24"
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
          return (
            <div className={styles.unitRow} key={u.id}>
              <div className={styles.unitTitle}>
                {u.group && <small>{u.group}</small>}
                <span>{u.name}</span>
              </div>
              <div className={styles.unitStatePills} role="group" aria-label={`${u.name} 진도 상태`}>
                {UNIT_STATES.map((st, idx) => (
                  <button
                    key={st}
                    type="button"
                    data-state={idx}
                    aria-pressed={current === st}
                    onClick={() => setStates({ ...states, [u.id]: st })}
                  >
                    {st}
                  </button>
                ))}
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
