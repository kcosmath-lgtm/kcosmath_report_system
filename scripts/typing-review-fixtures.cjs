/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
global.DOMParser = require("@xmldom/xmldom").DOMParser;
function load(relative) {
  const filename = path.resolve(__dirname, relative), compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = name => name === "./typing-model" ? model : require(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return compiled.exports;
}
const model = load("../src/lib/typing-model.ts");
const { buildDocx, buildHwpx } = load("../src/lib/typing-export.ts");
(async () => {
  const folder = path.resolve(__dirname, "../.local-backups/typing-review"); fs.mkdirSync(folder, { recursive: true });
  const brandImage = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../public/logo.png')).toString('base64');
  const doc = { title: "수학 복습 시험지", brandImage, perPage: 4, choiceColumns: { '0': 5, '1': 5, '2': 5, '3': 5 }, problems: model.sampleProblems.map((p, i) => ({ ...p, id: String(i) })) };
  const template = fs.readFileSync(path.resolve(__dirname, "../public/typing/blank.hwpx"));
  fs.writeFileSync(path.join(folder, "sample.docx"), Buffer.from(await (await buildDocx(doc)).arrayBuffer()));
  fs.writeFileSync(path.join(folder, "sample.hwpx"), Buffer.from(await (await buildHwpx(doc, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength))).arrayBuffer()));
  const longDoc = { ...doc, problems: Array.from({ length: 6 }, (_, i) => ({
    ...doc.problems[i % 4], id: String(i), number: String(i + 1),
    boxContent: 'ㄱ. 분수 $\\frac{14}{3}$와 좌표 $(-10,\\frac{4}{5})$를 확인하고 주어진 조건을 만족하는 값을 구한다.\nㄴ. 표의 두 수 사이의 관계를 설명하고 계산 과정을 쓴다.',
    tables: [{ caption: '', rows: [['x', 'y'], ['1/2', '15/2'], ['3', '6']] }],
    choices: Array.from({ length: 5 }, (_, n) => `주어진 조건을 만족하는 수는 $\\frac{${n + 1}}{3}$이고 이 관계는 모든 실수에 대하여 성립한다.`), choiceLayout: 'rows',
  })) };
  for (const [name, blob] of [['long.docx', await buildDocx(longDoc)], ['long.hwpx', await buildHwpx(longDoc, template)]])
    fs.writeFileSync(path.join(folder, name), Buffer.from(await blob.arrayBuffer()));
  console.log("Review fixtures: .local-backups/typing-review/sample.docx and sample.hwpx");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
