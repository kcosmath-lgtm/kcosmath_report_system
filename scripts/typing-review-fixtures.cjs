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
  console.log("Review fixtures: .local-backups/typing-review/sample.docx and sample.hwpx");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
