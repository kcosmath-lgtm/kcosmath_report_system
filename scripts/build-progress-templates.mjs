import { readFileSync, writeFileSync } from 'node:fs';
const doc = readFileSync(new URL('../docs/math-unit-catalog.md', import.meta.url), 'utf8');
const templates = [];
for (const line of doc.split('\n')) {
  if (!/^\| 초\d-\d /.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  templates.push({ id: cells[0], label: cells[0], curriculum: '2022 개정', units: cells[1].split(' / ').map(n => ({ group: '', name: n.replace(/^\d+\.\s*/, '') })) });
}
for (const match of doc.matchAll(/### (중[123][^\n]*|공통수학[12]|대수|미적분Ⅰ|미적분Ⅱ|확률과 통계|기하)\n([\s\S]*?)(?=\n### |\n## |$)/g)) {
  const [, title, body] = match;
  const rows = body.split('\n').filter(l => l.startsWith('| ') && !l.includes('---')).map(l => l.split('|').slice(1, -1).map(c => c.trim())).filter(c => !['학기', '대단원'].includes(c[0]));
  for (const semester of [...new Set(rows.map(r => title.startsWith('중') ? r[0] : ''))]) {
    const curriculum = title.includes('2015') ? '2015 개정' : '2022 개정';
    const label = title.split(' —')[0] + (semester ? ` ${semester}` : '');
    const units = rows.filter(r => !semester || r[0] === semester).flatMap(r => {
      const [group, names] = title.startsWith('중') ? r.slice(1) : r;
      // Detailed outlines use semicolons so commas inside a unit name stay intact.
      return names.split(names.includes('; ') ? '; ' : ', ').map(name => ({ group, name }));
    });
    templates.push({ id: `${label} ${curriculum}`, label, curriculum, units });
  }
}
if (templates.length !== 27) throw new Error(`Unexpected template count: ${templates.length}`);
writeFileSync(new URL('../src/constants/progressTemplates.ts', import.meta.url), '// Generated from docs/math-unit-catalog.md by scripts/build-progress-templates.mjs\nexport const PROGRESS_TEMPLATES = ' + JSON.stringify(templates, null, 2) + ';\n');
