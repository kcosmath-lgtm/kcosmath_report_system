export interface ImportedGrade { key: string; name: string; group: string; grade: string; title: string; date: string; score: number; max: number; total: number; wrong: number; studentId: string; enabled: boolean }

export function extractDateFromTitle(title: string): string | null {
  const trimmed = title.trim();
  const compact = trimmed.match(/^[\[(]?(20\d{2}|\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[\])]?(?=\s*[/|_.\-\s:]|$)/);
  if (compact) {
    const year = compact[1].length === 2 ? `20${compact[1]}` : compact[1];
    const candidate = `${year}-${compact[2]}-${compact[3]}`;
    const d = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === candidate) return candidate;
  }
  const separated = trimmed.match(/^[\[(]?(20\d{2}|\d{2})[.\-](\d{1,2})[.\-](\d{1,2})[\])]?(?=\s*[/|_\-\s:]|$)/);
  if (separated) {
    const year = separated[1].length === 2 ? `20${separated[1]}` : separated[1];
    const candidate = `${year}-${separated[2].padStart(2, '0')}-${separated[3].padStart(2, '0')}`;
    const d = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === candidate) return candidate;
  }
  return null;
}

export function parseGradeRows(grid: string[][]): { rows: ImportedGrade[]; skipped: number } {
  const header = grid.findIndex(row => row.includes('학생명') && row.includes('점수'));
  if (header < 0) throw new Error('학생명·점수 항목을 찾지 못했습니다. 배정문제지 목록 엑셀을 선택해 주세요.');
  const fields = grid[header]; let skipped = 0;
  const rows: ImportedGrade[] = [];
  for (const row of grid.slice(header + 1)) {
    const get = (key: string) => (row[fields.indexOf(key)] ?? '').trim();
    if (!get('학생명')) continue;
    if (/미채점/.test(get('점수')) || !get('점수')) { skipped++; continue; }
    const score = Number(get('점수').replace(/점/g, '').trim());
    const rawTitle = get('문제지명');
    const titleDate = extractDateFromTitle(rawTitle);
    const rawDate = get('생성일') || get('채점완료일');
    const parts = rawDate.match(/^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if ((!titleDate && !parts) || !Number.isFinite(score) || score < 0 || score > 100 || !rawTitle || !get('문제지ID')) throw new Error(`${get('학생명')}: 날짜·점수·문제지ID를 확인해 주세요.`);
    let date = titleDate ?? '';
    if (!date && parts) {
      const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
      date = `${year}-${parts[2].padStart(2,'0')}-${parts[3].padStart(2,'0')}`;
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('유효하지 않은 시험 날짜입니다.');
    }
    const counts = get('정/오').match(/^(\d+)\s*\/\s*(\d+)$/);
    rows.push({ key: `bank:${get('문제지ID')}`, name: get('학생명'), group: get('반'), grade: get('학년'), title: 'daily test', date, score, max: 100, total: Number(get('문항수').replace(/문항/g,'')) || 0, wrong: counts ? Number(counts[2]) : 0, studentId: '', enabled: true });
  }
  if (!rows.length) throw new Error('가져올 채점 완료 성적이 없습니다.');
  return { rows, skipped };
}
