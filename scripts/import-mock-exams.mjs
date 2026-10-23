import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cache = resolve(root, '.local-backups/mock-exams');
const files = resolve(root, 'public/question-bank/files');
const manifestPath = resolve(root, 'src/data/mock-exams.json');
for (const dir of [cache, files, resolve(root, 'src/data')]) mkdirSync(dir, { recursive: true });
const base = 'https://www.ebsi.co.kr';
const downloadBase = 'https://wdown.ebsi.co.kr/W61001/01exam';
const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).join(',');
const years = Array.from({ length: 21 }, (_, i) => 2026 - i).join(',');
const download = process.argv.includes('--download');
const refresh = process.argv.includes('--refresh');
function curl(url, output, data) {
  const args = ['--silent', '--show-error', '--fail', '--location', '--retry', '2', '--connect-timeout', '15', '--max-time', '60', '--output', output];
  if (data) args.push('--data', data);
  execFileSync('curl.exe', [...args, url], { stdio: ['ignore', 'pipe', 'pipe'] });
}
const decode = text => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
function parse(html, grade) {
  return html.split(/<div class="qus_box /).slice(1).flatMap(block => {
    const rawTitle = block.match(/class="qus_tit">([\s\S]*?)<\/div>/)?.[1] || '';
    const title = decode(rawTitle);
    const subject = rawTitle.split('&nbsp;').map(decode).filter(Boolean).slice(1).join(' ') || '수학';
    const calls = [...block.matchAll(/goDownLoad([PHJ])\(([^)]*)\)/g)].map(m => ({ kind: m[1], args: [...m[2].matchAll(/'([^']*)'/g)].map(a => decode(a[1])) }));
    const problem = calls.find(c => c.kind === 'P');
    if (!problem) return [];
    const labels = [...block.matchAll(/flag_subject_col_basic">([^<]*)</g)].map(m => decode(m[1]));
    const year = Number(labels[0]);
    const month = Number(labels[1]?.replace(/\D/g, ''));
    if (!year || !month) throw new Error(`Missing exam date: ${title}`);
    const resources = calls.filter(c => c.args[0] && /\.(pdf|png|jpg)(?:\?|$)/i.test(c.args[0])).map(c => {
      const url = /^https?:\/\//.test(c.args[0]) ? c.args[0].replace(/^http:/, 'https:') : downloadBase + c.args[0];
      if (new URL(url).hostname !== 'wdown.ebsi.co.kr') throw new Error('Unexpected download host');
      return { kind: c.kind === 'P' ? 'problem' : c.kind === 'H' ? 'explanation' : 'answer', url };
    });
    return [{ id: `${grade}-${problem.args[8] || createHash('sha256').update(problem.args[0]).digest('hex').slice(0, 12)}`, grade, year, month, title, subject, source: `${base}/ebs/xip/xipc/previousPaperList.ebs?targetCd=D${grade}00`, resources }];
  });
}
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { exams: [] };
const priorResources = new Map(previous.exams.flatMap(e => e.resources).map(r => [r.url, r]));
const exams = [];
const coverage = [];
for (const grade of [1, 2, 3]) {
  let pages = 1, expected = 0;
  const gradeExams = [];
  for (let page = 1; page <= pages; page++) {
    const path = resolve(cache, `grade-${grade}-all-months-page-${page}.html`);
    if (refresh || !existsSync(path)) curl(`${base}/ebs/xip/xipc/previousPaperListAjax.ajax`, path, new URLSearchParams({ targetCd: `D${grade}00`, yearList: years, monthList: months, arOrd: '2', subjIdList: 'firstEnter', sort: 'recent', currentPage: String(page) }).toString());
    const html = readFileSync(path, 'utf8');
    if (page === 1) {
      const total = html.match(/class="tot">([\d,]+)개/);
      if (!total) throw new Error(`Unrecognized list response for grade ${grade}`);
      expected = Number(total[1].replaceAll(',', ''));
      pages = Math.max(1, Math.ceil(expected / 15));
    }
    const rows = parse(html, grade);
    if (expected && !rows.length) throw new Error(`Empty page ${grade}/${page}`);
    gradeExams.push(...rows);
    process.stdout.write(`Grade ${grade}, page ${page}/${pages}: ${rows.length} exams\n`);
  }
  if (new Set(gradeExams.map(e => e.id)).size !== expected) throw new Error(`Coverage mismatch for grade ${grade}: ${gradeExams.length}/${expected}`);
  exams.push(...gradeExams);
  coverage.push({ grade, expected, collected: gradeExams.length });
}
let completed = 0;
const resources = new Map();
for (const exam of exams) for (const resource of exam.resources) {
  const prior = priorResources.get(resource.url);
  if (prior?.localPath && existsSync(resolve(root, 'public', prior.localPath.slice(1)))) Object.assign(resource, prior);
  if (!resources.has(resource.url)) resources.set(resource.url, []);
  resources.get(resource.url).push(resource);
}
function save() {
  writeFileSync(manifestPath, JSON.stringify({ source: 'EBSi', checkedAt: new Date().toISOString(), requestedYears: { from: 2006, to: 2026 }, coverage, exams }, null, 2) + '\n');
}
save();
if (download) {
  const queue = [...resources.entries()];
  async function worker() {
    while (queue.length) {
      const [url, references] = queue.shift();
      const resource = references[0];
      if (!resource.localPath) {
        const temp = resolve(cache, `${createHash('sha256').update(url).digest('hex')}.download`);
        try {
          // Yield between downloads so progress and cancellation remain responsive.
          await new Promise(r => setTimeout(r, 100));
          curl(url, temp);
          const bytes = readFileSync(temp);
          const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
          const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const jpg = bytes[0] === 255 && bytes[1] === 216;
          if (!pdf && !png && !jpg) throw new Error('Response is not a PDF or answer image');
          const hash = createHash('sha256').update(bytes).digest('hex');
          const name = `${hash}.${pdf ? 'pdf' : png ? 'png' : 'jpg'}`;
          const destination = resolve(files, name);
          if (!existsSync(destination)) renameSync(temp, destination); else unlinkSync(temp);
          for (const ref of references) { Object.assign(ref, { localPath: `/question-bank/files/${name}`, bytes: bytes.length, sha256: hash }); delete ref.error; }
        } catch (error) {
          for (const ref of references) ref.error = String(error.message).slice(0, 300);
        }
      }
      completed++;
      if (completed % 20 === 0 || completed === resources.size) { save(); process.stdout.write(`Files ${completed}/${resources.size}, local resources: ${[...resources.values()].filter(rs => rs[0].localPath).length}\n`); }
    }
  }
  await worker();
}
save();
process.stdout.write(JSON.stringify({ exams: exams.length, resources: resources.size, downloaded: [...resources.values()].filter(rs => rs[0].localPath).length, failed: [...resources.values()].filter(rs => rs[0].error).length, coverage }) + '\n');
