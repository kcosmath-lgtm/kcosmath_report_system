export type UnitStatus = '미시작' | '진행 중' | '완료';
export interface ProgressUnit { id: string; group: string; name: string }
export interface ProgressBook {
  id: string; student_id: string; title: string; curriculum: string; course: string;
  units: ProgressUnit[]; states: Record<string, UnitStatus>; version: number;
  library_id?: string | null; total_pages?: number; completed_page?: number; archived?: boolean;
}
export interface ClassBook { id: string; class_id: string; title: string; curriculum: string; course: string; units: ProgressUnit[]; total_pages: number; version: number }
export interface ProgressEntry {
  id: string; book_id: string; record_date: string; unit_ids: string[];
  scope: string; homework: string; due_date: string | null; memo: string;
  states: Record<string, UnitStatus>; created_at: string;
  units_snapshot?: ProgressUnit[]; total_pages_snapshot?: number; completed_page?: number;
}
export function progressPercent(book: Pick<ProgressBook, 'units' | 'states' | 'total_pages' | 'completed_page'>) {
  if (book.total_pages) return Math.round(Math.min(book.completed_page ?? 0, book.total_pages) / book.total_pages * 100);
  return book.units.length ? Math.round(book.units.filter(u => book.states[u.id] === '완료').length / book.units.length * 100) : 0;
}
export function validateProgress(book: ProgressBook, entry?: ProgressEntry) {
  if (!Number.isInteger(book.total_pages ?? 0) || (book.total_pages ?? 0) < 0 || (book.total_pages ?? 0) > 10000 || !Number.isInteger(book.completed_page ?? 0) || (book.completed_page ?? 0) < 0 || (book.completed_page ?? 0) > (book.total_pages ?? 0)) throw new Error('총 페이지와 완료 페이지를 확인해 주세요.');
  const ids = new Set(book.units.map(u => u.id));
  if (!book.title.trim() || book.title.length > 150 || !book.course.trim() || !book.curriculum.trim() ||
      !book.units.length || book.units.length > 300 || ids.size !== book.units.length ||
      book.units.some(u => !u.id || !u.name.trim() || u.name.length > 200 || u.group.length > 200) ||
      Object.entries(book.states).some(([id, state]) => !ids.has(id) || !['미시작', '진행 중', '완료'].includes(state))) throw new Error('교재명과 단원 목록을 확인해 주세요. (최대 300개)');
  if (entry && (entry.book_id !== book.id || !/^\d{4}-\d{2}-\d{2}$/.test(entry.record_date) ||
    (entry.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.due_date) || entry.due_date < entry.record_date)) ||
    entry.unit_ids.some(id => !ids.has(id)) || [entry.scope, entry.homework, entry.memo].some(t => t.length > 2000))) throw new Error('수업 날짜, 제출 예정일과 입력 범위를 확인해 주세요.');
}
