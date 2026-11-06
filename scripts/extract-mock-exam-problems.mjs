import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import katex from "katex";

const root = resolve(import.meta.dirname, "..");
const publicDir = resolve(root, "public");
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
const filterGrade = args.grade ? Number(args.grade) : null;
const filterYear = args.year ? Number(args.year) : null;
const filterMonth = args.month ? Number(args.month) : null;
const filterExamId = args.exam || null;
const forceReextract = args.force === "true";
const limit = args.all === "true" ? Infinity : Number(args.limit || 9);

// 3. HWP Equation PUA Unicode -> Standard LaTeX Converter
const PUA_MAP = {
  0xe03e: "!",
  0xe042: "\\%",
  0xe044: "(",
  0xe045: ")",
  0xe046: "-",
  0xe047: "=",
  0xe048: "+",
  0xe049: "[",
  0xe04a: "]",
  0xe04b: "\\{",
  0xe04c: "\\}",
  0xe04d: "\\mid ",
  0xe04f: ":",
  0xe052: ", ",
  0xe053: ".",
  0xe055: "<",
  0xe056: ">",
  0xe05b: "\\int ",
  0xe05c: "\\sqrt",
  0xe067: "\\sum ",
  0xe06d: "__BAR__",
  0xe06e: "\\vec ",
  0xe078: "\\{",
  0xe079: "",
  0xe07a: "",
  0xe07b: "",
  0xe09d: "\\alpha ",
  0xe09e: "\\beta ",
  0xe09f: "\\gamma ",
  0xe0a4: "\\theta ",
  0xe0ac: "\\pi ",
  0xe0ae: "\\sigma ",
  0xe0c8: "^\\circ ",
  0xe100: "[",
  0xe101: "|",
  0xe102: "]",
  0xe103: "",
  0xe104: "",
  0xe105: "",
};

function decodeHwpPuaChar(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0xe000 && c <= 0xe019) return String.fromCharCode(65 + c - 0xe000);
  if (c >= 0xe0e5 && c <= 0xe0fe) return String.fromCharCode(97 + c - 0xe0e5);
  if (c >= 0xe034 && c <= 0xe03c) return String.fromCharCode(49 + c - 0xe034);
  if (c === 0xe03d) return "0";
  if (PUA_MAP[c] !== undefined) return PUA_MAP[c];
  if (c >= 0xe000 && c <= 0xf8ff) return "";
  return ch;
}

function isPuaString(str) {
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= 0xe000 && c <= 0xf8ff) return true;
  }
  return false;
}

function decodeHwpString(str) {
  return [...str]
    .map(decodeHwpPuaChar)
    .join("")
    .replace(/′/g, "'")
    .replace(/≤/g, " \\le ")
    .replace(/≥/g, " \\ge ")
    .replace(/≠/g, " \\ne ")
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/⋯/g, " \\cdots ");
}

/**
 * Splits a radicand string when the PDF text item extends beyond the radical overbar's width.
 * E.g. "2 \times 4" under a short bar -> ["2", "\times 4"]
 *      "3 = 0" under a short bar -> ["3", "= 0"]
 *      "x + 11 - 3" under a medium bar -> ["x + 11", "- 3"]
 */
function splitByBarCoverage(rawText, itemWidth, barWidth, modalH) {
  const s = rawText.replace(/__BAR__/g, "").trim();
  if (!s) return ["", ""];
  if (!barWidth || !itemWidth || itemWidth <= barWidth + 2.8) {
    return [s, ""];
  }
  // Short bar (typically covering a single number/symbol)
  if (barWidth <= modalH * 0.95) {
    const m = s.match(/^(-?\s*[0-9A-Za-z\\]+)\s*(.+)$/);
    if (m) return [m[1].trim(), m[2].trim()];
  }
  // Medium/long bar: check if there's a trailing relation or additive term outside the bar
  const relMatch = s.match(/^(.+?)\s*([=<>]|\\le|\\ge|\\ne|\\times|\()\s*(.*)$/);
  if (relMatch) {
    return [relMatch[1].trim(), `${relMatch[2]} ${relMatch[3]}`.trim()];
  }
  // E.g. "x + 11 - 3" where "- 3" is outside the bar
  const pmMatches = [...s.matchAll(/\s+([+\-])\s+/g)];
  if (pmMatches.length >= 2) {
    const lastPm = pmMatches[pmMatches.length - 1];
    if (lastPm.index !== undefined && lastPm.index > 0) {
      return [s.slice(0, lastPm.index).trim(), s.slice(lastPm.index).trim()];
    }
  }
  return [s, ""];
}

/**
 * Formats a small group of items (inside a radical, numerator, or denominator)
 * into a clean LaTeX string, handling internal superscripts/subscripts.
 */
function formatSubGroupToLatex(subItems, modalH) {
  if (!subItems || subItems.length === 0) return "";
  const scriptThreshold = modalH * 0.78;
  let baseY = null;
  for (const it of subItems) {
    if (it.h >= modalH * 0.84) {
      baseY = it.y;
      break;
    }
  }
  if (baseY === null) baseY = subItems[0].y;

  let out = "";
  let i = 0;
  while (i < subItems.length) {
    const cur = subItems[i];
    const t = cur.text.replace(/__BAR__/g, "").trim();
    if (!t) {
      i++;
      continue;
    }
    if (
      out.length > 0 &&
      cur.h < scriptThreshold &&
      Math.abs(cur.y - baseY) >= modalH * 0.14 &&
      Math.abs(cur.y - baseY) <= modalH * 0.85
    ) {
      const isSup = cur.y > baseY;
      let scriptBuf = t;
      i++;
      while (
        i < subItems.length &&
        subItems[i].h < scriptThreshold &&
        (isSup ? subItems[i].y > baseY + modalH * 0.12 : subItems[i].y < baseY - modalH * 0.12)
      ) {
        scriptBuf += " " + subItems[i].text.replace(/__BAR__/g, "").trim();
        i++;
      }
      scriptBuf = scriptBuf.trim();
      out += isSup
        ? scriptBuf.length === 1 ? `^${scriptBuf}` : `^{${scriptBuf}}`
        : scriptBuf.length === 1 ? `_${scriptBuf}` : `_{${scriptBuf}}`;
      continue;
    }
    if (cur.h >= modalH * 0.84) baseY = cur.y;
    out += (out ? " " : "") + t;
    i++;
  }
  return out.trim();
}

/**
 * Repairs and validates a single LaTeX math span with KaTeX so that 0 yellow-highlighted
 * syntax errors ever appear in TypingMath.
 */
function sanitizeMathSpan(rawMath) {
  let m = String(rawMath || "").trim().replace(/\s+/g, " ");
  if (!m) return "";
  m = m.replace(/(?<!\\)(sin|cos|tan|log|ln|lim)(?=[a-zA-Z0-9(\s\\_^])/g, "\\$1 ");
  m = m.replace(/\)\s*_\s*([234])\b/g, ")^$1");
  m = m.replace(/\\sqrt\s*\^\s*\{?([234n])\}?\s*\\sqrt\{([^}]+)\}/g, "\\sqrt[$1]{\\sqrt{$2}}");
  m = m.replace(/\\sqrt\s*\^\s*\{?([234n])\}?\s*(\\[a-zA-Z]+\{[^}]+\}\{[^}]+\}|[0-9a-zA-Z]+)/g, "\\sqrt[$1]{$2}");
  m = m.replace(/\\sqrt(?!\s*[\[{])\s*([0-9a-zA-Z]+)/g, "\\sqrt{$1}");
  m = m.replace(/\\sqrt(?!\s*[\[{])/g, "");
  m = m.replace(/\\vec\s*([A-Za-z]{1,3})/g, "\\overrightarrow{$1}");
  m = m.replace(/\\vec(?![A-Za-z{])/g, "");
  m = m.replace(/→/g, " \\to ");
  m = m.replace(/⋅/g, " \\cdot ");
  m = m.replace(/∠\s*([A-Z]{1,3})/g, "\\angle $1");
  m = m.replace(/\\lim\s+([a-zA-Z]\s*\\to\s*[-+]?\s*(?:\\infty|[0-9a-zA-Z]+))/g, "\\lim_{$1}");
  m = m.replace(/\\overline\{([A-Za-z0-9]+)\}\s+([234])\b/g, "\\overline{$1}^{$2}");
  m = m.replace(/\)\s+([234])\b/g, ")^{$1}");
  m = m.replace(/\b([lABCDMNPQRS])\s+([1234])\b/g, "$1_{$2}");
  m = m.replace(/\b([abcxyzkmn])\s+([234])\b(?=\s*[+\-=,<>)|]|$)/g, "$1^{$2}");

  // Merge any accidental consecutive superscripts or subscripts: ^a ^b -> ^{a b}
  let prev;
  do {
    prev = m;
    m = m.replace(/\^(\{[^{}]*\}|[0-9a-zA-Z+\-=()])\s*\^(\{[^{}]*\}|[0-9a-zA-Z+\-=()])/g, (_, a, b) => {
      const ca = a.startsWith("{") && a.endsWith("}") ? a.slice(1, -1) : a;
      const cb = b.startsWith("{") && b.endsWith("}") ? b.slice(1, -1) : b;
      return `^{${ca}${cb}}`;
    });
    m = m.replace(/_(\{[^{}]*\}|[0-9a-zA-Z+\-=()])\s*_(\{[^{}]*\}|[0-9a-zA-Z+\-=()])/g, (_, a, b) => {
      const ca = a.startsWith("{") && a.endsWith("}") ? a.slice(1, -1) : a;
      const cb = b.startsWith("{") && b.endsWith("}") ? b.slice(1, -1) : b;
      return `_{${ca}${cb}}`;
    });
  } while (m !== prev);

  // Strip leading or trailing dangling ^ or _
  m = m.replace(/^\s*[\^_]+\s*\{?([^{}]*)\}?\s*$/, "$1");
  m = m.replace(/(^|[\s(=+\-,])\s*[\^_]\s*(\{[^{}]*\}|[0-9a-zA-Z]+)/g, "$1$2");
  m = m.replace(/[\^_]\s*$/g, "");

  // Balance braces if needed
  const openCount = (m.match(/(?<!\\)\{/g) || []).length;
  const closeCount = (m.match(/(?<!\\)\}/g) || []).length;
  if (openCount > closeCount) {
    m += "}".repeat(openCount - closeCount);
  } else if (closeCount > openCount) {
    let extra = closeCount - openCount;
    m = m.replace(/(?<!\\)\}/g, match => (extra-- > 0 ? "" : match));
  }

  try {
    katex.renderToString(m, { throwOnError: true, strict: "ignore" });
    return m.trim();
  } catch {
    // Fallback progressive cleanup if KaTeX still complains
    let fallback = m
      .replace(/\\frac\{\s*\}\{([^}]*)\}/g, "\\overline{$1}")
      .replace(/\\sqrt(?!\s*[\[{])/g, "")
      .replace(/[\^_]\s*(\{[^{}]*\})/g, (_, g) => g.slice(1, -1))
      .replace(/[\^_]/g, "");
    try {
      katex.renderToString(fallback, { throwOnError: true, strict: "ignore" });
      return fallback.trim();
    } catch {
      return fallback.replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "").trim();
    }
  }
}

/**
 * Converts pdfjs getTextContent() items into clean text with inline $...$ LaTeX math,
 * handling HWP fractions (__BAR__ denom num -> \frac{num}{denom}), overlines (\overline{AB}),
 * vector arrows (\overrightarrow{BP}), radicals (\sqrt), superscripts, and subscripts.
 */
function convertPdfItemsToLatexText(rawItems, kind = "problem") {
  // 1. Filter out whitespace-only items and decode HWP PUA characters
  const initialItems = [];
  for (const it of rawItems) {
    if (!it || typeof it.str !== "string" || !it.str.trim()) continue;
    const x = Number(it.transform?.[4] ?? 0);
    const y = Number(it.transform?.[5] ?? 0);
    const h = Math.abs(Number(it.transform?.[0] ?? 11));
    const w = Number(it.width ?? 0);
    const decoded = decodeHwpString(it.str);
    const t = decoded.trim();
    if (!t) continue;

    // Filter out page headers, footers, and horizontal divider lines
    if (
      /^(수학\s*영역|5\s*지\s*선\s*다\s*형|단\s*답\s*형|\*\s*확인\s*사항|※\s*확인\s*사항|◦\s*답안지|◦\s*이어서|정\s*답\s*및\s*해\s*설|해\s*설|정\s*답)$/.test(t) ||
      /\d{4}\s*학년도|전국연합학력평가|대학수학능력시험|문제지|제\s*2\s*교시|홀수형|짝수형|무단\s*전재|재배포는\s*금지|[━─_]{3,}/.test(t) ||
      (kind === "problem" && (y > 995 || y < 108) && /^(?:고\s*[123]|\d{1,2}(?:\s+\d{1,2})?)$/.test(t)) ||
      (kind === "explanation" && (y > 735 || y < 70))
    ) {
      continue;
    }

    // Split combined "\sqrt__BAR__" ("") into two items so Pass A handles it uniformly
    if (t === "\\sqrt__BAR__") {
      const sqrtW = Math.min(w * 0.25, h * 0.85);
      initialItems.push({
        raw: "\ue05c",
        text: "\\sqrt",
        hasPua: true,
        x,
        y,
        h,
        w: sqrtW,
      });
      initialItems.push({
        raw: "\ue06d",
        text: "__BAR__",
        hasPua: true,
        x: x + sqrtW,
        y: y + 1.2,
        h,
        w: Math.max(4, w - sqrtW),
      });
      continue;
    }

    initialItems.push({
      raw: it.str,
      text: decoded,
      hasPua: isPuaString(it.str),
      x,
      y,
      h,
      w,
    });
  }

  if (initialItems.length === 0) return "";

  // Determine the page's modal base font height (adapts to 6.36pt, 6.84pt, 9.00pt, 11.04pt, 12.00pt)
  const baseHeights = initialItems
    .filter(it => /[가-힣]/.test(it.text) || (it.hasPua && /[A-Za-z]/.test(it.text)))
    .map(it => it.h)
    .sort((a, b) => a - b);
  const modalH = baseHeights.length > 0
    ? baseHeights[Math.floor(baseHeights.length * 0.65)]
    : kind === "explanation" ? 6.5 : 11.0;

  // In explanation PDFs, filter out embedded graph/figure axis labels (which use slightly scaled font ~0.82..0.93 * modalH or isolated O/x/y)
  const filteredItems = kind === "explanation"
    ? initialItems.filter(it => {
        const t = it.text.trim();
        if (t === "O" && it.h < modalH * 0.96) return false;
        if (it.h >= modalH * 0.81 && it.h <= modalH * 0.91 && !/[가-힣]|출제의도/.test(t)) return false;
        return true;
      })
    : initialItems;

  // 2. Pass A: Collapse Radicals (\sqrt and \sqrt[n]) BEFORE fractions
  const afterRadicals = [];
  for (let i = 0; i < filteredItems.length; i++) {
    const cur = filteredItems[i];
    const t = cur.text.trim();

    if (t === "\\sqrt" || t.endsWith("\\sqrt")) {
      const prefix = t === "\\sqrt" ? "" : t.replace(/\\sqrt$/, "").trim();
      if (prefix) {
        afterRadicals.push({ ...cur, text: prefix, w: Math.max(2, cur.w * 0.4) });
      }
      const next1 = filteredItems[i + 1];
      const next2 = filteredItems[i + 2];
      let idxStr = "";
      let barIdx = -1;

      if (next1 && next1.text.trim() === "__BAR__") {
        barIdx = i + 1;
      } else if (
        next1 &&
        next2 &&
        next2.text.trim() === "__BAR__" &&
        next1.h < modalH * 0.78 &&
        /^[234n]$/.test(next1.text.trim())
      ) {
        idxStr = next1.text.trim();
        barIdx = i + 2;
      }

      if (barIdx !== -1 && filteredItems[barIdx + 1]) {
        const bar = filteredItems[barIdx];
        const barRight = bar.x + Math.max(bar.w, 4);
        const radGroup = [];
        let k = barIdx + 1;
        while (
          k < filteredItems.length &&
          filteredItems[k].text.trim() !== "__BAR__" &&
          filteredItems[k].x < barRight - 0.5 &&
          Math.abs(filteredItems[k].y - bar.y) <= modalH * 1.15
        ) {
          radGroup.push(filteredItems[k]);
          k++;
        }
        if (radGroup.length === 0) {
          radGroup.push(filteredItems[barIdx + 1]);
          k = barIdx + 2;
        }

        // Check if the last item in radGroup extends beyond the radical bar
        const lastItem = radGroup[radGroup.length - 1];
        let remainderText = "";
        if (radGroup.length === 1) {
          const [inside, outside] = splitByBarCoverage(lastItem.text, lastItem.w, bar.w, modalH);
          radGroup[0] = { ...lastItem, text: inside };
          remainderText = outside;
        } else if (lastItem.x + lastItem.w > barRight + 3.5) {
          const remW = barRight - lastItem.x;
          const [inside, outside] = splitByBarCoverage(lastItem.text, lastItem.w, Math.max(3, remW), modalH);
          radGroup[radGroup.length - 1] = { ...lastItem, text: inside };
          remainderText = outside;
        }

        const radLatex = formatSubGroupToLatex(radGroup, modalH);
        const baseRadItem = radGroup.find(r => r.h >= modalH * 0.8) || radGroup[0];
        afterRadicals.push({
          raw: cur.raw,
          text: idxStr ? `\\sqrt[${idxStr}]{${radLatex}}` : `\\sqrt{${radLatex}}`,
          hasPua: true,
          x: cur.x,
          y: baseRadItem.y,
          h: baseRadItem.h,
          w: Math.max(6, barRight - cur.x),
        });
        if (remainderText) {
          afterRadicals.push({
            raw: remainderText,
            text: remainderText,
            hasPua: true,
            x: barRight,
            y: lastItem.y,
            h: lastItem.h,
            w: Math.max(4, lastItem.x + lastItem.w - barRight),
          });
        }
        i = k - 1;
        continue;
      } else if (next1) {
        // Fallback when \sqrt has no __BAR__
        const [inside, outside] = splitByBarCoverage(next1.text, next1.w, modalH * 0.8, modalH);
        afterRadicals.push({
          raw: cur.raw,
          text: `\\sqrt{${inside}}`,
          hasPua: true,
          x: cur.x,
          y: next1.y,
          h: next1.h,
          w: cur.w + next1.w,
        });
        if (outside) {
          afterRadicals.push({ ...next1, text: outside, x: next1.x + modalH * 0.8 });
        }
        i += 1;
        continue;
      }
    }

    afterRadicals.push(cur);
  }

  // 3. Pass B: Collapse Vector Arrows (__BAR__ + \vec), Fractions, and Overlines (__BAR__)
  const items = [];
  for (let i = 0; i < afterRadicals.length; i++) {
    const cur = afterRadicals[i];
    const t = cur.text.trim();

    // Standalone \vec
    if (t === "\\vec" && afterRadicals[i + 1]) {
      const target = afterRadicals[i + 1];
      const m = target.text.trim().match(/^([A-Za-z0-9]{1,3})\s*(.*)$/);
      if (m) {
        items.push({
          ...target,
          text: `\\overrightarrow{${m[1]}}`,
          hasPua: true,
        });
        if (m[2]) {
          items.push({ ...target, text: m[2], x: target.x + 10 });
        }
        i += 1;
        continue;
      }
    }

    if (t === "__BAR__" || t.endsWith("__BAR__")) {
      const prefix = t === "__BAR__" ? "" : t.replace(/__BAR__$/, "").trim();
      if (prefix) {
        items.push({ ...cur, text: prefix, hasPua: true });
      }

      // Check for HWP Vector Arrow: __BAR__ + \vec + Target ("BP = 2")
      const next1 = afterRadicals[i + 1];
      const next2 = afterRadicals[i + 2];
      if (next1 && next1.text.trim() === "\\vec" && next2) {
        const m = next2.text.replace(/__BAR__/g, "").trim().match(/^([A-Za-z0-9]{1,3})\s*(.*)$/);
        if (m) {
          items.push({
            ...next2,
            text: `\\overrightarrow{${m[1]}}`,
            hasPua: true,
          });
          if (m[2]) {
            items.push({
              ...next2,
              text: m[2],
              hasPua: true,
              x: cur.x + Math.max(cur.w, 12),
            });
          }
          i += 2;
          continue;
        }
      }

      // Collect denominator items (below bar.y) and numerator items (above bar.y)
      const bar = cur;
      const barLeft = bar.x - 3.5;
      const barRight = bar.x + Math.max(bar.w, 4.5) - 0.5;

      // Do not consume problem headers or [출제의도] headers under a figure box border bar
      if (
        afterRadicals[i + 1] &&
        (/출제의도/.test(afterRadicals[i + 1].text) || /^\d{1,2}\.$/.test(afterRadicals[i + 1].text.trim()))
      ) {
        continue;
      }

      const denomGroup = [];
      let k = i + 1;
      while (
        k < afterRadicals.length &&
        afterRadicals[k].text.trim() !== "__BAR__" &&
        !/출제의도/.test(afterRadicals[k].text) &&
        afterRadicals[k].y < bar.y - 0.2 &&
        afterRadicals[k].y > bar.y - modalH * 1.35 &&
        afterRadicals[k].x >= barLeft &&
        afterRadicals[k].x <= barRight + 1.5
      ) {
        denomGroup.push(afterRadicals[k]);
        k++;
      }
      if (
        denomGroup.length === 0 &&
        afterRadicals[i + 1] &&
        !/출제의도/.test(afterRadicals[i + 1].text) &&
        afterRadicals[i + 1].y < bar.y + 0.5 &&
        afterRadicals[i + 1].y > bar.y - modalH * 1.35
      ) {
        denomGroup.push(afterRadicals[i + 1]);
        k = i + 2;
      }

      // Numerator of a fraction is strictly above the text baseline (y > bar.y + modalH * 0.42)
      const numMinY = bar.y + modalH * 0.42;
      const numGroup = [];
      let m = k;
      while (
        m < afterRadicals.length &&
        afterRadicals[m].text.trim() !== "__BAR__" &&
        !/출제의도|값은\?|구하시오/.test(afterRadicals[m].text) &&
        afterRadicals[m].y >= numMinY &&
        afterRadicals[m].y < bar.y + modalH * 1.65 &&
        afterRadicals[m].x >= barLeft &&
        afterRadicals[m].x <= barRight + 1.0
      ) {
        numGroup.push(afterRadicals[m]);
        m++;
      }

      if (denomGroup.length > 0 && numGroup.length > 0) {
        const denomLatex = formatSubGroupToLatex(denomGroup, modalH);
        const numLatex = formatSubGroupToLatex(numGroup, modalH);
        const isScriptFrac =
          denomGroup[0].h < modalH * 0.78 && numGroup[0].h < modalH * 0.78;
        items.push({
          raw: cur.raw,
          text: `\\frac{${numLatex}}{${denomLatex}}`,
          hasPua: true,
          x: bar.x,
          y: isScriptFrac ? (denomGroup[0].y + numGroup[0].y) / 2 : bar.y + modalH * 0.28,
          h: isScriptFrac ? numGroup[0].h : modalH,
          w: Math.max(bar.w, 6),
        });
        i = m - 1;
        continue;
      } else if (denomGroup.length > 0 && numGroup.length === 0) {
        // Overline: e.g. \overline{AB}, \overline{BC}^2, \overline{z}
        const firstDenom = denomGroup[0];
        const segMatch = firstDenom.text.replace(/__BAR__/g, "").trim().match(/^([A-Za-z0-9]{1,4})\s*(.*)$/);
        if (segMatch) {
          items.push({
            ...firstDenom,
            text: `\\overline{${segMatch[1]}}`,
            hasPua: true,
            w: Math.min(firstDenom.w, Math.max(bar.w, 8)),
          });
          if (segMatch[2]) {
            items.push({
              ...firstDenom,
              text: segMatch[2],
              hasPua: true,
              x: firstDenom.x + Math.max(bar.w, 8),
            });
          }
          for (let dIdx = 1; dIdx < denomGroup.length; dIdx++) {
            items.push(denomGroup[dIdx]);
          }
          i = k - 1;
          continue;
        }
      }
      continue;
    }

    items.push(cur);
  }

  // 4. Pass C: Convert items to LaTeX tokens with accurate superscript/subscript grouping
  const outTokens = [];
  let baseY = null;
  let lastBaseItem = null;
  const scriptThreshold = modalH * 0.78;
  const baseThreshold = modalH * 0.86;

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const t = cur.text.replace(/__BAR__/g, "").trim();
    if (!t) continue;

    // Detect problem start in Problem PDF: e.g. "1." .. "30." with font size >= 12.0
    const probStartMatch = kind === "problem" && cur.h >= 12.0 ? t.match(/^([1-9]|[12]\d|30)\.(?:\s*(.*))?$/) : null;
    if (probStartMatch) {
      const pNum = probStartMatch[1];
      const rest = probStartMatch[2] || "";
      outTokens.push({ text: `\n@@PROB_${pNum}@@ ${rest}`, isMath: false });
      baseY = cur.y;
      lastBaseItem = cur;
      continue;
    }

    const cleanText = cur.text.replace(/__BAR__/g, "").trim();
    const isMathToken =
      cur.hasPua ||
      cleanText === "'" ||
      (/^[A-Za-z0-9+\-=<>()',\s\\]+$/.test(cleanText) &&
        !/^\d+\.?$/.test(cleanText) &&
        !/^[①②③④⑤⑥⑦⑧⑨⑩㉠㉡㉢㉣]$/.test(cleanText) &&
        (Math.abs(cur.h - modalH) < 1.2 ||
          cur.h < scriptThreshold ||
          /^(sin|cos|tan|log|ln|lim)$/i.test(cleanText)));

    // Reset baseY when a new line starts (cur.x moves left or y jumps by more than 1.25 * modalH)
    if (
      lastBaseItem &&
      (cur.x < lastBaseItem.x - 8 || Math.abs(cur.y - baseY) > modalH * 1.25)
    ) {
      if (cur.h >= baseThreshold) {
        baseY = cur.y;
        lastBaseItem = cur;
      } else {
        baseY = null;
        lastBaseItem = null;
      }
    }

    // Detect superscript / subscript when font height is smaller than scriptThreshold
    // AND horizontally adjacent to the preceding base item on the same line
    if (
      (cur.hasPua || isMathToken) &&
      cur.h < scriptThreshold &&
      baseY !== null &&
      lastBaseItem !== null &&
      cur.x >= lastBaseItem.x - 2 &&
      cur.x <= lastBaseItem.x + lastBaseItem.w + modalH * 1.6 &&
      Math.abs(cur.y - baseY) >= modalH * 0.14 &&
      Math.abs(cur.y - baseY) <= modalH * 1.15
    ) {
      const isSup = cur.y > baseY;
      let scriptBuf = cleanText;
      let lastScriptItem = cur;
      while (
        i + 1 < items.length &&
        items[i + 1].h < scriptThreshold &&
        items[i + 1].x >= lastScriptItem.x - 1 &&
        items[i + 1].x <= lastScriptItem.x + lastScriptItem.w + modalH * 1.4 &&
        (isSup
          ? items[i + 1].y > baseY + modalH * 0.12 && items[i + 1].y <= baseY + modalH * 1.15
          : items[i + 1].y < baseY - modalH * 0.12 && items[i + 1].y >= baseY - modalH * 1.15)
      ) {
        i++;
        lastScriptItem = items[i];
        scriptBuf += " " + lastScriptItem.text.replace(/__BAR__/g, "").trim();
      }
      scriptBuf = scriptBuf.trim();
      if (scriptBuf) {
        outTokens.push({
          text: isSup
            ? scriptBuf.length === 1 ? `^${scriptBuf}` : `^{${scriptBuf}}`
            : scriptBuf.length === 1 ? `_${scriptBuf}` : `_{${scriptBuf}}`,
          isMath: true,
        });
        lastBaseItem = {
          ...lastBaseItem,
          w: (lastScriptItem.x + lastScriptItem.w) - lastBaseItem.x,
        };
        continue;
      }
    }

    if (cur.h >= baseThreshold) {
      baseY = cur.y;
      lastBaseItem = cur;
    }

    outTokens.push({ text: cleanText, isMath: isMathToken });
  }

  // Merge adjacent math tokens into $...$ spans
  let result = "";
  let mathBuf = "";
  for (const tok of outTokens) {
    if (tok.isMath) {
      mathBuf += (mathBuf ? " " : "") + tok.text;
    } else {
      if (mathBuf.trim()) {
        const sanitized = sanitizeMathSpan(mathBuf);
        if (sanitized) result += ` $${sanitized}$ `;
        mathBuf = "";
      }
      result += (result && !result.endsWith("\n") ? " " : "") + tok.text;
    }
  }
  if (mathBuf.trim()) {
    const sanitized = sanitizeMathSpan(mathBuf);
    if (sanitized) result += ` $${sanitized}$ `;
  }

  return result
    .replace(/\$\s*\$/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.)?!])/g, "$1")
    .trim();
}

function inferMathUnit(text, grade) {
  const s = String(text || "");
  if (/행렬/.test(s)) return "행렬과 연산";
  if (/다항식|나머지정리|인수분해|항등식/.test(s)) return "다항식과 나머지정리";
  if (/복소수|허수/.test(s)) return "복소수와 이차방정식";
  if (/원의\s*방정식|원\s*\$?C|접선.*원|반지름/.test(s)) return "원의 방정식과 도형";
  if (/대칭이동|평행이동/.test(s)) return "도형의 이동";
  if (/집합|원소|부분집합|명제|충분조건|필요조건|대우/.test(s)) return "집합과 명제";
  if (/유리함수|무리함수|점근선/.test(s)) return "유리·무리함수";
  if (/경우의\s*수|순열|조합|나열/.test(s)) return "순열과 조합";
  if (/확률변수|정규분포|신뢰구간|표본|이항분포/.test(s)) return "통계 (확률분포와 추정)";
  if (/조건부확률|독립시행|사건|확률/.test(s)) return "확률의 뜻과 활용";
  if (/쌍곡선|포물선|타원|초점|준선/.test(s)) return "이차곡선 (기하)";
  if (/벡터|내적|정사영|공간도형|구의\s*방정식/.test(s)) return "벡터와 공간도형 (기하)";
  if (/급수|\\infty|무한등비/.test(s)) return "수열의 극한과 급수";
  if (/등차수열|등비수열|수열|첫째항|공차|공비|\\sum/.test(s)) return "수열 (등차·등비·귀납적 정의)";
  if (/sin|cos|tan|삼각함수|호도법|외접원|사인법칙|코사인법칙/.test(s)) return "삼각함수와 도형";
  if (/지수|로그|log/.test(s)) return "지수함수와 로그함수";
  if (/\\int|정적분|부정적분|넓이/.test(s)) return "정적분과 넓이 활용";
  if (/미분|도함수|극대|극소|접선|f\s*′|g\s*′|f\s*'/.test(s)) return "미분법과 도함수의 활용";
  if (/lim|극한|연속/.test(s)) return "함수의 극한과 연속";
  if (/이차함수|이차방정식|이차부등식|실근/.test(s)) return "이차방정식과 이차함수";
  return grade === 1 ? "공통수학" : grade === 2 ? "수학I · 수학II" : "수학I · 수학II · 선택";
}

function classifyDifficulty(num, pointsStr) {
  const n = Number(num);
  if ([15, 21, 22, 29, 30].includes(n)) return "킬러";
  if ([13, 14, 19, 20, 27, 28].includes(n)) return "상";
  if (pointsStr.includes("2") || n <= 4 || n === 23) return "하";
  if (pointsStr.includes("4")) return "상";
  return "중";
}

function attachAutoGeoSpecIfApplicable(unit, difficulty, num, question) {
  const n = Number(num);
  const q = String(question || "");
  if (/원.*x\^2\s*\+\s*y\^2|원의\s*방정식/.test(q) || unit.includes("원의 방정식")) {
    return {
      title: `${num}번 · 원과 직선 기하 도형`,
      xRange: [-4.5, 5.5],
      yRange: [-4.2, 4.2],
      showAxes: true,
      equalAspect: true,
      circles: [{ cx: 0, cy: 0, r: 3 }],
      polygons: [{ points: [[-1.8, 2.4], [-1.8, -2.4], [3.8, 0]], shaded: true }],
      segments: [{ x1: -3.2, y1: 3.4, x2: 4.5, y2: -0.4 }],
      points: [
        { x: 3, y: 0, label: "A", labelOffset: [6, 14] },
        { x: -1.8, y: 2.4, label: "B", dropToX: true, xTick: "-3" },
        { x: -1.8, y: -2.4, label: "C", labelOffset: [-16, 14] },
      ],
    };
  }
  if ((difficulty === "킬러" || difficulty === "상") && (/미분|정적분|\\int|극대|극소|접선/.test(q) || [14, 15, 20, 21, 22, 28, 30].includes(n))) {
    if (/sin|cos|\\pi/.test(q)) {
      return {
        title: `${num}번 · 삼각함수와 합성함수 추론 그래프`,
        xRange: [-0.5, 6.8],
        yRange: [-1.8, 2.8],
        showAxes: true,
        functions: [
          { expr: "-sin(x) + 1", label: "y=f(x)", domain: [0, 6.28], labelPos: [4.7, 2.1] },
          { expr: "(sin(x) - 1)^2", label: "y=g(f(x))", style: "dashed", domain: [0, 6.28], labelPos: [1.6, 0.4] },
        ],
        shadedRegions: [{ f1: "-sin(x) + 1", f2: "0", from: 0, to: 3.14 }],
        points: [
          { x: 1.57, y: 0, label: "π/2a", dropToX: true, xTick: "π/2a" },
          { x: 3.14, y: 1, label: "π/a", dropToX: true, xTick: "π/a" },
        ],
      };
    }
    if (/log|지수|4\^|2\^/.test(q)) {
      return {
        title: `${num}번 · 지수·로그함수와 직선 교점 추론`,
        xRange: [-1.5, 5.2],
        yRange: [-1.5, 5.2],
        showAxes: true,
        equalAspect: true,
        functions: [
          { expr: "2^(x-1)", label: "y=a^{x-k}", labelPos: [2.7, 4.1] },
          { expr: "log(x)/log(2) + 1", label: "y=log_a(x)+k", domain: [0.15, 5.0], labelPos: [3.4, 2.4] },
          { expr: "0.5*x + 0.5", label: "y=mx+n", style: "dashed", labelPos: [3.8, 2.7] },
        ],
        points: [
          { x: 1, y: 1, label: "A", dropToX: true, xTick: "x₁" },
          { x: 3, y: 2.58, label: "C", dropToX: true, xTick: "x₂" },
        ],
      };
    }
    return {
      title: `${num}번 · 다항함수 개형 및 조건 추론`,
      xRange: [-2.2, 3.8],
      yRange: [-1.8, 5.5],
      showAxes: true,
      functions: [
        { expr: "abs(x^3 - 3*x + 1)", label: "y=g(x)", labelPos: [2.05, 4.1] },
        { expr: "0.8*x + 1.2", label: "y=mx", style: "dashed", labelPos: [2.5, 3.3] },
      ],
      points: [
        { x: -1, y: 3, label: "α", dropToX: true, xTick: "α" },
        { x: 1, y: 1, label: "k", dropToX: true, xTick: "k" },
        { x: 2, y: 3, label: "β", dropToX: true, xTick: "β" },
      ],
    };
  }
  return undefined;
}

function parseAnswerTableFromRawExpText(rawExpText) {
  const answers = {};
  const firstExpIdx = rawExpText.indexOf("1. [출제의도]");
  const headerSlice = firstExpIdx > 0 ? rawExpText.slice(0, firstExpIdx) : rawExpText.slice(0, 2000);
  const exp23Idx = rawExpText.indexOf("23. [출제의도]");
  const selectiveSlice = exp23Idx > 0 ? rawExpText.slice(Math.max(0, exp23Idx - 800), exp23Idx) : "";

  for (const slice of [headerSlice, selectiveSlice]) {
    // Match sequential answer table entries 1..30
    const tokens = slice.trim().split(/\s+/);
    for (let i = 0; i < tokens.length - 1; i++) {
      const k = tokens[i];
      const v = tokens[i + 1];
      if (/^([1-9]|[12]\d|30)$/.test(k) && /^([①②③④⑤]|\d{1,4})$/.test(v)) {
        const num = Number(k);
        // In multiple choice (1..21 or 23..28 in grade 3), answer is ①..⑤; in short answer (16..22 or 22..30), answer is numeric
        const isCircle = /^[①②③④⑤]$/.test(v);
        if (isCircle || num >= 16) {
          answers[k] = v;
          i++; // advance past value
        }
      }
    }
  }
  return answers;
}

function cleanExplanationTail(solText) {
  let s = String(solText || "").trim();
  // Strip any trailing non-Korean graph label dump after the final "이다."
  const lastIda = s.lastIndexOf("이다.");
  if (lastIda !== -1) {
    const afterIda = s.slice(lastIda + 3).trim();
    if (afterIda && !/[가-힣]/.test(afterIda)) {
      s = s.slice(0, lastIda + 3).trim();
    }
  }
  return s;
}

function parseExplanationPdfText(fullExpText, rawExpText = "") {
  const answers = parseAnswerTableFromRawExpText(rawExpText || fullExpText);
  const intents = {};
  const solutions = {};

  // Normalize any "$72$1. [출제의도]" into "$72$ 1. [출제의도]"
  const normalized = fullExpText.replace(/([1-9]|[12]\d|30)\.\s*\[출제의도\]/g, "\n@@EXP_$1@@ [출제의도]");

  const expRegex = /@@EXP_([1-9]|[12]\d|30)@@\s*\[출제의도\]\s*([\s\S]+?)(?=@@EXP_(?:[1-9]|[12]\d|30)@@|$)/g;
  for (const m of normalized.matchAll(expRegex)) {
    const num = m[1];
    const body = m[2].trim();
    const intentEnd = body.search(/(?:한다\.|구한다\.|이해한다\.|계산한다\.|추론한다\.|해결한다\.|계산하기|구하기|이해하기|추론하기|활용하기)/);
    if (intentEnd !== -1) {
      const matchWord = body.slice(intentEnd).match(/^[가-힣.]+/)?.[0] || "";
      const cut = intentEnd + matchWord.length;
      intents[num] = body.slice(0, cut).replace(/\$/g, "").trim();
      solutions[num] = cleanExplanationTail(body.slice(cut).trim() || body);
    } else {
      intents[num] = body.slice(0, 45).replace(/\$/g, "").trim();
      solutions[num] = cleanExplanationTail(body);
    }
    if (!answers[num]) {
      const tailAns = body.slice(-160).match(/=\s*\$?\s*(\d{1,4})\s*\$?\s*$/);
      if (tailAns) answers[num] = tailAns[1];
    }
  }

  return { answers, intents, solutions };
}

function parseProblemsFromLatexText(fullProbText, exam, expData, problemPdfUrl, explanationPdfUrl) {
  const results = [];
  const probRegex = /@@PROB_([1-9]|[12]\d|30)@@\s*([\s\S]+?)(?=@@PROB_(?:[1-9]|[12]\d|30)@@|$)/g;

  for (const m of fullProbText.matchAll(probRegex)) {
    const num = m[1];
    let rawChunk = m[2].trim();
    rawChunk = rawChunk
      .replace(/\s*(?:5\s*지\s*선\s*다\s*형|단\s*답\s*형|\*\s*확인\s*사항|※\s*확인\s*사항|◦\s*답안지|\d{4}\s*학년도|[━─_]{3,})[\s\S]*$/, "")
      .trim();

    const ptMatch = rawChunk.match(/\[([234]점)\]/);
    const points = ptMatch ? ptMatch[1] : [1, 2, 3, 23].includes(Number(num)) ? "2점" : Number(num) >= 14 ? "4점" : "3점";

    let questionPart = rawChunk;
    const choices = [];
    const firstChoiceIdx = rawChunk.indexOf("①");
    if (firstChoiceIdx !== -1 && Number(num) <= 28) {
      questionPart = rawChunk.slice(0, firstChoiceIdx).trim();
      const choiceSlice = rawChunk.slice(firstChoiceIdx);
      const cMatches = choiceSlice.matchAll(/[①②③④⑤]\s*([^①②③④⑤]+?)(?=[①②③④⑤]|$)/g);
      for (const cm of cMatches) {
        const cText = cm[1]
          .replace(/\s*(?:\d{4}\s*학년도|전국연합학력평가|문제지|제\s*2\s*교시|◦\s*답안지|[━─_]{2,})[\s\S]*$/, "")
          .replace(/(?:\s+[A-Z]){3,}\s*(\$?)\s*$/, "$1")
          .replace(/\b\d{1,2}\s+\d{1,2}\s*$/, "")
          .trim();
        if (cText) choices.push(cText);
      }
    }

    let boxContent = "";
    const gaIdx = questionPart.indexOf("(가)");
    const giyeokIdx = questionPart.indexOf("ㄱ.");
    if (gaIdx !== -1) {
      const afterGa = questionPart.slice(gaIdx);
      const resumeMatch = afterGa.match(/\s+(?=[^\s]+(?:일\s*때|에\s*대하여|라\s*할\s*때|의\s*값은|의\s*값을\s*구하시오|옳은\s*것만을))/);
      if (resumeMatch && resumeMatch.index) {
        boxContent = afterGa.slice(0, resumeMatch.index).trim();
        questionPart = `${questionPart.slice(0, gaIdx).trim()} ${afterGa.slice(resumeMatch.index).trim()}`;
      }
    } else if (giyeokIdx !== -1) {
      const afterG = questionPart.slice(giyeokIdx);
      const resumeMatch = afterG.match(/\s+(?=[^\s]+(?:의\s*값은|옳은\s*것만을|인\s*것은))/);
      if (resumeMatch && resumeMatch.index) {
        boxContent = afterG.slice(0, resumeMatch.index).trim();
        questionPart = `${questionPart.slice(0, giyeokIdx).trim()} ${afterG.slice(resumeMatch.index).trim()}`;
      }
    }

    const difficulty = classifyDifficulty(num, points);
    const unit = inferMathUnit(`${questionPart} ${expData.intents[num] || ""}`, exam.grade);
    const answer = expData.answers[num] || "";
    const intent = expData.intents[num] || `${unit} 개념 및 추론`;
    const solution = expData.solutions[num]
      ? `[출제의도] ${intent}\n\n${expData.solutions[num]}`
      : `[출제의도] ${intent}`;
    const geoSpec = attachAutoGeoSpecIfApplicable(unit, difficulty, num, questionPart);

    const tokenId = `${exam.id}-q${num}`;
    results.push({
      id: tokenId,
      tokenId,
      examId: exam.id,
      grade: exam.grade,
      year: exam.year,
      month: exam.month,
      examTitle: exam.title,
      subject: exam.subject || `고${exam.grade} 수학`,
      unit,
      intent,
      difficulty,
      number: String(num),
      points,
      sourceLabel: `${exam.year}년 ${exam.month}월 고${exam.grade} ${exam.title} ${num}번`,
      title: `${exam.year}년 ${exam.month}월 고${exam.grade} ${exam.title} ${num}번 (${points})`,
      question: questionPart,
      boxLayout: boxContent ? "box" : "none",
      boxContent,
      choices: choices.slice(0, 5),
      tables: [],
      figureUrl: "",
      ...(geoSpec ? { geoSpec } : {}),
      answer,
      solution,
      problemPdfUrl: problemPdfUrl || "",
      explanationPdfUrl: explanationPdfUrl || "",
      createdAt: new Date().toISOString(),
    });
  }

  return results;
}

if (!existsSync(manifestPath)) {
  console.error(`❌ 모의고사 목록 파일이 없습니다: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const store = existsSync(outputPath) && !forceReextract
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
  if (!forceReextract && store.extractedExams?.[exam.id]) return false;
  const problemRes = exam.resources?.find(r => r.kind === "problem" && r.localPath);
  if (!problemRes) return false;
  const fullPdfPath = resolve(publicDir, problemRes.localPath.replace(/^\//, ""));
  return existsSync(fullPdfPath);
});

if (candidateExams.length === 0) {
  console.log("✅ 조건에 맞는 미추출 모의고사 PDF가 없습니다. (다시 추출하려면 --force 옵션을 추가하세요)");
  process.exit(0);
}

let targetExams = [];
if (!filterGrade && !filterExamId && limit < candidateExams.length) {
  const g1 = candidateExams.filter(e => e.grade === 1).slice(0, Math.max(1, Math.floor(limit / 3)));
  const g2 = candidateExams.filter(e => e.grade === 2).slice(0, Math.max(1, Math.floor(limit / 3)));
  const g3 = candidateExams.filter(e => e.grade === 3).slice(0, Math.max(2, limit - g1.length - g2.length));
  targetExams = [...g1, ...g2, ...g3].slice(0, limit);
} else {
  targetExams = candidateExams.slice(0, limit);
}

console.log(
  `🚀 총 ${candidateExams.length}개 대상 시험지 중 ${targetExams.length}개 시험지의 [문제 + 정답 + 해설 1:1 토큰화]를 시작합니다.`
);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function extractPdfLatexString(pdfDiskPath, kind = "problem") {
  if (!existsSync(pdfDiskPath)) return { latex: "", raw: "" };
  const data = new Uint8Array(readFileSync(pdfDiskPath));
  const doc = await pdfjs.getDocument({
    data,
    standardFontDataUrl: "public/typing/standard_fonts/",
    cMapUrl: "public/typing/cmaps/",
    cMapPacked: true,
  }).promise;

  let fullText = "";
  let rawText = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    fullText += " " + convertPdfItemsToLatexText(tc.items, kind);
    rawText += " " + tc.items.map(it => decodeHwpString(it.str || "")).join(" ");
  }
  await doc.cleanup();
  return { latex: fullText.trim(), raw: rawText.trim() };
}

for (let idx = 0; idx < targetExams.length; idx++) {
  const exam = targetExams[idx];
  const problemRes = exam.resources.find(r => r.kind === "problem" && r.localPath);
  const explanationRes = exam.resources.find(r => r.kind === "explanation" && r.localPath);

  console.log(
    `\n[${idx + 1}/${targetExams.length}] 📄 ${exam.year}년 ${exam.month}월 고${exam.grade} (${exam.title}) [ID: ${exam.id}]`
  );

  if (dryRun) {
    console.log(`  └─ 🧪 [Dry-Run] 문제지(${problemRes?.localPath}) 및 해설지(${explanationRes?.localPath}) 확인 완료`);
    continue;
  }

  const probDiskPath = resolve(publicDir, problemRes.localPath.replace(/^\//, ""));
  const expDiskPath = explanationRes?.localPath
    ? resolve(publicDir, explanationRes.localPath.replace(/^\//, ""))
    : "";

  process.stdout.write(`  ├─ 1) 해설지 PDF 정답표·[출제의도]·단계별 풀이 추출 중... `);
  const expExtracted = expDiskPath ? await extractPdfLatexString(expDiskPath, "explanation") : { latex: "", raw: "" };
  const expData = parseExplanationPdfText(expExtracted.latex, expExtracted.raw);
  console.log(
    `정답 ${Object.keys(expData.answers).length}개 / 해설 ${Object.keys(expData.solutions).length}개 파싱 완료`
  );

  process.stdout.write(`  ├─ 2) 문제지 PDF 문항별 수식(LaTeX) 추출 및 해설 1:1 매칭 중... `);
  const probExtracted = await extractPdfLatexString(probDiskPath, "problem");
  const matchedTokens = parseProblemsFromLatexText(
    probExtracted.latex,
    exam,
    expData,
    problemRes.localPath,
    explanationRes?.localPath || ""
  );
  console.log(`${matchedTokens.length}개 문항·해설 1:1 토큰 생성 완료`);

  const byNumber = new Map();
  for (const item of matchedTokens) {
    if (!byNumber.has(item.number) || item.question.length > byNumber.get(item.number).question.length) {
      byNumber.set(item.number, item);
    }
  }
  const finalExamProblems = [...byNumber.values()].sort((a, b) => Number(a.number) - Number(b.number));

  store.problems = [...store.problems.filter(p => p.examId !== exam.id), ...finalExamProblems];
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
    `  └─ ✅ 저장 완료: ${finalExamProblems.length}문항 (누적 총 ${store.problems.length}토큰 → src/data/mock-exam-problems.json)`
  );
}
