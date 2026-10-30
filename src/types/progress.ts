export type UnitStatus = '미시작' | '진행 중' | '완료';
export type TextbookCategory = '유형서' | '개념서' | '심화서' | '연산서' | '기출·모의' | '기타';

export interface ProgressUnit {
  id: string;
  group: string;
  name: string;
  start_page?: number;
  end_page?: number;
  start_problem?: number;
  end_problem?: number;
  problem_count?: number;
  type_count?: number;
  step_detail?: string;
}

export interface ProgressBook {
  id: string;
  student_id: string;
  title: string;
  curriculum: string;
  course: string;
  units: ProgressUnit[];
  states: Record<string, UnitStatus>;
  version: number;
  library_id?: string | null;
  total_pages?: number;
  completed_page?: number;
  archived?: boolean;
}

export interface ClassBook {
  id: string;
  class_id: string;
  title: string;
  curriculum: string;
  course: string;
  units: ProgressUnit[];
  total_pages: number;
  version: number;
}

export interface ProgressEntry {
  id: string;
  book_id: string;
  record_date: string;
  unit_ids: string[];
  scope: string;
  homework: string;
  due_date: string | null;
  memo: string;
  states: Record<string, UnitStatus>;
  created_at: string;
  units_snapshot?: ProgressUnit[];
  total_pages_snapshot?: number;
  completed_page?: number;
}

export function unitProblemCount(u: ProgressUnit): number {
  if (typeof u.problem_count === 'number' && u.problem_count > 0) return u.problem_count;
  if (typeof u.start_problem === 'number' && typeof u.end_problem === 'number' && u.end_problem >= u.start_problem && u.start_problem > 0) {
    return u.end_problem - u.start_problem + 1;
  }
  return 0;
}

export function totalBookProblems(book: Pick<ProgressBook, 'units'> | ProgressUnit[] | null | undefined): number {
  const units = Array.isArray(book) ? book : book?.units;
  if (!Array.isArray(units)) return 0;
  return units.reduce((sum, u) => sum + unitProblemCount(u), 0);
}

export function totalBookTypes(book: Pick<ProgressBook, 'units'> | ProgressUnit[] | null | undefined): number {
  const units = Array.isArray(book) ? book : book?.units;
  if (!Array.isArray(units)) return 0;
  return units.reduce((sum, u) => sum + (u.type_count && u.type_count > 0 ? u.type_count : 0), 0);
}

export function completedBookProblems(book: Pick<ProgressBook, 'units' | 'states' | 'total_pages' | 'completed_page'>): number {
  const total = totalBookProblems(book);
  if (total <= 0) return 0;
  const page = book.completed_page ?? 0;
  const hasPageMeta = book.units.some(u => (u.start_page ?? 0) > 0 && (u.end_page ?? 0) >= (u.start_page ?? 0));
  if (page > 0 && hasPageMeta) {
    let sum = 0;
    for (const u of book.units) {
      const cnt = unitProblemCount(u);
      if (cnt <= 0) continue;
      if (book.states[u.id] === '완료') {
        sum += cnt;
      } else if (u.start_page && u.end_page && u.end_page >= u.start_page) {
        if (page >= u.end_page) sum += cnt;
        else if (page >= u.start_page) {
          const span = u.end_page - u.start_page + 1;
          const covered = page - u.start_page + 1;
          sum += Math.round((cnt * covered) / span);
        }
      }
    }
    return Math.min(total, sum);
  }
  let sum = 0;
  for (const u of book.units) {
    const cnt = unitProblemCount(u);
    if (book.states[u.id] === '완료') sum += cnt;
    else if (book.states[u.id] === '진행 중') sum += Math.round(cnt * 0.5);
  }
  return Math.min(total, sum);
}

export function syncUnitStatesFromPage(
  units: ProgressUnit[],
  currentStates: Record<string, UnitStatus>,
  completedPage: number
): Record<string, UnitStatus> {
  const hasPageRanges = units.some(u => typeof u.start_page === 'number' && typeof u.end_page === 'number' && u.start_page > 0 && u.end_page >= u.start_page);
  if (!hasPageRanges) return currentStates;
  const next: Record<string, UnitStatus> = { ...currentStates };
  for (const u of units) {
    if (!u.start_page || !u.end_page || u.end_page < u.start_page) continue;
    if (completedPage <= 0 || completedPage < u.start_page) {
      next[u.id] = '미시작';
    } else if (completedPage >= u.end_page) {
      next[u.id] = '완료';
    } else {
      next[u.id] = '진행 중';
    }
  }
  return next;
}

export function resolveRangeSummary(
  units: ProgressUnit[],
  mode: 'page' | 'problem',
  startVal: number,
  endVal: number
): {
  label: string;
  matchedUnits: ProgressUnit[];
  estimatedProblems: number;
  endPage?: number;
} | null {
  if (!Number.isInteger(startVal) || !Number.isInteger(endVal) || startVal <= 0 || endVal < startVal) return null;
  if (mode === 'page') {
    const matched = units.filter(u => u.start_page && u.end_page && u.start_page <= endVal && u.end_page >= startVal);
    let estimatedProblems = 0;
    let minProb: number | undefined;
    let maxProb: number | undefined;
    for (const u of matched) {
      const cnt = unitProblemCount(u);
      const span = (u.end_page! - u.start_page!) + 1;
      const overlapStart = Math.max(startVal, u.start_page!);
      const overlapEnd = Math.min(endVal, u.end_page!);
      const overlapPages = Math.max(0, overlapEnd - overlapStart + 1);
      if (cnt > 0 && span > 0) {
        estimatedProblems += Math.max(1, Math.round((cnt * overlapPages) / span));
      }
      if (u.start_problem && u.end_problem && span > 0) {
        const pSpan = u.end_problem - u.start_problem + 1;
        const estStart = u.start_problem + Math.floor(((overlapStart - u.start_page!) / span) * pSpan);
        const estEnd = u.start_problem + Math.ceil(((overlapEnd - u.start_page! + 1) / span) * pSpan) - 1;
        if (minProb === undefined || estStart < minProb) minProb = estStart;
        if (maxProb === undefined || estEnd > maxProb) maxProb = Math.min(u.end_problem, estEnd);
      }
    }
    const unitText = matched.length === 1
      ? matched[0].name
      : matched.length > 1
        ? `${matched[0].name} ~ ${matched[matched.length - 1].name}`
        : '';
    const pageText = startVal === endVal ? `p.${startVal}` : `p.${startVal}~${endVal}`;
    const probText = minProb && maxProb ? ` (${minProb}~${maxProb}번, 약 ${estimatedProblems}문항)` : estimatedProblems > 0 ? ` (약 ${estimatedProblems}문항)` : '';
    return {
      label: `${unitText ? `${unitText} ` : ''}${pageText}${probText}`.trim(),
      matchedUnits: matched,
      estimatedProblems,
      endPage: endVal,
    };
  } else {
    const matched = units.filter(u => u.start_problem && u.end_problem && u.start_problem <= endVal && u.end_problem >= startVal);
    const count = endVal - startVal + 1;
    let minPage: number | undefined;
    let maxPage: number | undefined;
    for (const u of matched) {
      if (u.start_page && u.end_page && u.start_problem && u.end_problem) {
        const pSpan = Math.max(1, u.end_problem - u.start_problem + 1);
        const pageSpan = u.end_page - u.start_page + 1;
        const overlapStart = Math.max(startVal, u.start_problem);
        const overlapEnd = Math.min(endVal, u.end_problem);
        const estStartPage = u.start_page + Math.floor(((overlapStart - u.start_problem) / pSpan) * pageSpan);
        const estEndPage = u.start_page + Math.floor(((overlapEnd - u.start_problem) / pSpan) * pageSpan);
        if (minPage === undefined || estStartPage < minPage) minPage = estStartPage;
        if (maxPage === undefined || estEndPage > maxPage) maxPage = Math.min(u.end_page, estEndPage);
      }
    }
    const unitText = matched.length === 1
      ? matched[0].name
      : matched.length > 1
        ? `${matched[0].name} ~ ${matched[matched.length - 1].name}`
        : '';
    const pageText = minPage && maxPage ? (minPage === maxPage ? ` p.${minPage}` : ` p.${minPage}~${maxPage}`) : '';
    const probText = startVal === endVal ? `${startVal}번 (1문항)` : `${startVal}~${endVal}번 (${count}문항)`;
    return {
      label: `${unitText}${pageText} ${probText}`.trim(),
      matchedUnits: matched,
      estimatedProblems: count,
      endPage: maxPage,
    };
  }
}

export function progressPercent(book: Pick<ProgressBook, 'units' | 'states' | 'total_pages' | 'completed_page'>) {
  if (book.total_pages) return Math.round(Math.min(book.completed_page ?? 0, book.total_pages) / book.total_pages * 100);
  return book.units.length ? Math.round(book.units.filter(u => book.states[u.id] === '완료').length / book.units.length * 100) : 0;
}

function validOptionalInt(val: unknown, max = 50000): boolean {
  if (val === undefined || val === null) return true;
  return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= max;
}

export function validateProgress(book: ProgressBook, entry?: ProgressEntry) {
  if (!Number.isInteger(book.total_pages ?? 0) || (book.total_pages ?? 0) < 0 || (book.total_pages ?? 0) > 10000 || !Number.isInteger(book.completed_page ?? 0) || (book.completed_page ?? 0) < 0 || (book.completed_page ?? 0) > (book.total_pages ?? 0)) throw new Error('총 페이지와 완료 페이지를 확인해 주세요.');
  const ids = new Set(book.units.map(u => u.id));
  if (!book.title.trim() || book.title.length > 150 || !book.course.trim() || !book.curriculum.trim() ||
      !book.units.length || book.units.length > 300 || ids.size !== book.units.length ||
      book.units.some(u =>
        !u.id || !u.name.trim() || u.name.length > 200 || u.group.length > 200 ||
        !validOptionalInt(u.start_page, 10000) || !validOptionalInt(u.end_page, 10000) ||
        (u.start_page && u.end_page && u.end_page < u.start_page) ||
        !validOptionalInt(u.start_problem, 50000) || !validOptionalInt(u.end_problem, 50000) ||
        (u.start_problem && u.end_problem && u.end_problem < u.start_problem) ||
        !validOptionalInt(u.problem_count, 50000) || !validOptionalInt(u.type_count, 5000) ||
        (u.step_detail !== undefined && u.step_detail.length > 200)
      ) ||
      Object.entries(book.states).some(([id, state]) => !ids.has(id) || !['미시작', '진행 중', '완료'].includes(state))) throw new Error('교재명과 단원 목록을 확인해 주세요. (최대 300개)');
  if (entry && (entry.book_id !== book.id || !/^\d{4}-\d{2}-\d{2}$/.test(entry.record_date) ||
    (entry.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.due_date) || entry.due_date < entry.record_date)) ||
    entry.unit_ids.some(id => !ids.has(id)) || [entry.scope, entry.homework, entry.memo].some(t => t.length > 2000))) throw new Error('수업 날짜, 제출 예정일과 입력 범위를 확인해 주세요.');
}
