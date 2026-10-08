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
const { buildDocx, buildHwpx, latexToHancom, prepareExportDocument, exportPages, hwpxChoiceColumns, normalizeHwpxLineTypes } = load("../src/lib/typing-export.ts");
const doc = { title: "수학 <시험> & 복습", perPage: 4, problems: model.sampleProblems.map((p, i) => ({ ...p, id: String(i) })) };

test('Hancom embeds whole image coordinates and scales them to the display box', async () => {
  const canvas = require('@napi-rs/canvas').createCanvas(600, 400);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0,0,600,400);
  const figure = canvas.toDataURL('image/png');
  const input = { ...doc, brandImage: figure, problems: [{ ...doc.problems[0], figure, choiceFigures: [{ figure }] }] };
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const zip = await zipBlob(await buildHwpx(input, template));
  const section = parse(await zip.file('Contents/section0.xml').async('string'));
  const pictures = Array.from(section.getElementsByTagName('hp:pic')); assert.equal(pictures.length, 3);
  for (const pic of pictures) {
    const org = pic.getElementsByTagName('hp:orgSz')[0], clip = pic.getElementsByTagName('hp:imgClip')[0], dim = pic.getElementsByTagName('hp:imgDim')[0];
    assert.equal(org.getAttribute('width'), '45000'); assert.equal(org.getAttribute('height'), '30000');
    assert.equal(clip.getAttribute('right'), '45000'); assert.equal(clip.getAttribute('bottom'), '30000');
    assert.equal(dim.getAttribute('dimwidth'), '45000'); assert.equal(dim.getAttribute('dimheight'), '30000');
    const matrix = pic.getElementsByTagName('hc:scaMatrix')[0], size = pic.getElementsByTagName('hp:sz')[0];
    assert.ok(Math.abs(Number(matrix.getAttribute('e1')) * 45000 - Number(size.getAttribute('width'))) < 0.01);
    assert.ok(Math.abs(Number(matrix.getAttribute('e5')) * 30000 - Number(size.getAttribute('height'))) < 0.01);
    assert.equal(pic.getElementsByTagName('hc:pt2')[0].getAttribute('x'), '45000');
    const image = pic.getElementsByTagName('hc:img')[0];
    assert.equal(await zip.file('BinData/' + image.getAttribute('binaryItemIDRef') + '.png').async('base64'), figure.split(',')[1]);
  }
});

test('table-only OCR box is deduplicated without deleting accompanying prose', () => {
  const tables = [{ caption: '〈표1〉', rows: [['x','1','5','8','B'],['y','4','A','32','48']] }, { caption: '〈표2〉', rows: [['x','-5','-3','-1','4'],['y','-6','-10','C','$\\frac{15}{2}$']] }];
  const box = '〈표1〉 x | 1 | 5 | 8 | B y | 4 | A | 32 | 48 〈표2〉 x | -5 | -3 | -1 | 4 y | -6 | -10 | C | 15/2';
  const input = { question: '두 표를 보고 값을 구하시오.', boxContent: box, tables, choices: ['1','2'] };
  const [fixed] = model.normalizeProblems([input]); assert.equal(fixed.boxContent, ''); assert.equal(fixed.tables.length, 2);
  assert.equal(model.removeDuplicateTableBox('ㄱ. 표의 값은 양수이다.\n' + box, tables), 'ㄱ. 표의 값은 양수이다.\n' + box);
  assert.equal(prepareExportDocument({ ...doc, problems: [{ ...doc.problems[0], ...input }] }, 'hwpx').document.problems[0].boxContent, '');
});

test('native export preserves measured preview pagination and gives box prose normal leading', async () => {
  const input = { ...doc, problemHeights: Object.fromEntries(doc.problems.map(p => [p.id, 400])), problems: doc.problems.map(p => ({ ...p, boxContent: 'ㄱ. 조건을 확인한다.\nㄴ. 계산 과정을 설명한다.' })) };
  assert.equal(exportPages(input).length, 1); assert.equal(exportPages(input)[0].capacity, 4);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const zip = await zipBlob(await buildHwpx(input, template));
  const header = parse(await zip.file('Contents/header.xml').async('string'));
  for (const id of ['21','22']) {
    const style = Array.from(header.getElementsByTagName('hh:paraPr')).find(n => n.getAttribute('id') === id);
    assert.ok(Array.from(style.getElementsByTagName('hh:lineSpacing')).every(n => Number(n.getAttribute('value')) >= 160));
    assert.equal(style.getElementsByTagName('hh:align')[0].getAttribute('horizontal'), 'LEFT');
  }
});

test('parenthesized qualifications stay in the question and genuine boxes remain boxed', async () => {
  const input = { question: '두 그래프가 만날 때 $ab$의 값은?', boxContent: '단, $a, b$는 수', choices: ['8','10','12','14','16'] };
  const [problem] = model.normalizeProblems([input]);
  assert.equal(problem.question, '두 그래프가 만날 때 $ab$의 값은? (단, $a, b$는 수)');
  assert.equal(problem.boxContent, '');
  const [again] = model.normalizeProblems([problem]); assert.equal(again.question, problem.question);
  const [duplicate] = model.normalizeProblems([{ ...input, question: problem.question, boxContent: '(단, $a, b$는 수)' }]);
  assert.equal(duplicate.question, problem.question); assert.equal(duplicate.boxContent, '');
  assert.equal(model.normalizeProblems([{ ...input, boxLayout: 'box' }])[0].boxContent, input.boxContent);
  assert.equal(model.normalizeProblems([{ ...input, boxContent: 'ㄱ. $a>0$\nㄴ. $b<0$' }])[0].boxContent, 'ㄱ. $a>0$\nㄴ. $b<0$');
  const nativeDoc = { ...doc, problems: [problem] };
  const word = await (await zipBlob(await buildDocx(nativeDoc))).file('word/document.xml').async('string');
  assert.ok(word.includes('(단,')); assert.ok(!word.includes('〈보기〉'));
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const section = await (await zipBlob(await buildHwpx(nativeDoc, template))).file('Contents/section0.xml').async('string');
  assert.ok(section.includes('(단,')); assert.ok(!section.includes('〈보기〉'));
});

test('OWPML line enums disable strikeout and preserve only intended table borders', async () => {
  assert.equal(normalizeHwpxLineTypes('<hh:strikeout shape="None" color="#000000"/>'), '<hh:strikeout shape="NONE" color="#000000"/>');
  assert.equal(normalizeHwpxLineTypes('<hh:topBorder type="DashDot"/>'), '<hh:topBorder type="DASH_DOT"/>');
  assert.equal(normalizeHwpxLineTypes('<hc:winBrush faceColor="none"/>'), '<hc:winBrush faceColor="none"/>');
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const zip = await zipBlob(await buildHwpx(doc, template));
  const raw = await zip.file('Contents/header.xml').async('string');
  assert.doesNotMatch(raw, /(?:shape|type)="(?:None|Solid|DashDot)"/);
  const header = parse(raw);
  for (const node of header.getElementsByTagName('hh:strikeout')) assert.equal(node.getAttribute('shape'), 'NONE');
  const fills = Array.from(header.getElementsByTagName('hh:borderFill'));
  for (const edge of ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder']) {
    assert.equal(fills.find(n => n.getAttribute('id') === '1').getElementsByTagName('hh:' + edge)[0].getAttribute('type'), 'NONE');
    assert.equal(fills.find(n => n.getAttribute('id') === '5').getElementsByTagName('hh:' + edge)[0].getAttribute('type'), 'SOLID');
  }
});

test('Hancom choice cells fit coordinates and keep labels on the same line', async () => {
  const problem = { ...doc.problems[0], choices: ['(-10, 4/5)', '(-4, 2)', '(6, -3/4)', '(16, -1/2)', '(20, -2/5)'] };
  assert.equal(hwpxChoiceColumns(problem, 5), 3);
  assert.equal(hwpxChoiceColumns({ ...problem, choices: ['1', '2', '3', '4', '5'] }, 5), 5);
  assert.equal(hwpxChoiceColumns({ ...problem, choices: Array(5).fill('123456789012345678901234567890/12345') }, 5), 1);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const zip = await zipBlob(await buildHwpx({ ...doc, problems: [problem], choiceColumns: { '0': 5 } }, template));
  const section = parse(await zip.file('Contents/section0.xml').async('string'));
  const choices = Array.from(section.getElementsByTagName('hp:tbl')).find(table => table.getAttribute('colCnt') === '3' && table.getAttribute('rowCnt') === '2');
  assert.ok(choices);
  const page = section.getElementsByTagName('hp:pagePr')[0];
  // Real Hancom interprets NARROWLY as landscape even when width < height.
  assert.equal(page.getAttribute('landscape'), 'WIDELY');
  const margin = page.getElementsByTagName('hp:margin')[0];
  const usableHeight = Number(page.getAttribute('height')) - Number(margin.getAttribute('top')) - Number(margin.getAttribute('bottom'));
  assert.ok(usableHeight > 70000, 'portrait body must accommodate the 60000-unit exam table and header');
});

test('condition box fractions retain full size beside linear equations in screen and exports', async () => {
  const box = '㉠ $y=-2x$   ㉡ $y=-\\frac{4}{x}$   ㉢ $y=\\tfrac{10}{3}x$\n㉣ $y=\\textstyle\\frac{2}{x}$';
  const formatted = model.formatBoxContent(box);
  assert.equal((formatted.match(/\\displaystyle/g) ?? []).length, 3);
  assert.doesNotMatch(formatted, /\\(?:tfrac|textstyle)\b/);
  assert.equal(model.formatBoxContent(formatted), formatted);
  assert.ok(formatted.includes('$y=-2x$'));
  const input = { ...doc, problems: [{ ...doc.problems[0], boxContent: box }] };
  const word = parse(await (await zipBlob(await buildDocx(input))).file('word/document.xml').async('string'));
  assert.equal(word.getElementsByTagName('m:f').length, 4); // includes question exponent
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const section = parse(await (await zipBlob(await buildHwpx(input, template))).file('Contents/section0.xml').async('string'));
  assert.equal(Array.from(section.getElementsByTagName('hp:script')).filter(n => n.textContent.includes('over')).length, 4);
});

test('office pagination reserves native table and equation space without browser measurements', async () => {
  const input = { ...doc, problems: doc.problems.map(p => ({ ...p,
    boxContent: 'ㄱ. 조건을 만족하는 수를 구하고 계산 과정을 설명한다. '.repeat(8),
    tables: [{ caption: '', rows: Array.from({ length: 5 }, () => ['1/2', '15/2']) }],
  })) };
  assert.ok(exportPages(input).every(page => page.capacity === 2));
  const word = parse(await (await zipBlob(await buildDocx(input))).file('word/document.xml').async('string'));
  assert.equal(word.getElementsByTagName('w:pageBreakBefore').length, 1);
  assert.ok(Array.from(word.getElementsByTagName('w:br')).every(node => node.getAttribute('w:type') !== 'page'));
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hwpx = await zipBlob(await buildHwpx(input, template));
  const section = parse(await hwpx.file('Contents/section0.xml').async('string'));
  assert.equal(section.getElementsByTagName('hp:secPr').length, 1);
  const firstParagraph = section.documentElement.firstChild;
  assert.ok(firstParagraph.getElementsByTagName('hp:tbl').length > 0);
  assert.ok(firstParagraph.getElementsByTagName('hp:secPr').length > 0);
});
test('Korean statement combinations force three plus two cells in both native exports', async () => {
  const choices = ['ㄱ','ㄱ, ㄷ','ㄴ, ㄷ','ㄴ, ㄹ','ㄱ, ㄷ, ㄹ'];
  assert.equal(model.hasStatementChoices(choices), true);
  assert.equal(model.hasStatementChoices(['ㄱ의 값은 1이다.']), false);
  const input = { ...doc, problems: [{ ...doc.problems[0], choices }], choiceColumns: { '0': 5 } };
  const word = await zipBlob(await buildDocx(input));
  const wordXml = parse(await word.file('word/document.xml').async('string'));
  assert.ok(Array.from(wordXml.getElementsByTagName('w:tbl')).some(t => t.getElementsByTagName('w:gridCol').length === 3 && t.getElementsByTagName('w:tc').length === 6 && t.textContent.includes('⑤')));
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hangul = await zipBlob(await buildHwpx(input, template));
  const section = parse(await hangul.file('Contents/section0.xml').async('string'));
  assert.ok(Array.from(section.getElementsByTagName('hp:tbl')).some(t => t.getAttribute('colCnt') === '3' && t.getAttribute('rowCnt') === '2' && t.textContent.includes('⑤')));
});
test('choice numbers, mixed prose, decimals and degrees render as native math without nesting delimiters', async () => {
  assert.equal(model.formatChoiceContent('15/2'), '$\\displaystyle \\frac{15}{2}$');
  assert.equal(model.formatChoiceContent('각 A의 크기는 130°이다.'), '각 A의 크기는 $130^{\\circ}$이다.');
  assert.equal(model.formatChoiceContent('비율은 1.25%이다.'), '비율은 $1.25\\%$이다.');
  assert.equal(model.formatChoiceContent('$x^2$의 값은 3이다.'), '$x^2$의 값은 $3$이다.');
  const input = { ...doc, problems: [{ ...doc.problems[0], question: '값은?', choices: ['1','-2','15/2','0.5','130°'] }] };
  const word = await zipBlob(await buildDocx(input));
  const wordXml = parse(await word.file('word/document.xml').async('string'));
  assert.equal(wordXml.getElementsByTagName('m:oMath').length, 5);
  assert.equal(wordXml.getElementsByTagName('m:f').length, 1);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hangul = await zipBlob(await buildHwpx(input, template));
  const hwpxXml = parse(await hangul.file('Contents/section0.xml').async('string'));
  assert.equal(hwpxXml.getElementsByTagName('hp:equation').length, 5);
});
test('plain table numbers become native equations and five choice images remain in numbered cells', async () => {
  const figure = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
  const [problem] = model.normalizeProblems([{ question: '두 직선이 평행한 것은?', choices: ['', '', '', '', ''], choiceFigureBoxes: [[0,0,100,100],[],[],[],[]], tables: [{ rows: [['x','-2','15/2','표 제목']] }] }]);
  assert.deepEqual(problem.choiceFigures[0].figureBox, [0,0,100,100]);
  problem.choiceFigures = Array.from({ length: 5 }, () => ({ figure }));
  const input = { ...doc, problems: [problem] };
  assert.equal(model.formatTableCell('-2'), '$-2$');
  assert.equal(model.formatTableCell('15/2'), '$\\frac{15}{2}$');
  assert.equal(model.formatTableCell('표 제목'), '표 제목');
  assert.equal(model.normalizeProblems([problem])[0].choiceFigures[4].figure, figure);
  const word = await zipBlob(await buildDocx(input));
  const wordXml = parse(await word.file('word/document.xml').async('string'));
  assert.equal(wordXml.getElementsByTagName('w:drawing').length, 5);
  assert.equal(wordXml.getElementsByTagName('m:oMath').length, 3);
  assert.ok(wordXml.getElementsByTagName('m:f').length);
  const choiceTable = Array.from(wordXml.getElementsByTagName('w:tbl')).find(t => t.getElementsByTagName('w:drawing').length === 5 && t.getElementsByTagName('w:tc').length === 6);
  assert.ok(choiceTable);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hangul = await zipBlob(await buildHwpx(input, template));
  const hwpxXml = parse(await hangul.file('Contents/section0.xml').async('string'));
  assert.equal(hwpxXml.getElementsByTagName('hp:pic').length, 5);
  assert.equal(hwpxXml.getElementsByTagName('hp:equation').length, 3);
  assert.ok(Array.from(hwpxXml.getElementsByTagName('hp:tbl')).some(t => t.getAttribute('colCnt') === '2' && t.getAttribute('rowCnt') === '3' && t.getElementsByTagName('hp:pic').length === 5));
});
test('sentence choices include OCR prose inside math and manual row layout survives normalization', () => {
  assert.equal(model.hasProseChoices(['$\\text{각 A의 크기는 }130^\\circ\\text{ 이다.}$']), true);
  assert.equal(model.hasProseChoices(['$\\frac{1}{2}$', '$\\sqrt{3}$']), false);
  const [p] = model.normalizeProblems([{ question: '값은?', choices: ['1','2'], choiceLayout: 'rows' }]);
  assert.equal(model.choiceRowsEnabled(p), true);
});
test('invalid OCR formula preserves editable source without blocking either export', async () => {
  const input = { ...doc, problems: [{ ...doc.problems[0], question: '문법 오류 $\\frac{$ 와 정상 수식 $x^2$' }] };
  for (const format of ['docx', 'hwpx']) {
    const prepared = prepareExportDocument(input, format);
    assert.deepEqual(prepared.warnings, [input.problems[0].number]);
    assert.match(prepared.document.problems[0].question, /수식 원문/);
    assert.ok(prepared.document.problems[0].question.includes('$x^2$'));
    const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
    const blob = format === 'docx' ? await buildDocx(prepared.document) : await buildHwpx(prepared.document, template);
    assert.ok(blob.size > 1000);
  }
});
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
  assert.equal(document.getElementsByTagName("w:tc").length, 31);
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
  assert.equal(section.getElementsByTagNameNS(hp, "tc").length, 31);
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
  assert.match(await zip.file('word/document.xml').async('string'), /w:val="11500"/);
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
  assert.equal(document.getElementsByTagName('w:tbl').length, 4);
  assert.equal(document.getElementsByTagName('w:tc').length, 23);
  assert.ok(document.getElementsByTagName('m:f').length >= 2);
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const hwpx = await zipBlob(await buildHwpx(withTables, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)));
  const section = parse(await hwpx.file('Contents/section0.xml').async('string'));
  assert.equal(section.getElementsByTagName('hp:tbl').length, 4);
  assert.equal(section.getElementsByTagName('hp:tc').length, 23);
  const header = parse(await hwpx.file('Contents/header.xml').async('string'));
  assert.ok(Array.from(header.getElementsByTagName('hh:borderFill')).some(n => n.getAttribute('id') === '5'));
  assert.ok(Array.from(section.getElementsByTagName('hp:script')).some(n => n.textContent.includes('15') && n.textContent.includes('over')));
});


test('box prose joins OCR line fragments but preserves Korean statement boundaries and display formulas', () => {
  const text = 'ㄱ.\n$$x$$\n쪽의 책을 하루에 10장씩\n$$y$$\n일 동안 읽었다. ㄴ.\n200g에 1000원인 소고기를\n$x$\ng 샀을 때의 가격은\n$y$\n원이다.\nㄷ. 두 사람의 일의 양은 같다.';
  const fixed = model.formatBoxContent(text);
  assert.equal(fixed.split('\n').length, 3);
  assert.match(fixed, /ㄱ\. \$x\$ 쪽의 책을 하루에 10장씩 \$y\$ 일 동안 읽었다\./);
  assert.match(fixed, /ㄴ\. 200g에 1000원인 소고기를 \$x\$ g 샀을 때의 가격은 \$y\$ 원이다\./);
  assert.equal(model.splitMath(fixed).filter(p => p.display).length, 0);
  assert.ok(model.splitMath(model.formatBoxContent('조건\n$$x^2+y^2=1$$\n을 만족한다.')).some(p => p.display));
});


test('HWPX uses portrait A4, automatic equation metrics, compact anchors and aligned editable choices', async () => {
  const withLayout = { ...doc, title: '중학교 수학 시험', problems: [{ ...doc.problems[0], boxContent: 'ㄱ. $x$는 양수이다.\nㄴ. $y$는 음수이다.' }], choiceColumns: { '0': 3 } };
  const template = fs.readFileSync(path.resolve(__dirname, '../public/typing/blank.hwpx'));
  const zip = await zipBlob(await buildHwpx(withLayout, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)));
  const section = parse(await zip.file('Contents/section0.xml').async('string'));
  const page = section.getElementsByTagName('hp:pagePr')[0];
  assert.equal(page.getAttribute('landscape'), 'WIDELY');
  assert.equal(page.getAttribute('width'), '59528'); assert.equal(page.getAttribute('height'), '84186');
  for (const equation of section.getElementsByTagName('hp:equation')) {
    assert.equal(equation.getAttribute('baseLine'), '0');
    assert.equal(equation.getElementsByTagName('hp:sz')[0].getAttribute('width'), '0');
    assert.equal(equation.getElementsByTagName('hp:sz')[0].getAttribute('height'), '0');
  }
  const tables = Array.from(section.getElementsByTagName('hp:tbl'));
  const headerTable = tables.find(t => t.getAttribute('colCnt') === '3' && t.getElementsByTagName('hp:sz')[0].getAttribute('width') === '51024');
  assert.ok(headerTable); assert.ok(headerTable.textContent.includes(withLayout.title));
  const choiceTable = tables.find(t => t.getAttribute('colCnt') === '3' && t.getAttribute('rowCnt') === '2');
  assert.ok(choiceTable);
  const cells = Array.from(choiceTable.getElementsByTagName('hp:tc'));
  assert.equal(cells[0].getElementsByTagName('hp:cellAddr')[0].getAttribute('colAddr'), cells[3].getElementsByTagName('hp:cellAddr')[0].getAttribute('colAddr'));
  assert.ok(tables.some(t => t.getAttribute('borderFillIDRef') === '5' && t.textContent.includes('양수이다')));
  const header = parse(await zip.file('Contents/header.xml').async('string'));
  const style = Array.from(header.getElementsByTagName('hh:paraPr')).find(p => p.getAttribute('id') === '18');
  assert.ok(Array.from(style.getElementsByTagName('hh:lineSpacing')).every(p => p.getAttribute('value') === '100'));
  const charIds = Array.from(header.getElementsByTagName('hh:charPr')).map(n => n.getAttribute('id'));
  assert.equal(new Set(charIds).size, charIds.length);
});


test('figure coordinates validate bounds and preserve manual recovery when OCR coordinates are invalid', () => {
  assert.deepEqual(model.normalizeFigureBox([250,500,750,900]), [250,500,750,900]);
  for (const value of [[], [0,0,0,10], [-1,0,50,100], [0,0,1001,100], [100,100,50,50], ['0',0,50,50]]) assert.equal(model.normalizeFigureBox(value), undefined);
  const [problem] = model.normalizeProblems([{ question: '그림에서 값을 구하시오.', figureBox: [700,100,200,900] }]);
  assert.equal(problem.figureBox, undefined); assert.match(problem.review, /영역을 직접 선택/);
});

test('coordinate fractions form one full size math expression and formatting is idempotent', () => {
 const value=model.formatChoiceContent('(-10, 4/5)');
 assert.equal(model.splitMath(value).length,1);
 assert.ok(value.includes('\\displaystyle'));
 assert.ok(value.includes('\\left('));
 assert.equal(model.formatChoiceContent(value),value);
});
