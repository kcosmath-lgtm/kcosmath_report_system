/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const JSZip = require("jszip");
const { DOMParser } = require("@xmldom/xmldom");
global.DOMParser = DOMParser;
function load(relative) {
  const filename = path.resolve(__dirname, relative), compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = name => name === "./typing-model" ? model : require(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return compiled.exports;
}
const model = load("../src/lib/typing-model.ts");
const { buildDocx, buildHwpx, latexToHancom } = load("../src/lib/typing-export.ts");
const doc = { title: "수학 <시험> & 복습", perPage: 4, problems: model.sampleProblems.map((p, i) => ({ ...p, id: String(i) })) };
function parse(text) {
  const errors = [];
  const xml = new DOMParser({ onError: (level, message) => { if (level !== "warning") errors.push(message); } }).parseFromString(text, "application/xml");
  assert.deepEqual(errors, []); return xml;
}
async function zipBlob(blob) { return JSZip.loadAsync(await blob.arrayBuffer()); }

test("OCR model is fixed; last partial page keeps left-column capacity", () => {
  assert.equal(model.OCR_MODEL, "gemini-3.1-flash-lite");
  const pages = model.examPages(doc.problems.slice(0, 3), 4);
  assert.deepEqual(pages[0].left.map(p => p.number), ["1", "2"]);
  assert.deepEqual(pages[0].right.map(p => p.number), ["3"]);
});
test("nested fractions, roots, limits, cases and matrices become Hancom scripts", () => {
  assert.match(latexToHancom(String.raw`\frac{1}{\sqrt{x^2+1}}`), /over.*sqrt.*\^/);
  assert.match(latexToHancom(String.raw`\sqrt[3]{5}`), /root.*3.*of.*5/);
  assert.match(latexToHancom(String.raw`\lim_{h\to0}\frac{f(2+h)-f(2)}{h}`), /lim.*_.*->.*over/);
  assert.match(latexToHancom(String.raw`\begin{cases}x+1 & x<0 \\ x^2 & x\ge0\end{cases}`), /cases.*&.*#.*ge/);
  assert.match(latexToHancom(String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`), /matrix.*a.*&.*b.*#.*c/);
  assert.throws(() => latexToHancom(String.raw`\frac{`));
});
test("DOCX contains editable OMML, two columns, display equations and escaped text", async () => {
  const zip = await zipBlob(await buildDocx(doc));
  for (const name of Object.keys(zip.files).filter(n => /xml$|rels$/.test(n))) parse(await zip.file(name).async("string"));
  const document = parse(await zip.file("word/document.xml").async("string"));
  const math = "http://schemas.openxmlformats.org/officeDocument/2006/math";
  assert.ok(document.getElementsByTagNameNS(math, "oMath").length >= 8);
  assert.ok(document.getElementsByTagNameNS(math, "f").length >= 3);
  assert.ok(document.getElementsByTagNameNS(math, "rad").length);
  assert.ok(document.getElementsByTagNameNS(math, "oMathPara").length >= 2);
  assert.ok(document.documentElement.textContent.includes(doc.title));
  assert.equal(document.getElementsByTagName("w:tc").length, 4);
  assert.equal(document.getElementsByTagName("w:drawing").length, 0);
});
test("HWPX contains editable Hancom equations, valid style references and OCF packaging", async () => {
  const template = fs.readFileSync(path.resolve(__dirname, "../public/typing/blank.hwpx"));
  const blob = await buildHwpx(doc, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength));
  const buffer = Buffer.from(await blob.arrayBuffer()), zip = await JSZip.loadAsync(buffer);
  assert.equal(buffer.subarray(30, 38).toString(), "mimetype");
  assert.equal(buffer.readUInt16LE(8), 0);
  assert.equal(await zip.file("mimetype").async("string"), "application/hwp+zip");
  for (const name of Object.keys(zip.files).filter(n => /xml$|hpf$/.test(n))) parse(await zip.file(name).async("string"));
  const section = parse(await zip.file("Contents/section0.xml").async("string"));
  const hp = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  const equations = section.getElementsByTagNameNS(hp, "equation");
  assert.ok(equations.length >= 8);
  const scripts = Array.from(section.getElementsByTagNameNS(hp, "script")).map(n => n.textContent);
  assert.ok(scripts.some(s => s.includes("cases")));
  assert.ok(scripts.some(s => s.includes("root") && s.includes("of")));
  assert.ok(scripts.every(s => !s.includes("\\") && !s.includes("$")));
  assert.equal(section.getElementsByTagNameNS(hp, "tc").length, 4);
  const header = parse(await zip.file("Contents/header.xml").async("string"));
  const styles = new Set(Array.from(header.getElementsByTagName("hh:paraPr")).map(n => n.getAttribute("id")));
  for (const p of Array.from(section.getElementsByTagNameNS(hp, "p"))) assert.ok(styles.has(p.getAttribute("paraPrIDRef")));
});
test("both editable exports embed attached figure bytes and relationships", async () => {
  const figure = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=";
  const withImage = { ...doc, brandImage: figure, problems: [{ ...doc.problems[0], figure }] };
  const word = await zipBlob(await buildDocx(withImage));
  assert.ok(word.file("word/media/image1.png"));
  assert.ok(word.file("word/media/image2.png"));
  assert.match(await word.file("word/_rels/document.xml.rels").async("string"), /media\/image1.png/);
  const template = fs.readFileSync(path.resolve(__dirname, "../public/typing/blank.hwpx"));
  const hangul = await zipBlob(await buildHwpx(withImage, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)));
  assert.ok(hangul.file("BinData/image1.png"));
  assert.ok(hangul.file("BinData/image2.png"));
  assert.match(await hangul.file("Contents/content.hpf").async("string"), /BinData\/image1.png/);
  assert.match(await hangul.file("Contents/section0.xml").async("string"), /binaryItemIDRef="image1"/);
});



test('OCR repairs duplicate numbers and math and flags suspicious fragments', () => {
  const [p, fragment] = model.normalizeProblems([{ number: '7', question: '7. 다음 값은?', boxContent: '〈보기〉\n$a>0$', choices: ['① \\sqrt{2}'] }, { number: '8', question: '과', choices: [] }]);
  assert.equal(p.question, '다음 값은?');
  assert.equal(p.boxContent, '$a>0$');
  assert.equal(p.choices[0], '$\\sqrt{2}$');
  assert.match(fragment.review, /문장 조각/);
  assert.equal(fragment.question, '과');
  assert.equal(model.repairMath('\\(x^2\\)'), '$x^2$');
});
test('long questions get a full column in preview and editable exports', async () => {
  const problemHeights = { '1': 700 };
  const pages = model.examPages(doc.problems, 4, problemHeights);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].capacity, 2);
  assert.deepEqual(pages.flatMap(p => [...p.left, ...p.right]).map(p => p.number), ['1','2','3','4']);
  const zip = await zipBlob(await buildDocx({ ...doc, problemHeights }));
  assert.match(await zip.file('word/document.xml').async('string'), /w:val="12500"/);
});


test('OCR table normalization preserves empty cells, fractions and letters', () => {
  const [p] = model.normalizeProblems([{ number: '1', question: '표에서 값을 구하시오.', tables: [{ caption: '<표 1>', rows: [['x','1','5','8','B'], ['y','4','A','32','\\frac{15}{2}']] }] }]);
  assert.equal(p.tables[0].rows[1][4], '$\\frac{15}{2}$');
  assert.equal(p.tables[0].rows[0][4], 'B');
  assert.throws(() => model.normalizeTables([{ rows: [['x','y'], ['z']] }]));
  assert.throws(() => model.normalizeTables([{ rows: Array.from({ length: 21 }, () => ['x']) }]));
});
test('Word and Hangul exports contain native editable table cells and native math', async () => {
  const withTables = { ...doc, problems: [{ ...doc.problems[0], tables: [{ caption: '<표 1>', rows: [['$x$','1','5','8','B'], ['$y$','4','A','32','$\\frac{15}{2}$']] }] }] };
  const word = await zipBlob(await buildDocx(withTables));
  const document = parse(await word.file('word/document.xml').async('string'));
  assert.equal(document.getElementsByTagName('w:tbl').length, 2);
  assert.equal(document.getElementsByTagName('w:tc').length, 14);
  assert.ok(document.getElementsByTagName('m:f').length >= 2);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hwpx = await zipBlob(await buildHwpx(withTables, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)));
  const section = parse(await hwpx.file('Contents/section0.xml').async('string'));
  assert.equal(section.getElementsByTagName('hp:tbl').length, 2);
  assert.equal(section.getElementsByTagName('hp:tc').length, 14);
  const header = parse(await hwpx.file('Contents/header.xml').async('string'));
  assert.ok(Array.from(header.getElementsByTagName('hh:borderFill')).some(n => n.getAttribute('id') === '5'));
  assert.ok(Array.from(section.getElementsByTagName('hp:script')).some(n => n.textContent.includes('15') && n.textContent.includes('over')));
});
