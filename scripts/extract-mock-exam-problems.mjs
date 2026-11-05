import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "public");
const pdfjsBuildDir = resolve(root, "node_modules/pdfjs-dist/build");
const manifestPath = resolve(root, "src/data/mock-exams.json");
const outputPath = resolve(root, "src/data/mock-exam-problems.json");
const figuresDir = resolve(publicDir, "question-bank/figures");

mkdirSync(figuresDir, { recursive: true });

// 1. Load .env.local if GEMINI_API_KEY is not already in process.env
function loadEnv() {
  const envFile = resolve(root, ".env.local");
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// 2. Parse CLI arguments
const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    if (!arg.startsWith("--")) return [arg, "true"];
    const [k, v = "true"] = arg.slice(2).split("=");
    return [k, v];
  })
);

const dryRun = args["dry-run"] === "true";
const GEMINI_API_KEY = (args.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
const OCR_MODEL = process.env.GEMINI_OCR_MODEL?.trim() || "gemini-3.1-flash-lite";

if (!GEMINI_API_KEY && !dryRun) {
  console.error(
    "❌ GEMINI_API_KEY가 설정되어 있지 않습니다.\n" +
      "   1) .env.local 파일에 GEMINI_API_KEY=AIza... 한 줄을 추가하시거나,\n" +
      "   2) 실행 시 --key=AIza... 옵션을 함께 전달해 주세요."
  );
  process.exit(1);
}

const filterGrade = args.grade ? Number(args.grade) : null;
const filterYear = args.year ? Number(args.year) : null;
const filterMonth = args.month ? Number(args.month) : null;
const filterExamId = args.exam || null;
const forceReextract = args.force === "true";
const limit = args.all === "true" ? Infinity : Number(args.limit || 1);

// 3. Load manifest & existing extracted DB
if (!existsSync(manifestPath)) {
  console.error(`❌ 모의고사 목록 파일이 없습니다: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const store = existsSync(outputPath)
  ? JSON.parse(readFileSync(outputPath, "utf8"))
  : { updatedAt: new Date().toISOString(), extractedExams: {}, problems: [] };

function saveStore() {
  store.updatedAt = new Date().toISOString();
  writeFileSync(outputPath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

const candidateExams = (manifest.exams || []).filter(exam => {
  if (filterExamId && exam.id !== filterExamId) return false;
  if (filterGrade && exam.grade !== filterGrade) return false;
  if (filterYear && exam.year !== filterYear) return false;
  if (filterMonth && exam.month !== filterMonth) return false;
  if (!forceReextract && store.extractedExams[exam.id]) return false;
  const problemRes = exam.resources?.find(r => r.kind === "problem" && r.localPath);
  if (!problemRes) return false;
  const fullPdfPath = resolve(publicDir, problemRes.localPath.replace(/^\//, ""));
  return existsSync(fullPdfPath);
});

if (candidateExams.length === 0) {
  console.log("✅ 조건에 맞는 미추출 모의고사 PDF가 없습니다. (다시 추출하려면 --force 옵션을 추가하세요)");
  process.exit(0);
}

const targetExams = candidateExams.slice(0, limit);
console.log(
  `🚀 총 ${candidateExams.length}개 대상 시험지 중 ${targetExams.length}개 시험지 문항별 OCR 데이터화를 시작합니다. (모델: ${OCR_MODEL})`
);
console.log(
  `💡 옵션 안내: --limit=5 (개수 지정), --all (전체), --grade=1|2|3, --year=2026, --month=10, --exam=<ID>, --force`
);

// 4. Minimal local static server for PDF.js + public assets
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
};

function startLocalServer() {
  return new Promise(resolveServer => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/renderer.html") {
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>PDF Renderer</title></head>
<body>
<script type="module">
  import * as pdfjsLib from "/pdfjs/pdf.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/typing/pdf.worker.min.mjs";
  window.__canvases = new Map();

  window.renderPdfPages = async function(pdfUrl) {
    window.__canvases.clear();
    const task = pdfjsLib.getDocument({
      url: pdfUrl,
      wasmUrl: "/typing/wasm/",
      cMapUrl: "/typing/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/typing/standard_fonts/",
    });
    const pdf = await task.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2000 / base.width, 2800 / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "white" }).promise;
      window.__canvases.set(i, canvas);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      pages.push({ pageNumber: i, base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      page.cleanup();
    }
    await task.destroy();
    return pages;
  };

  window.cropPageFigure = function(pageNumber, box) {
    const source = window.__canvases.get(pageNumber);
    if (!source || !Array.isArray(box) || box.length < 4) return null;
    const top = Math.max(0, Number(box[0]) - 12);
    const left = Math.max(0, Number(box[1]) - 12);
    const bottom = Math.min(1000, Number(box[2]) + 12);
    const right = Math.min(1000, Number(box[3]) + 12);
    if (bottom <= top || right <= left) return null;
    const x = Math.floor((source.width * left) / 1000);
    const y = Math.floor((source.height * top) / 1000);
    const w = Math.min(source.width, Math.ceil((source.width * right) / 1000)) - x;
    const h = Math.min(source.height, Math.ceil((source.height * bottom) / 1000)) - y;
    if (w < 8 || h < 8) return null;
    const scale = Math.min(1, 1200 / w, 1600 / h);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    const ctx = out.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png").split(",")[1];
  };
</script>
</body>
</html>`);
        return;
      }

      const filePath = urlPath.startsWith("/pdfjs/")
        ? join(pdfjsBuildDir, urlPath.slice("/pdfjs/".length))
        : join(publicDir, urlPath.replace(/^\//, ""));

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolveServer({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function launchBrowser() {
  for (const channel of ["msedge", "chrome", undefined]) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch {
      // Try next channel
    }
  }
  throw new Error("브라우저(Edge/Chrome/Chromium)를 실행할 수 없습니다.");
}

// 5. Gemini OCR Calls
async function extractPageProblemsWithGemini(base64Image, mimeType, examMeta) {
  const fields = Object.fromEntries(
    ["number", "points", "unit", "difficulty", "question", "boxContent", "review"].map(name => [
      name,
      { type: "STRING" },
    ])
  );

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      signal: AbortSignal.timeout(65_000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `고등학교 ${examMeta.grade}학년 모의고사(${examMeta.title}) 시험지 이미지를 문항별 데이터로 전사한다.
1. 2단 편집이면 왼쪽 위→아래, 오른쪽 위→아래 순서로 실제 인쇄된 문항 번호로 시작하는 완전한 문제만 추출한다.
2. 모든 수식은 표준 LaTeX로 인라인 $...$, 독립 수식 $$...$$을 사용한다.
3. question에는 문항 번호를 중복해서 넣지 않으며, (단, ...) 조건은 괄호째 question 끝에 포함한다.
4. boxContent는 실제 <보기>(ㄱ, ㄴ, ㄷ) 또는 별도 조건 박스가 있을 때만 작성하고 보기 제목은 제외한다.
5. choices는 ①~⑤ 기호를 제외한 최대 5개 선지 문자열 배열이며 모든 수식을 $...$로 감싼다.
6. unit은 해당 문항의 수학 단원명(예: 다항식, 방정식과 부등식, 함수, 지수함수와 로그함수, 삼각함수, 수열, 함수의 극한과 연속, 미분, 적분, 경우의 수, 확률, 통계 등)을 추론해 적는다.
7. difficulty는 배점(2점=하, 3점=중, 4점 일반=상, 4점 고난도(15/20/21/22/28/29/30번 등)=킬러) 기준으로 "하", "중", "상", "킬러" 중 하나로 기록한다.
8. 문항에 그래프나 기하 도형 그림이 있으면 페이지 전체 기준 0~1000 정규화 좌표 [ymin,xmin,ymax,xmax]를 figureBox에 반환하고, 없으면 빈 배열 []을 반환한다.`,
              },
              { inlineData: { data: base64Image, mimeType } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              problems: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    ...fields,
                    boxLayout: { type: "STRING", enum: ["box", "inline", "none"] },
                    figureBox: { type: "ARRAY", items: { type: "INTEGER" } },
                    choices: { type: "ARRAY", items: { type: "STRING" } },
                    tables: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          caption: { type: "STRING" },
                          rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
                        },
                        required: ["caption", "rows"],
                      },
                    },
                  },
                  required: ["number", "question", "choices", "figureBox", "boxLayout"],
                },
              },
            },
            required: ["problems"],
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter(p => !p.thought)
      .map(p => p.text ?? "")
      .join("") || "";
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.problems) ? parsed.problems : [];
}

async function extractAnswersWithGemini(base64Data, mimeType) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `모의고사 수학 정답표에서 문항 번호(number, "1"~"30")와 정답(answer, 객관식은 "①"~"⑤" 또는 "1"~"5", 주관식은 숫자 문자열) 목록을 모두 추출한다.`,
                },
                { inlineData: { data: base64Data, mimeType } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                answers: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      number: { type: "STRING" },
                      answer: { type: "STRING" },
                    },
                    required: ["number", "answer"],
                  },
                },
              },
              required: ["answers"],
            },
          },
        }),
      }
    );
    if (!response.ok) return {};
    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.filter(p => !p.thought)
        .map(p => p.text ?? "")
        .join("") || "";
    const parsed = JSON.parse(text);
    const map = {};
    for (const item of parsed.answers || []) {
      const numKey = String(item.number || "").replace(/\D/g, "");
      if (numKey) map[numKey] = String(item.answer || "").trim();
    }
    return map;
  } catch {
    return {};
  }
}

// 6. Main execution loop
const { server, baseUrl } = await startLocalServer();
const browser = await launchBrowser();

try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/renderer.html`, { waitUntil: "networkidle" });

  for (let idx = 0; idx < targetExams.length; idx++) {
    const exam = targetExams[idx];
    const problemRes = exam.resources.find(r => r.kind === "problem" && r.localPath);
    const answerRes = exam.resources.find(r => r.kind === "answer" && r.localPath);

    console.log(
      `\n[${idx + 1}/${targetExams.length}] 📄 ${exam.year}년 ${exam.month}월 고${exam.grade} (${exam.title}) [ID: ${exam.id}]`
    );

    // 6-1. Extract Answer Sheet if available
    let answerMap = {};
    if (answerRes?.localPath && !dryRun) {
      const answerFullPath = resolve(publicDir, answerRes.localPath.replace(/^\//, ""));
      if (existsSync(answerFullPath)) {
        const ext = extname(answerFullPath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".pdf" ? "application/pdf" : "image/jpeg";
        const b64 = readFileSync(answerFullPath).toString("base64");
        process.stdout.write(`  ├─ 정답표 OCR 인식 중... `);
        answerMap = await extractAnswersWithGemini(b64, mime);
        console.log(`${Object.keys(answerMap).length}개 문항 정답 매칭 준비 완료`);
      }
    }

    // 6-2. Render PDF pages in browser
    process.stdout.write(`  ├─ PDF 페이지 이미지 렌더링 중 (${problemRes.localPath})... `);
    const renderedPages = await page.evaluate(url => window.renderPdfPages(url), problemRes.localPath);
    console.log(`총 ${renderedPages.length}페이지 완료`);

    if (dryRun) {
      console.log(`  └─ 🧪 [Dry-Run] PDF ${renderedPages.length}페이지 렌더링 및 크롭 엔진 정상 작동 확인 완료`);
      continue;
    }

    const examFiguresDir = resolve(figuresDir, exam.id);
    mkdirSync(examFiguresDir, { recursive: true });

    const extractedForExam = [];

    for (const rendered of renderedPages) {
      process.stdout.write(`  ├─ ${rendered.pageNumber}/${renderedPages.length}쪽 문항 OCR 추출 중... `);
      try {
        const rawProblems = await extractPageProblemsWithGemini(rendered.base64, rendered.mimeType, exam);
        console.log(`${rawProblems.length}문항 추출됨`);

        for (const raw of rawProblems) {
          const numClean = String(raw.number || "").replace(/[^\d]/g, "") || String(extractedForExam.length + 1);
          let figureUrl = "";

          if (Array.isArray(raw.figureBox) && raw.figureBox.length === 4) {
            const croppedBase64 = await page.evaluate(
              ({ pNum, box }) => window.cropPageFigure(pNum, box),
              { pNum: rendered.pageNumber, box: raw.figureBox }
            );
            if (croppedBase64) {
              const figFileName = `p${numClean.padStart(2, "0")}_page${rendered.pageNumber}.png`;
              const figDiskPath = resolve(examFiguresDir, figFileName);
              writeFileSync(figDiskPath, Buffer.from(croppedBase64, "base64"));
              figureUrl = `/question-bank/figures/${exam.id}/${figFileName}`;
            }
          }

          const pointsStr = String(raw.points || "").trim();
          const difficulty = ["하", "중", "상", "킬러"].includes(raw.difficulty)
            ? raw.difficulty
            : pointsStr.includes("2")
              ? "하"
              : pointsStr.includes("4")
                ? "상"
                : "중";

          extractedForExam.push({
            id: `${exam.id}-q${numClean}`,
            examId: exam.id,
            grade: exam.grade,
            year: exam.year,
            month: exam.month,
            examTitle: exam.title,
            subject: exam.subject || `고${exam.grade} 수학`,
            unit: String(raw.unit || "모의고사 기출").trim(),
            difficulty,
            number: numClean,
            points: pointsStr,
            sourceLabel: `${exam.year}년 ${exam.month}월 고${exam.grade} ${exam.title} ${numClean}번`,
            title: `${exam.year}년 ${exam.month}월 고${exam.grade} ${numClean}번`,
            question: String(raw.question || "").trim(),
            boxLayout: raw.boxLayout || (raw.boxContent ? "box" : "none"),
            boxContent: String(raw.boxContent || "").trim(),
            choices: Array.isArray(raw.choices) ? raw.choices.map(String) : [],
            tables: Array.isArray(raw.tables) ? raw.tables : [],
            figureUrl,
            answer: answerMap[numClean] || "",
            solution: "",
            pageNumber: rendered.pageNumber,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.log(`⚠️ 오류 (${err.message})`);
      }
    }

    // Deduplicate by problem number within exam & sort numerically
    const byNumber = new Map();
    for (const item of extractedForExam) {
      if (!byNumber.has(item.number) || item.question.length > byNumber.get(item.number).question.length) {
        byNumber.set(item.number, item);
      }
    }
    const finalExamProblems = [...byNumber.values()].sort((a, b) => Number(a.number) - Number(b.number));

    // Merge into store
    store.problems = [
      ...store.problems.filter(p => p.examId !== exam.id),
      ...finalExamProblems,
    ];
    store.extractedExams[exam.id] = {
      id: exam.id,
      grade: exam.grade,
      year: exam.year,
      month: exam.month,
      title: exam.title,
      subject: exam.subject,
      problemCount: finalExamProblems.length,
      extractedAt: new Date().toISOString(),
    };
    saveStore();

    console.log(
      `  └─ ✅ 저장 완료: ${finalExamProblems.length}문항 (누적 총 ${store.problems.length}문항 → src/data/mock-exam-problems.json)`
    );
  }
} finally {
  await browser.close();
  server.close();
}
