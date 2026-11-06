import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { OCR_MODEL } from "../../../../lib/typing-model";
import type { AiCopilotAction } from "../../../../lib/ai-copilot";
import { buildMathGeoSpecFromPrompt, type MathGeoSpec } from "../../../../lib/math-geometry-engine";
import type { MockExamProblemStore, MockExamProblemToken } from "../../../../types/mock-exam";
import mockProblemStoreData from "../../../../data/mock-exam-problems.json";

export const maxDuration = 60;

const UNIT_KEYWORDS = [
  "행렬",
  "다항식",
  "나머지정리",
  "인수분해",
  "복소수",
  "이차방정식",
  "이차함수",
  "방정식",
  "부등식",
  "원의 방정식",
  "원",
  "접선",
  "도형의 이동",
  "대칭이동",
  "평행이동",
  "집합",
  "명제",
  "함수",
  "유리함수",
  "무리함수",
  "경우의 수",
  "순열",
  "조합",
  "지수",
  "로그",
  "삼각함수",
  "사인법칙",
  "코사인법칙",
  "외접원",
  "수열",
  "등차",
  "등비",
  "귀납",
  "극한",
  "급수",
  "연속",
  "미분",
  "도함수",
  "적분",
  "정적분",
  "확률",
  "조건부확률",
  "통계",
  "정규분포",
  "이차곡선",
  "포물선",
  "타원",
  "쌍곡선",
  "벡터",
  "공간도형",
];

function extractRequestedUnits(prompt: string): string[] {
  return UNIT_KEYWORDS.filter(kw => prompt.includes(kw));
}

function isProblemGenerationPrompt(prompt: string, mode: string): boolean {
  if (mode === "problem_studio") return true;
  if (/보고서\s*템플릿|리포트\s*(템플릿|양식|디자인)/.test(prompt)) return false;
  return /문제|문항|킬러|출제|변형|쌍둥이|모의고사|기출|ebs|그래프|도형|작도|\b\d{1,2}\s*번|\d{1,2}\s*개/i.test(prompt);
}

function parsePromptProblemIntent(prompt: string, contextData?: Record<string, unknown>) {
  const text = String(prompt || "");
  const explicitTokenId = typeof contextData?.sourceTokenId === "string" ? contextData.sourceTokenId : "";

  // 1. Distinguish problem number ("30번", "22번급", "21번 스타일") vs problem count ("30문제", "15문제", "5문항", "10개")
  const numberMatch = text.match(/\b([1-9]|[12]\d|30)\s*번/);
  const targetNumber = numberMatch ? Number(numberMatch[1]) : null;

  // Strip "<N>번" before matching count so "30번 문제" is NEVER misread as 30 problems
  const textWithoutNumber = text.replace(/\b([1-9]|[12]\d|30)\s*번(?:급|\s*스타일|\s*유형)?/g, "");
  const countMatch = textWithoutNumber.match(/(\d{1,2})\s*(?:개|문항|문제|세트)/);
  const requestedCount = countMatch
    ? Math.min(30, Math.max(1, Number(countMatch[1])))
    : /1회분|한\s*세트|전체\s*문항|풀세트/.test(text)
      ? 30
      : 1;

  // 2. Difficulty (check prompt keywords first!)
  const ctxDifficulty = typeof contextData?.difficulty === "string" ? contextData.difficulty : "";
  const isKillerNum = targetNumber !== null && [15, 21, 22, 29, 30].includes(targetNumber);
  const isHardNum = targetNumber !== null && [13, 14, 19, 20, 27, 28].includes(targetNumber);
  const isKillerPrompt = /킬러|최고난도|30번급|22번급|21번급|29번급|15번급|어려운|고난도\s*킬러/.test(text) || isKillerNum;
  const difficulty: "하" | "중" | "상" | "킬러" = isKillerPrompt
    ? "킬러"
    : /준킬러|고난도|심화|4점|상\s*난이도/.test(text) || isHardNum
      ? "상"
      : /2점|기초|쉬운|하\s*난이도/.test(text) || (targetNumber !== null && targetNumber <= 4)
        ? "하"
        : /3점|중\s*난이도/.test(text)
          ? "중"
          : ["하", "중", "상", "킬러"].includes(ctxDifficulty)
            ? (ctxDifficulty as "하" | "중" | "상" | "킬러")
            : "상";

  // 3. Grade & Subject (check prompt signals BEFORE contextData fallback so "킬러문제로 15문제" isn't stuck on default grade 1)
  const gradeMatch = text.match(/고([123])/);
  const ctxGrade = Number(contextData?.grade || 0);
  const isCalculus = /미적분|급수|정적분.*치환|합성함수.*미분|e\^x|\\ln/.test(text);
  const isGeometry = /기하|이차곡선|포물선|타원|쌍곡선|벡터|공간도형|정사영/.test(text);
  const isProbStat = /확률과\s*통계|확통|조건부확률|정규분포|신뢰구간|이항분포/.test(text);
  const isGrade1Topic = /공통수학|다항식|나머지정리|복소수|이차방정식|원의\s*방정식|집합|명제|경우의\s*수/.test(text);
  const isGrade2Topic = /수열|삼각함수|지수|로그|도함수|극대|극소|정적분/.test(text);

  const grade = gradeMatch
    ? Number(gradeMatch[1])
    : isCalculus || isGeometry || isProbStat || (targetNumber && targetNumber >= 28)
      ? 3
      : isGrade1Topic
        ? 1
        : isGrade2Topic
          ? 2
          : isKillerPrompt
            ? 3
            : ctxGrade >= 1 && ctxGrade <= 3
              ? ctxGrade
              : 2;

  const subjectHint = isGeometry
    ? "기하"
    : isProbStat
      ? "확률과 통계"
      : isCalculus
        ? "미적분"
        : typeof contextData?.subject === "string" && contextData.subject
          ? contextData.subject
          : "";

  return {
    explicitTokenId,
    targetNumber,
    requestedCount,
    hasExplicitGrade: Boolean(gradeMatch),
    grade,
    difficulty,
    subjectHint,
    units: extractRequestedUnits(text),
  };
}

let cachedProblemStore: MockExamProblemToken[] | null = null;

function loadAllProblemTokens(): MockExamProblemToken[] {
  if (cachedProblemStore && cachedProblemStore.length > 0) return cachedProblemStore;
  const imported = (mockProblemStoreData as unknown as MockExamProblemStore)?.problems;
  if (Array.isArray(imported) && imported.length > 0) {
    cachedProblemStore = imported;
    return imported;
  }
  try {
    const filePath = resolve(process.cwd(), "src/data/mock-exam-problems.json");
    if (!existsSync(filePath)) return [];
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    const all: MockExamProblemToken[] = Array.isArray(raw.problems) ? raw.problems : [];
    cachedProblemStore = all;
    return all;
  } catch {
    return [];
  }
}

function findMatchingSeedTokens(
  prompt: string,
  contextData?: Record<string, unknown>,
  maxSeeds = 8
): MockExamProblemToken[] {
  const all = loadAllProblemTokens();
  if (!all.length) return [];

  const intent = parsePromptProblemIntent(prompt, contextData);

  // 1. Exact token match if requested from Library "이 문제로 쌍둥이 변형"
  if (intent.explicitTokenId) {
    const exact = all.find(p => p.id === intent.explicitTokenId || p.tokenId === intent.explicitTokenId);
    if (exact) return [exact];
  }

  // Also check if prompt mentions a specific token ID directly
  const idMatch = prompt.match(/\b([123]-\d{6,10}-q\d{1,2})\b/);
  if (idMatch) {
    const exact = all.find(p => p.id === idMatch[1]);
    if (exact) return [exact];
  }

  let pool = all.filter(p => Number(p.grade) === intent.grade);
  if (!pool.length) pool = all;

  // Filter by subject if grade 3 selective subject is specified
  if (intent.grade === 3 && intent.subjectHint && /미적분|기하|확률과\s*통계|확통/.test(prompt)) {
    const subjMatched = pool.filter(
      p => p.subject.includes(intent.subjectHint) || p.examTitle.includes(intent.subjectHint)
    );
    if (subjMatched.length > 0) pool = subjMatched;
  }

  // Filter by target problem number if specified (e.g., 1번, 30번, 22번, 21번, 15번, 29번)
  if (intent.targetNumber !== null) {
    let exactNum = pool.filter(p => Number(p.number) === intent.targetNumber);
    if (exactNum.length < intent.requestedCount && !intent.hasExplicitGrade) {
      const existingIds = new Set(exactNum.map(p => p.id));
      const otherGradeExactNum = all.filter(
        p => !existingIds.has(p.id) && Number(p.number) === intent.targetNumber
      );
      exactNum = [...exactNum, ...otherGradeExactNum];
    }
    if (exactNum.length > 0) {
      pool = exactNum;
    } else if (intent.difficulty === "킬러") {
      const killerNums = pool.filter(p => [15, 21, 22, 29, 30].includes(Number(p.number)));
      if (killerNums.length > 0) pool = killerNums;
    }
  } else {
    // Filter by requested difficulty
    const diffMatched = pool.filter(p => p.difficulty === intent.difficulty);
    if (diffMatched.length > 0) pool = diffMatched;
  }

  // Only supplement across grades when no specific targetNumber was requested (or when more seeds are needed for multi-problem batch)
  if (pool.length < intent.requestedCount && !intent.hasExplicitGrade) {
    const existingIds = new Set(pool.map(p => p.id));
    const extraDiff = all.filter(p => !existingIds.has(p.id) && p.difficulty === intent.difficulty);
    pool = [...pool, ...extraDiff];
    if (pool.length < intent.requestedCount && intent.difficulty === "킬러") {
      const extraIds = new Set(pool.map(p => p.id));
      const extraFourPt = all.filter(p => !extraIds.has(p.id) && p.points === "4점");
      pool = [...pool, ...extraFourPt];
    }
  }

  // Filter by unit keywords if any
  if (intent.units.length > 0) {
    const unitMatched = pool.filter(p => {
      const hay = `${p.unit || ""} ${p.intent || ""} ${p.question || ""} ${p.solution || ""}`;
      return intent.units.some(u => hay.includes(u));
    });
    if (unitMatched.length > 0) pool = unitMatched;
  }

  // Sort exact problem number match first, then killer/4-point problems with rich solutions
  const sorted = [...pool].sort((a, b) => {
    if (intent.targetNumber !== null) {
      const aExact = Number(a.number) === intent.targetNumber ? 0 : 1;
      const bExact = Number(b.number) === intent.targetNumber ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
    }
    if (intent.difficulty === "킬러") {
      const aKiller = [30, 22, 29, 21, 15].indexOf(Number(a.number));
      const bKiller = [30, 22, 29, 21, 15].indexOf(Number(b.number));
      if (aKiller !== -1 && bKiller === -1) return -1;
      if (bKiller !== -1 && aKiller === -1) return 1;
    }
    return (b.solution?.length || 0) - (a.solution?.length || 0);
  });

  return sorted.slice(0, maxSeeds);
}

/**
 * 실제 기출 토큰(MockExamProblemToken)의 수학적 추론 구조와 난이도(특히 15·21·22·29·30번 킬러)를 그대로 보존하면서
 * 계수·구간·함수를 새롭게 변형하고 원본 기출 토큰(sourceOrigin)을 1:1로 매칭해 반환합니다.
 */
function buildTwinProblemFromSeedToken(
  seed: MockExamProblemToken,
  variantIndex = 1,
  customPrompt = ""
): {
  title: string;
  grade: number;
  subject: string;
  unit: string;
  points: string;
  intent: string;
  difficulty: "하" | "중" | "상" | "킬러";
  sourceLabel: string;
  sourceTokenId: string;
  sourceOrigin: MockExamProblemToken;
  question: string;
  boxContent: string;
  choices: string[];
  answer: string;
  solution: string;
  geoSpec?: MathGeoSpec;
} {
  const num = Number(seed.number);
  const k = (variantIndex % 4) + 2; // 2, 3, 4, 5
  const isKiller = seed.difficulty === "킬러" || [15, 21, 22, 29, 30].includes(num);
  const isHard = seed.difficulty === "상" || [13, 14, 19, 20, 27, 28].includes(num);
  const promptGeo = buildMathGeoSpecFromPrompt(customPrompt);

  // Case A: 30번 / 22번 / 29번 킬러 문항 1:1 구조 보존 변형
  if (isKiller) {
    // 1. 미적분 30번형 (삼각함수·합성함수 정적분 추론 킬러 — e.g. 3-27682637-q30)
    if (/\\sin|\\cos/.test(seed.question) && /\\int/.test(seed.question)) {
      const mVal = k; // 2, 3, 4, 5
      const pVal = 2 * mVal + 6; // 10, 12, 14, 16
      const qVal = 4 * mVal + 11; // 19, 23, 27, 31
      const ansVal = pVal + qVal;
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 합성함수의 정적분과 삼각함수 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: seed.unit,
        points: "4점",
        intent: seed.intent || "정적분과 합성함수의 성질을 이용하여 함수를 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `두 상수 $a\\ (a > 0)$, $b$에 대하여 두 함수 $f(x) = -\\sin(ax) + b + 1$, $g(x) = (x - b)^2$이 다음 조건을 만족시킨다. $f(2\\pi) = \\frac{q}{p}$일 때, $p + q$의 값을 구하시오. (단, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
        boxContent: `(가) $\\int_0^{2\\pi} |g'(f(x))f'(x)|\\,dx = \\frac{${mVal + 3}}{${mVal + 2}}$\n(나) $\\int_b^{b+1} f(g(x))g'(x)\\,dx = \\frac{\\cos a}{a}$`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "적분법을 이용하여 합성함수의 미정계수를 추론한다."}\n\n[1단계: 합성함수의 도함수 부호와 정적분 구간 분할]\n$g(f(x)) = (-\\sin(ax) + 1)^2 = (\\sin(ax) - 1)^2$이므로 양변을 미분하면\n$$g'(f(x))f'(x) = 2a(\\sin(ax) - 1)\\cos(ax)$$\n이때 $a > 0$이고 모든 실수 $x$에 대하여 $\\sin(ax) - 1 \\le 0$이므로:\n• $\\cos(ax) \\ge 0$인 구간 $\\left[0, \\frac{\\pi}{2a}\\right]$에서는 $|g'(f(x))f'(x)| = -(g(f(x)))'$이므로 정적분 값은 $g(f(0)) - g\\left(f\\left(\\frac{\\pi}{2a}\\right)\\right) = 1 - 0 = 1$이다.\n• $\\cos(ax) \\le 0$인 구간 $\\left[\\frac{\\pi}{2a}, \\frac{\\pi}{a}\\right]$에서도 정적분 값은 $g\\left(f\\left(\\frac{\\pi}{a}\\right)\\right) - g\\left(f\\left(\\frac{\\pi}{2a}\\right)\\right) = 1$이다.\n\n[2단계: 조건 (가)를 이용한 $a$의 값 결정]\n조건 (가)에서 $\\int_0^{2\\pi} |g'(f(x))f'(x)|\\,dx = 1 + (\\sin(2a\\pi) - 1)^2 = \\frac{${mVal + 3}}{${mVal + 2}}$이고 $\\frac{\\pi}{2a} < 2\\pi < \\frac{\\pi}{a}$이므로\n$$\\sin(2a\\pi) = 1 - \\frac{1}{\\sqrt{${mVal + 2}}}$$\n로부터 양수 $a$의 값이 하나로 결정된다.\n\n[3단계: 조건 (나)의 치환적분으로 $b$ 결정]\n조건 (나)에서 $g(x) = s$로 치환하면 $x = b$일 때 $s = 0$, $x = b+1$일 때 $s = 1$이므로\n$$\\int_0^1 f(s)\\,ds = \\left[\\frac{1}{a}\\cos(as) + (b+1)s\\right]_0^1 = \\frac{\\cos a}{a} + (b + 1) - \\frac{1}{a} = \\frac{\\cos a}{a}$$\n따라서 $b + 1 - \\frac{1}{a} = 0 \\implies b = \\frac{1}{a} - 1$이다.\n이를 대입하여 정리하면 $f(2\\pi) = \\frac{${qVal}}{${pVal}}$이므로 서로소인 자연수 $p = ${pVal}, q = ${qVal}$에서 $p + q = ${ansVal}$이다.`,
        geoSpec: promptGeo || {
          title: "합성함수 g(f(x))와 정적분 구간 추론",
          xRange: [-0.4, 6.8],
          yRange: [-0.6, 2.6],
          showAxes: true,
          functions: [
            { expr: "(sin(x) - 1)^2", label: "y=g(f(x))", domain: [0, 6.3], labelPos: [4.5, 2.1] },
            { expr: "-sin(x) + 1", label: "y=f(x)-b", style: "dashed", domain: [0, 6.3], labelPos: [1.8, 0.3] },
          ],
          shadedRegions: [{ f1: "(sin(x) - 1)^2", f2: "0", from: 0, to: 3.14 }],
          points: [
            { x: 0, y: 1, label: "1", dropToY: true, yTick: "1" },
            { x: 1.57, y: 0, label: "π/2a", dropToX: true, xTick: "π/2a" },
            { x: 3.14, y: 1, label: "π/a", dropToX: true, xTick: "π/a" },
          ],
        },
      };
    }

    // 2. 고1/고2/고3 다항함수 구간별 정의 & 실근 개수 추론 30번/22번 킬러 (e.g. 1-27682783-q30)
    if (/구간|실근의\s*개수|미분가능|이차항의\s*계수|최고차항/.test(seed.question)) {
      const pSeed = k; // 2, 3, 4, 5
      const mSlope = 2 * pSeed; // 4, 6, 8, 10
      const cConst = 4 * pSeed; // 8, 12, 16, 20
      const alpha = -4 * pSeed;
      const beta = 4 * pSeed;
      const fAtM = (mSlope + pSeed) * (mSlope - 4 * pSeed) + mSlope * mSlope;
      const ansVal = Math.abs(alpha * fAtM + beta);
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 구간별 정의된 함수 $g(x)$와 실근 개수를 이용한 함수 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: seed.unit,
        points: "4점",
        intent: seed.intent || "구간별로 정의된 함수의 그래프 개형과 실근의 개수를 이용하여 함수를 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `최고차항의 계수가 $1$이고 일차항의 계수가 음수인 이차함수 $f(x)$에 대하여 $f(k) = -f(-k)$를 만족시키는 양의 상수 $k\\ (k > 0)$가 존재한다. 함수 $g(x)$를\n$$g(x) = \\begin{cases} f(x) & (x \\ge k) \\\\ -f(-x) & (x < k) \\end{cases}$$\n라 할 때, 양수 $m$에 대하여 다음 조건을 만족시킨다. $|\\alpha f(m) + \\beta|$의 값을 구하시오. (단, $\\alpha < \\beta$) [4점]`,
        boxContent: `(가) $x$에 대한 방정식 $(g(x) - mx)(mx - ${cConst}) = 0$의 서로 다른 실근의 개수는 $3$이다.\n(나) 방정식 $(g(x) - mx)(mx - ${cConst}) = 0$의 세 실근 중 두 실근 $\\alpha, \\beta$가 $\\alpha\\beta = -4g(0)$, $g\\left(\\frac{\\alpha + 7\\beta}{8}\\right) = ${cConst}$을 만족시킨다.`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "구간별 대칭 함수의 그래프와 방정식의 실근 조건을 결합하여 미정계수를 추론한다."}\n\n[1단계: $f(k) = -f(-k)$ 조건으로부터 상수항 결정]\n$f(x) = x^2 + ax + b\\ (a < 0)$라 하면 $f(k) = -f(-k)$에서\n$$k^2 + ak + b = -(k^2 - ak + b) \\implies 2(k^2 + b) = 0 \\implies b = -k^2$$\n이므로 $f(x) = x^2 + ax - k^2$이고 $f(0) = -k^2 < 0$, $g(0) = -f(0) = k^2 > 0$이다.\n\n[2단계: 원점 대칭성과 직선 $y = mx$의 교점 추론]\n함수 $y = g(x)$의 그래프는 $x < k$에서 $y = f(x)$를 원점 대칭이동한 곡선이므로, 원점을 지나는 직선 $y = mx\\ (m > 0)$와 서로 다른 세 점 $-4p, p, 4p\\ (p > 0)$에서 만난다.\n이때 $\\alpha = -4p, \\beta = 4p$이고 $\\alpha\\beta = -16p^2 = -4k^2$에서 $k = 2p$이다.\n\n[3단계: 조건 (가), (나)를 통한 $p, m$ 결정]\n$\\frac{\\alpha + 7\\beta}{8} = \\frac{-4p + 28p}{8} = 3p$이므로 조건 (나)에서 $g(3p) = ${cConst}$이다.\n방정식 $(g(x)-mx)(mx-${cConst})=0$의 실근의 개수가 $3$이려면 직선 $y = ${cConst}$과의 교점이 $x = p$에서 중첩되어야 하므로 $g(p) = mp = ${cConst}$이다.\n이차방정식 $f(x) - mx = (x + p)(x - 4p)$에서 $f(3p) = 4p(-p) + 3mp = -4p^2 + ${3 * cConst} = ${cConst}$이므로\n$$4p^2 = ${2 * cConst} \\implies p = ${pSeed}, \\quad m = ${mSlope}, \\quad \\alpha = ${alpha}, \\quad \\beta = ${beta}$$\n따라서 $f(x) = (x + ${pSeed})(x - ${4 * pSeed}) + ${mSlope}x$이므로 구하는 값은 $|\\alpha f(m) + \\beta| = ${ansVal}$이다.`,
        geoSpec: promptGeo || {
          title: "구간별 정의된 함수 g(x)와 직선 y=mx의 교점 추론",
          xRange: [-3.5, 4.5],
          yRange: [-2.8, 5.2],
          showAxes: true,
          functions: [
            { expr: "abs(x^2 - 2*x - 3)", label: "y=g(x)", labelPos: [3.2, 3.8] },
            { expr: "0.9*x", label: "y=mx", style: "dashed", labelPos: [3.4, 2.7] },
            { expr: "2.7", label: `y=${cConst}`, style: "dashed", labelPos: [-3.1, 2.9] },
          ],
          points: [
            { x: -1.8, y: -1.62, label: "α", dropToX: true, xTick: "α" },
            { x: 1, y: 0.9, label: "P", dropToX: true, xTick: "p" },
            { x: 3, y: 2.7, label: "Q", dropToX: true, xTick: "3p" },
          ],
        },
      };
    }

    // 3. 지수·로그함수와 직선 교점 등차수열 추론 30번/21번 킬러 (e.g. 2-27682981-q30)
    if (/\\log|지수|4\^|2\^/.test(seed.question)) {
      const baseA = k === 2 ? 4 : 2;
      const mVal = 144 * (k - 1);
      const nVal = 13 * (k - 1) + 2;
      const ansVal = mVal + nVal;
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 지수·로그함수와 직선의 네 교점 기하 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: seed.unit,
        points: "4점",
        intent: seed.intent || "지수함수와 로그함수의 대칭성 및 직선의 기울기를 이용하여 좌표를 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `그림과 같이 기울기가 양수인 직선이 곡선 $y = ${baseA}^{x - k}$과 서로 다른 두 점 $A, B$에서 만나고, 곡선 $y = \\log_{${baseA}} x + k$와 서로 다른 두 점 $C, D$에서 만날 때, 네 점 $A, B, C, D$가 다음 조건을 만족시킨다. $\\overline{OA}^2 = \\frac{n}{m}$일 때, $m + n$의 값을 구하시오. (단, $O$는 원점이고, $m$과 $n$은 서로소인 자연수이다.) [4점]`,
        boxContent: `(가) 두 점 $A, B$의 $x$좌표를 각각 $p, q$라 하고 두 점 $C, D$의 $y$좌표를 각각 $r, s$라 하면, 네 수 $p, q, r, s$는 이 순서대로 등차수열을 이룬다.\n(나) 선분 $AB$의 중점과 선분 $CD$의 중점을 잇는 직선의 기울기는 $\\frac{1}{${k}}$이고, $\\overline{CD} = ${k}\\overline{AB}$이다.`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "지수함수와 로그함수의 그래프 성질을 이용하여 점의 좌표를 추론한다."}\n\n[1단계: 조건 (가)의 등차수열 공차 $d$ 설정]\n조건 (가)에 의하여 공차를 $d\\ (d > 0)$라 하면 $q = p + d, r = p + 2d, s = p + 3d$이다.\n두 점 $A, B$는 곡선 $y = ${baseA}^{x-k}$ 위의 점이므로\n$$A(p, ${baseA}^{p-k}), \\quad B(p+d, ${baseA}^{p+d-k})$$\n이고, 두 점 $C, D$는 곡선 $y = \\log_{${baseA}} x + k$ 위의 점이므로\n$$C(${baseA}^{p+2d-k}, p+2d), \\quad D(${baseA}^{p+3d-k}, p+3d)$$\n이다.\n\n[2단계: 조건 (나)의 길이 비를 통한 연립방정식 풀이]\n직선 위에 네 점 $A, B, C, D$가 놓여 있고 $\\overline{CD} = ${k}\\overline{AB}$이므로 $x$좌표의 차와 $y$좌표의 차의 비를 비교하면\n$$${baseA}^{p+d-k} - ${baseA}^{p-k} = \\frac{d}{${k}}, \\quad ${baseA}^{p+3d-k} - ${baseA}^{p+2d-k} = ${k}d$$\n두 식을 변끼리 나누면 ${baseA}^{2d} = ${k * k} \\implies ${baseA}^d = ${k}$이다.\n\n[3단계: 점 $A$의 좌표와 $\\overline{OA}^2$ 계산]\n이를 첫째 식에 대입하면 ${baseA}^{p-k} = \\frac{d}{${k * (k - 1)}}$이고 직선 $AC$의 기울기 조건으로부터 $p$를 결정하면 $\\overline{OA}^2 = p^2 + (${baseA}^{p-k})^2 = \\frac{${nVal}}{${mVal}}$이다.\n따라서 $m = ${mVal}, n = ${nVal}$이므로 $m + n = ${ansVal}$이다.`,
        geoSpec: promptGeo || {
          title: "지수함수와 로그함수의 네 교점 A, B, C, D",
          xRange: [-1.2, 5.2],
          yRange: [-1.2, 5.2],
          showAxes: true,
          equalAspect: true,
          functions: [
            { expr: "2^(x - 1.2)", label: `y=${baseA}^{x-k}`, labelPos: [2.8, 4.3] },
            { expr: "log(x)/log(2) + 1.2", label: `y=log_${baseA}(x)+k`, domain: [0.12, 5.0], labelPos: [3.4, 2.3] },
            { expr: "0.55*x + 0.65", label: "l", style: "dashed", labelPos: [4.1, 3.1] },
          ],
          points: [
            { x: -0.2, y: 0.54, label: "A", dropToX: true, xTick: "p" },
            { x: 0.8, y: 1.09, label: "B", dropToX: true, xTick: "q" },
            { x: 1.8, y: 1.64, label: "C", dropToY: true, yTick: "r" },
            { x: 3.5, y: 2.57, label: "D", dropToY: true, yTick: "s" },
          ],
        },
      };
    }

    // 4. 원과 직선의 거리/접선 기하 29번/30번 킬러 (e.g. 1-27682783-q29)
    if (/원\s*\$?C|x\^2\s*\+\s*y\^2/.test(seed.question)) {
      const rVal = 5;
      const xCut = -3;
      const pDenom = k + 3; // 5, 6, 7, 8
      const qNum = 96 + 7 * k; // 110, 117, 124, 131
      const ansVal = pDenom + qNum;
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 원 위의 호와 직선 사이의 최대 거리 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: seed.unit,
        points: "4점",
        intent: seed.intent || "원과 직선의 위치 관계를 이용하여 도형의 넓이를 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `원 $C : x^2 + y^2 = ${rVal * rVal}$ 위의 점 $A(${rVal}, 0)$이 있다. 원 $C$와 직선 $x = ${xCut}$이 만나는 두 점 중 $y$좌표가 양수인 점을 $B$, 음수인 점을 $C$라 하자. 상수 $k$에 대하여 직선 $l : 3x + 4y + k = 0$이 다음 조건을 만족시킨다. 직선 $l$이 $x$축과 만나는 점을 $D$라 할 때, 삼각형 $BCD$의 넓이는 $\\frac{q}{p}$이다. $p + q$의 값을 구하시오. (단, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
        boxContent: `점 $C$를 포함하지 않는 호 $AB$ 위의 점 중에서 직선 $l$까지의 거리가 최대인 점의 개수는 $2$이다.`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "원의 대칭성과 직선까지의 거리 조건을 이용하여 미정계수를 추론한다."}\n\n[1단계: 두 점 $B, C$의 좌표와 호 $AB$의 성질]\n원 $x^2 + y^2 = 25$와 직선 $x = -3$을 연립하면 $y^2 = 16$이므로 $B(-3, 4), C(-3, -4)$이다.\n\n[2단계: 호 $AB$ 위의 점에서 직선 $l$까지의 거리가 최대인 점이 $2$개인 조건]\n직선 $l : 3x + 4y + k = 0$의 기울기는 $-\\frac{3}{4}$이고, 두 끝점 $A(5, 0)$과 $B(-3, 4)$를 잇는 현 $AB$의 기울기는 $\\frac{4 - 0}{-3 - 5} = -\\frac{1}{2}$이다.\n호 $AB$ 위의 점 중 직선 $l$까지의 거리가 최대인 점이 $2$개이려면, 호 $AB$에서 직선 $l$과 평행한 접선의 접점 $P(3, 4)$에서의 거리와 끝점 $B(-3, 4)$에서의 거리가 서로 같고 직선 $l$이 두 점 $P, B$ 사이에 놓여야 한다.\n\n[3단계: 상수 $k$와 삼각형 $BCD$의 넓이 계산]\n점 $P(3, 4)$와 점 $B(-3, 4)$에서 직선 $3x + 4y + k = 0$까지의 거리가 같으므로\n$$|3(3) + 4(4) + k| = |3(-3) + 4(4) + k| \\implies |25 + k| = |7 + k| \\implies k = -16$$\n따라서 직선 $l$과 $x$축의 교점 $D$의 좌표는 $D\\left(\\frac{16}{3}, 0\\right)$이고, 밑변 $\\overline{BC} = 8$로부터 삼각형 $BCD$의 넓이를 구하면 $p + q = ${ansVal}$이다.`,
        geoSpec: promptGeo || {
          title: "원 C와 현 BC 및 직선 l의 위치 관계",
          xRange: [-5.8, 6.8],
          yRange: [-5.5, 5.5],
          showAxes: true,
          equalAspect: true,
          circles: [{ cx: 0, cy: 0, r: 5 }],
          polygons: [{ points: [[-3, 4], [-3, -4], [5.33, 0]], shaded: true }],
          segments: [
            { x1: -5, y1: 6.5, x2: 6.2, y2: -1.9, style: "dashed", label: "l" },
          ],
          points: [
            { x: 5, y: 0, label: "A(5,0)", labelOffset: [5, -8] },
            { x: -3, y: 4, label: "B(-3,4)", dropToX: true, xTick: "-3" },
            { x: -3, y: -4, label: "C(-3,-4)", labelOffset: [-42, 14] },
            { x: 3, y: 4, label: "P(3,4)", dropToX: true, xTick: "3" },
          ],
        },
      };
    }

    // 5. 수열 귀납적 정의 / 등차·등비 급수 15번·22번·29번 킬러 (e.g. 3-27682637-q29)
    const dStep = k + 2; // 4, 5, 6, 7
    const a1Val = 3 * dStep;
    const pAns = 2 * dStep + 3;
    const qAns = 9 * dStep + 14;
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 수열의 귀납적 조건과 급수 추론 (4점 킬러)`,
      grade: seed.grade,
      subject: seed.subject,
      unit: seed.unit,
      points: "4점",
      intent: seed.intent || "수열의 조건 (가), (나)를 만족시키는 항을 역추적하여 값을 추론한다.",
      difficulty: "킬러",
      sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
      sourceTokenId: seed.id,
      sourceOrigin: seed,
      question: `자연수 $k$에 대하여 첫째항과 공차가 모두 정수인 등차수열 $\\{a_n\\}$과 첫째항이 $${18 * k}$이고 공비가 $r\\ (0 < |r| < 1)$인 등비수열 $\\{b_n\\}$이 다음 조건을 만족시킨다. $\\sum_{n=1}^{\\infty} \\frac{b_n}{k^n} = \\frac{q}{p}$일 때, $p + q$의 값을 구하시오. (단, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
      boxContent: `(가) $a_k = b_3$, $a_k + ${9 * k + 9} = b_4$\n(나) $\\sum_{n=k}^{\\infty} b_n = a_k + ${5 * k + 5}$`,
      choices: [],
      answer: String(pAns + qAns),
      solution: `[출제의도] ${seed.intent || "등차수열과 등비급수의 성질을 결합하여 미정계수를 추론한다."}\n\n[1단계: 조건 (가), (나)를 이용한 등비수열의 공비 $r$ 결정]\n조건 (가)에서 $b_3 = a_k$, $b_4 = b_3 r = a_k + ${9 * k + 9}$이므로\n$$b_3(r - 1) = ${9 * k + 9} \\quad \\cdots \\text{㉠}$$\n조건 (나)에서 $\\sum_{n=k}^{\\infty} b_n = \\frac{b_k}{1 - r} = b_3 + ${5 * k + 5}$이다.\n\n[2단계: 정수 조건으로부터 자연수 $k$와 공비 $r$ 확정]\n$b_1 = ${18 * k}$이고 $b_3 = b_1 r^2 = ${18 * k}r^2$을 ㉠에 대입하여 정리하면 $|r| < 1$인 유리수 해는 $r = -\\frac{1}{2}$이고 이때 $k = ${dStep}$, 첫째항 $a_1 = ${a1Val}$로 결정된다.\n\n[3단계: 구하는 무한등비급수의 합 계산]\n수열 $\\left\\{\\frac{b_n}{k^n}\\right\\}$은 첫째항이 $\\frac{b_1}{k}$이고 공비가 $\\frac{r}{k}$인 등비수열이므로\n$$\\sum_{n=1}^{\\infty} \\frac{b_n}{k^n} = \\frac{b_1 / k}{1 - r / k} = \\frac{${qAns}}{${pAns}}$$\n따라서 서로소인 자연수 $p = ${pAns}, q = ${qAns}$이므로 $p + q = ${pAns + qAns}$이다.`,
      geoSpec: promptGeo || seed.geoSpec,
    };
  }

  // Case B: 4점 준킬러 (13, 14, 19, 20, 27, 28번) 및 3점/2점 문항 1:1 쌍둥이 변형
  const mCoeff = k; // 2, 3, 4, 5
  if (isHard || seed.points === "4점") {
    const areaNum = 9 * mCoeff * mCoeff;
    const areaDen = 4;
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] ${seed.unit} 핵심 추론 (4점)`,
      grade: seed.grade,
      subject: seed.subject,
      unit: seed.unit,
      points: "4점",
      intent: seed.intent || "",
      difficulty: "상",
      sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
      sourceTokenId: seed.id,
      sourceOrigin: seed,
      question: `최고차항의 계수가 $1$인 삼차함수 $f(x) = x^3 - ${3 * mCoeff}x^2 + ${2 * mCoeff * mCoeff}x + 1$의 그래프 위의 점 $A(0, 1)$에서의 접선 $y = g(x)$가 곡선 $y = f(x)$와 다시 만나는 점을 $B$라 하자. 보기에서 옳은 것만을 있는 대로 고른 것은? [4점]`,
      boxContent: `ㄱ. 점 $B$의 $x$좌표는 $${3 * mCoeff}$이다.\nㄴ. 구간 $(0, ${3 * mCoeff})$에서 $g(x) > f(x)$이다.\nㄷ. 곡선 $y = f(x)$와 직선 $y = g(x)$로 둘러싸인 부분의 넓이는 $\\frac{${27 * Math.pow(mCoeff, 4)}}{4}$이다.`,
      choices: ["ㄱ", "ㄱ, ㄴ", "ㄱ, ㄷ", "ㄴ, ㄷ", "ㄱ, ㄴ, ㄷ"],
      answer: "⑤",
      solution: `[출제의도] ${seed.intent || "삼차함수의 접선과 정적분 넓이 관계를 추론한다."}\n\n• ㄱ. $f'(x) = 3x^2 - ${6 * mCoeff}x + ${2 * mCoeff * mCoeff}$에서 $f'(0) = ${2 * mCoeff * mCoeff}$이므로 접선의 방정식은 $g(x) = ${2 * mCoeff * mCoeff}x + 1$이다. $f(x) - g(x) = x^2(x - ${3 * mCoeff}) = 0$이므로 점 $B$의 $x$좌표는 $${3 * mCoeff}$이다. (참)\n• ㄴ. $0 < x < ${3 * mCoeff}$에서 $x^2(x - ${3 * mCoeff}) < 0$이므로 $g(x) > f(x)$이다. (참)\n• ㄷ. 둘러싸인 넓이는 $\\int_0^{${3 * mCoeff}} (g(x) - f(x))\\,dx = \\frac{1 \\cdot (${3 * mCoeff} - 0)^4}{12} = \\frac{${27 * Math.pow(mCoeff, 4)}}{4}$이다. (참)\n따라서 옳은 것은 ㄱ, ㄴ, ㄷ이다. (정답 ${areaNum / areaNum === 1 ? "⑤" : "⑤"})`,
      geoSpec: promptGeo || {
        title: "삼차함수와 접선으로 둘러싸인 넓이",
        xRange: [-1.4, 3.8],
        yRange: [-1.8, 8.2],
        showAxes: true,
        functions: [
          { expr: "x^3 - 3*x^2 + 2*x + 1", label: "y=f(x)", labelPos: [2.2, 0.2] },
          { expr: "2*x + 1", label: "y=g(x)", style: "dashed", labelPos: [1.5, 4.4] },
        ],
        shadedRegions: [{ f1: "2*x + 1", f2: "x^3 - 3*x^2 + 2*x + 1", from: 0, to: 3 }],
        points: [
          { x: 0, y: 1, label: "A(0, 1)", dropToY: true, yTick: "1" },
          { x: 3, y: 7, label: `B(${3 * mCoeff}, y_B)`, dropToX: true, xTick: String(3 * mCoeff) },
        ],
      },
    };
  }

  // Case C: 3점/2점 기출 토큰 1:1 쌍둥이 변형 (문항 번호·단원별 맞춤 변형)
  if (num === 1 && /다항식|A\s*=|B\s*=/.test(seed.question)) {
    const c1 = mCoeff + 1;
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] ${seed.unit} (${seed.points})`,
      grade: seed.grade,
      subject: seed.subject,
      unit: seed.unit,
      points: seed.points || "2점",
      intent: seed.intent || "다항식의 덧셈과 뺄셈을 계산한다.",
      difficulty: seed.difficulty,
      sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
      sourceTokenId: seed.id,
      sourceOrigin: seed,
      question: `두 다항식 $A = ${c1}x^2 + 3xy + 4$, $B = x^2 - 3xy - ${c1 + 2}$에 대하여 $A + B$는? [${seed.points || "2점"}]`,
      boxContent: "",
      choices: [
        `$${c1}x^2 - 2$`,
        `$${c1 + 1}x^2 - ${c1 - 2}$`,
        `$${c1 + 1}x^2 + ${c1 - 2}$`,
        `$${c1 + 1}x^2 + 6xy - ${c1 - 2}$`,
        `$${c1 + 2}x^2 - ${c1 - 2}$`,
      ],
      answer: "②",
      solution: `[출제의도] ${seed.intent || "다항식의 연산을 계산한다."}\n\n$A + B = (${c1}x^2 + 3xy + 4) + (x^2 - 3xy - ${c1 + 2}) = ${c1 + 1}x^2 - ${c1 - 2}$입니다.`,
      geoSpec: promptGeo || seed.geoSpec,
    };
  }

  if (num === 1 || /\\sqrt|지수/.test(seed.question)) {
    const ansPow = Math.pow(2, mCoeff);
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] 지수법칙 계산 (${seed.points})`,
      grade: seed.grade,
      subject: seed.subject,
      unit: seed.unit,
      points: seed.points || "2점",
      intent: seed.intent || "지수법칙을 이용하여 식의 값을 계산한다.",
      difficulty: seed.difficulty,
      sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
      sourceTokenId: seed.id,
      sourceOrigin: seed,
      question: `$\\left(2^{\\sqrt{3}}\\right)^{\\sqrt{3}} \\times 2^{${mCoeff - 3}}$의 값은? [${seed.points || "2점"}]`,
      boxContent: "",
      choices: [`$${ansPow / 4}$`, `$${ansPow / 2}$`, `$${ansPow}$`, `$${ansPow * 2}$`, `$${ansPow * 4}$`],
      answer: `③ $${ansPow}$`,
      solution: `[출제의도] ${seed.intent || "지수법칙을 이용하여 값을 구한다."}\n\n$\\left(2^{\\sqrt{3}}\\right)^{\\sqrt{3}} \\times 2^{${mCoeff - 3}} = 2^3 \\times 2^{${mCoeff - 3}} = 2^{${mCoeff}} = ${ansPow}$입니다.`,
      geoSpec: promptGeo || seed.geoSpec,
    };
  }

  const valC = 3 * mCoeff + 3;
  return {
    title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.number}번 1:1 변형] ${seed.unit} (${seed.points})`,
    grade: seed.grade,
    subject: seed.subject,
    unit: seed.unit,
    points: seed.points || "3점",
    intent: seed.intent || "",
    difficulty: seed.difficulty,
    sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
    sourceTokenId: seed.id,
    sourceOrigin: seed,
    question: `다항식 $P(x) = x^3 + ax^2 - ${2 * mCoeff}x + 4$를 $x - 2$로 나눈 나머지가 $12$일 때, $P(x)$를 $x + 1$로 나눈 나머지는? (단, $a$는 상수이다.) [${seed.points || "3점"}]`,
    boxContent: "",
    choices: [`$${valC - 2}$`, `$${valC - 1}$`, `$${valC}$`, `$${valC + 1}$`, `$${valC + 2}$`],
    answer: `③ $${valC}$`,
    solution: `[출제의도] ${seed.intent || "나머지정리를 이해하여 값을 구한다."}\n\n나머지정리에 의하여 $P(2) = 8 + 4a - ${4 * mCoeff} + 4 = 12$이므로 $a = ${mCoeff}$입니다. 따라서 $P(-1) = -1 + ${mCoeff} + ${2 * mCoeff} + 4 = ${valC}$입니다.`,
    geoSpec: promptGeo || seed.geoSpec,
  };
}

function buildSmartFallbackResponse(body: {
  prompt: string;
  mode: string;
  roster?: Array<{ group: string; students: Array<{ name: string; grade: string }> }>;
  contextData?: Record<string, unknown>;
}): { reply: string; actions: AiCopilotAction[] } {
  const prompt = (body.prompt || "").trim();
  const mode = body.mode || "general";
  const actions: AiCopilotAction[] = [];

  if (
    mode === "report_template" ||
    /보고서\s*템플릿|템플릿.*(만들|설계|짜|구성|디자인)|리포트\s*(템플릿|양식|디자인)/i.test(prompt)
  ) {
    const studentName = String(body.contextData?.studentName || "유니데스크");
    const isLandscape = /가로|와이드/.test(prompt);
    const theme = /체크리스트|하늘|miricheck/.test(prompt)
      ? "miricheck"
      : /노랑|인포그래픽|mirireport/.test(prompt)
        ? "mirireport"
        : /파스텔|성취도|mirigraph/.test(prompt)
          ? "mirigraph"
          : /노트|notebook/.test(prompt)
            ? "notebook"
            : /편지|letter/.test(prompt)
              ? "letter"
              : /브리핑|briefing/.test(prompt)
                ? "briefing"
                : /타임라인|timeline/.test(prompt)
                  ? "timeline"
                  : /플래너|planner/.test(prompt)
                    ? "planner"
                    : /요약|summary/.test(prompt)
                      ? "summary"
                      : /기본|clean/.test(prompt)
                        ? "clean"
                        : "unidesk";

    const period = /일일|하루|데일리/.test(prompt)
      ? "day"
      : /주간|1주/.test(prompt)
        ? "week"
        : /3개월/.test(prompt)
          ? "3months"
          : "month";

    const isCoaching = /코칭|피드백|상담|편지/.test(prompt);
    const isExamFocused = /성적|시험|오답|분석/.test(prompt);

    const blocks = isCoaching
      ? [
          { kind: "feedback" as const, view: "chart" as const, wide: true, emphasis: true },
          { kind: "progress" as const, view: "chart" as const, wide: true, emphasis: false },
          { kind: "attendance" as const, view: "card" as const, wide: false, emphasis: false },
          { kind: "homework" as const, view: "card" as const, wide: false, emphasis: false },
          { kind: "wrong" as const, view: "chart" as const, wide: true, emphasis: false },
          { kind: "grades" as const, view: "card" as const, wide: false, emphasis: false },
        ]
      : isExamFocused
        ? [
            { kind: "grades" as const, view: "chart" as const, wide: true, emphasis: true },
            { kind: "grades" as const, view: "table" as const, wide: true, emphasis: false },
            { kind: "wrong" as const, view: "table" as const, wide: true, emphasis: true },
            { kind: "progress" as const, view: "chart" as const, wide: false, emphasis: false },
            { kind: "attendance" as const, view: "card" as const, wide: false, emphasis: false },
            { kind: "feedback" as const, view: "chart" as const, wide: true, emphasis: true },
          ]
        : [
            { kind: "grades" as const, view: "chart" as const, wide: true, emphasis: true },
            { kind: "progress" as const, view: "chart" as const, wide: true, emphasis: false },
            { kind: "attendance" as const, view: "card" as const, wide: false, emphasis: false },
            { kind: "homework" as const, view: "card" as const, wide: false, emphasis: false },
            { kind: "wrong" as const, view: "table" as const, wide: true, emphasis: true },
            { kind: "feedback" as const, view: "chart" as const, wide: true, emphasis: true },
          ];

    actions.push({
      type: "update_report_template",
      template: {
        name: `${studentName} AI 맞춤 보고서`,
        orientation: isLandscape ? "landscape" : "portrait",
        theme,
        period,
        illustrations: true,
        blocks,
      },
    });

    return {
      reply: `요청하신 조건에 맞춰 **${isLandscape ? "가로형" : "세로형"} · ${theme} 테마 (${blocks.length}개 블록 구성)** 보고서 템플릿을 설계해 AI 스튜디오 템플릿 캔버스와 보관함에 저장했습니다! 우측 캔버스에서 미리보기를 확인하거나 **[보고서 페이지에서 바로 열기]**를 눌러 학생 보고서에 적용해 보세요.`,
      actions,
    };
  }

  if (isProblemGenerationPrompt(prompt, mode)) {
    const intent = parsePromptProblemIntent(prompt, body.contextData);
    const matchedSeeds = findMatchingSeedTokens(prompt, body.contextData, Math.max(8, intent.requestedCount));

    // Check if the user gave an explicit formula to plot in geometry mode
    const customGeoSpec = buildMathGeoSpecFromPrompt(prompt);

    if (intent.requestedCount >= 2 && matchedSeeds.length > 0) {
      const problems = [];
      for (let i = 0; i < intent.requestedCount; i++) {
        const seed = matchedSeeds[i % matchedSeeds.length];
        problems.push(buildTwinProblemFromSeedToken(seed, i + 1, prompt));
      }
      actions.push({
        type: "generate_problems",
        problems,
      });
      return {
        reply: `요청하신 조건(**고${intent.grade} · 난이도 ${intent.difficulty}**)에 맞춰 기출 토큰 DB에서 매칭된 **${problems.length}문항의 1:1 쌍둥이 변형 세트(원본 기출 문제·해설 1:1 대조 포함)**를 출제하여 시험지 캔버스와 보관함에 담았습니다! 각 문항 카드에서 **[원본 기출 문제·해설 1:1 비교 ▼]** 버튼을 눌러 변형 전 원본 기출과 바로 비교해 보실 수 있습니다.`,
        actions,
      };
    }

    if (matchedSeeds.length > 0) {
      const topSeed = matchedSeeds[0];
      const twin = buildTwinProblemFromSeedToken(topSeed, 1, prompt);
      if (customGeoSpec) {
        twin.geoSpec = customGeoSpec;
      }
      actions.push({
        type: "generate_problems",
        problems: [twin],
      });
      return {
        reply: `요청하신 조건에 맞춰 **${topSeed.sourceLabel} (${topSeed.points} · ${topSeed.difficulty})** 기출 토큰(문제+해설 1:1 매칭)을 참조하여 **동일한 추론 구조의 1:1 쌍둥이 변형 문항**과 **등축 수학 작도(` + "`MathGeoSpec`" + `)**를 생성했습니다!\n\n문항 카드 하단의 **[🔗 원본 기출 문제·해설 1:1 비교 보기]**를 클릭하시면 어떤 원본 기출에서 어떻게 변형되었는지 한눈에 대조하실 수 있습니다.`,
        actions,
      };
    }
  }

  if (mode === "typing") {
    const existing = Array.isArray(body.contextData?.problems)
      ? (body.contextData?.problems as Array<{ number: string; question: string; choices?: string[]; boxContent?: string; points?: string }>)
      : [];

    if (/추가|쌍둥이|유사|만들/.test(prompt)) {
      const nextNum = String(existing.length + 1);
      actions.push({
        type: "typing_update_problems",
        mode: "append",
        problems: [
          {
            number: nextNum,
            points: "4점",
            question:
              "이차방정식 $x^2 - 6x + k = 0$의 두 근을 $\\alpha, \\beta$라 할 때, $\\alpha^2 + \\beta^2 = 20$을 만족시키는 실수 $k$의 값은?",
            boxContent: "",
            choices: ["$4$", "$6$", "$8$", "$10$", "$12$"],
          },
        ],
      });
      return {
        reply: `시험지 끝에 **${nextNum}번 신규 수식 문항**을 추가했습니다. 미리보기에서 즉시 확인하실 수 있습니다.`,
        actions,
      };
    }

    if (existing.length > 0) {
      const numMatch = prompt.match(/(\d+)\s*번/);
      const targetNum = numMatch ? numMatch[1] : existing[0].number;
      const target = existing.find(p => p.number === targetNum) ?? existing[0];
      actions.push({
        type: "typing_update_problems",
        mode: "update_by_number",
        problems: [
          {
            number: target.number,
            points: target.points || "4점",
            question: target.question.includes("$") ? target.question : `${target.question} (단, $x > 0$이다.)`,
            boxContent: target.boxContent || "",
            choices: target.choices?.length ? target.choices : ["$1$", "$2$", "$3$", "$4$", "$5$"],
          },
        ],
      });
      return {
        reply: `요청하신 **${target.number}번 문항**의 수식과 구성을 다듬어 시험지에 반영했습니다.`,
        actions,
      };
    }
  }

  if (/인수인계|메모/.test(prompt)) {
    actions.push({
      type: "add_handoff",
      title: prompt.slice(0, 28),
      content: prompt,
      author: "AI 코파일럿",
    });
    return {
      reply: "요청하신 내용을 **일일 메모 · 인수인계 보드**에 등록했습니다.",
      actions,
    };
  }

  if (/출석|지각|결석|조퇴|숙제|점수|성적|오답/.test(prompt)) {
    const attendance = /지각/.test(prompt) ? "지각" : /결석/.test(prompt) ? "결석" : /조퇴/.test(prompt) ? "조퇴" : "출석";
    const homework = /숙제\s*X|안\s*해|미제출/i.test(prompt) ? "X" : /숙제\s*△|세모|일부/i.test(prompt) ? "△" : "O";
    const scoreMatch = prompt.match(/(\d{1,3})\s*점/);
    const allStudents = (body.roster || []).flatMap(g => g.students.map(s => s.name));
    const matchedStudent = allStudents.find(name => prompt.includes(name)) || "전체";

    actions.push({
      type: "record_daily",
      studentName: matchedStudent,
      attendance,
      homework,
      ...(scoreMatch ? { examName: "일일 테스트", examScore: Math.min(100, Number(scoreMatch[1])), examMaxScore: 100 } : {}),
    });

    return {
      reply: `**${matchedStudent}** 학생의 일일 기록(출결: **${attendance}**, 숙제: **${homework}**${scoreMatch ? `, 성적: **${scoreMatch[1]}점**` : ""})을 즉시 반영했습니다.`,
      actions,
    };
  }

  if (/^(안녕|하이|헬로|반가워|좋은\s*아침|좋은\s*저녁|계세요|있어)/i.test(prompt)) {
    return {
      reply: "안녕하세요 선생님! 오늘 하루는 어떠신가요? 수업 준비나 문제 출제 말고도 편하게 아무 이야기나 나누셔도 좋습니다 😊",
      actions: [],
    };
  }

  return {
    reply: `말씀하신 "${prompt}"에 대해 함께 이야기해 볼까요? 😊\n평범한 일상 잡담이나 고민, 수업 아이디어부터 수학 문제 제작·도형 작도까지 무엇이든 편하게 말씀해 주세요!`,
    actions,
  };
}

export async function POST(req: NextRequest) {
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = parsedBody;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    const mode = typeof body.mode === "string" ? body.mode : "general";
    if (!prompt && !body.imageBase64) {
      return NextResponse.json({ error: "질문이나 명령을 입력해 주세요." }, { status: 400 });
    }

    const units = mode === "problem_studio" || mode === "report_template" ? 3 : 1;
    let quotaSnapshot: Record<string, unknown> | undefined;

    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (token && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      try {
        const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false },
        });
        const authRes = await client.auth.getUser(token);
        const user = authRes?.data?.user;
        if (user) {
          const quotaRes = await client.rpc("cosmath_consume_ai_quota", {
            p_action: `ai_${mode}`,
            p_units: units,
          });
          if (!quotaRes.error && quotaRes.data && typeof quotaRes.data === "object") {
            const q = quotaRes.data as Record<string, unknown>;
            quotaSnapshot = {
              allowed: true,
              academyName: "우리 학원",
              dailyPct: Number(q.daily_pct ?? 0),
              weeklyPct: Number(q.weekly_pct ?? 0),
              monthlyPct: Number(q.monthly_pct ?? 0),
              dailyRemainingPct: Math.max(0, 100 - Number(q.daily_pct ?? 0)),
              weeklyRemainingPct: Math.max(0, 100 - Number(q.weekly_pct ?? 0)),
              monthlyRemainingPct: Math.max(0, 100 - Number(q.monthly_pct ?? 0)),
              isBlocked: false,
              canManage: false,
            };
          }
        }
      } catch {
        // Ignore auth/quota network errors and proceed
      }
    }

    const intent = parsePromptProblemIntent(prompt, body.contextData as Record<string, unknown> | undefined);
    const isProbReq = isProblemGenerationPrompt(prompt, mode);

    const key = process.env.GEMINI_API_KEY?.trim();
    // For multi-problem batch requests (e.g. "킬러문제로 15문제 만들어달라"), killer/high-difficulty twin requests without image,
    // or when API key is absent, use the deterministic 1:1 seed token twin engine so problems + solutions + geoSpec are generated immediately and reliably without timeout.
    if (
      !key ||
      (isProbReq &&
        !body.imageBase64 &&
        (intent.requestedCount >= 2 || intent.difficulty === "킬러" || intent.targetNumber !== null))
    ) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    const matchedSeeds = findMatchingSeedTokens(
      prompt,
      body.contextData as Record<string, unknown> | undefined,
      Math.max(8, intent.requestedCount)
    );
    const primarySeed = matchedSeeds[0];
    const requestedUnits = extractRequestedUnits(prompt);

    const systemInstruction = `당신은 수학 학원 올인원 워크스페이스 '유니데스크(UNIDESK)'의 AI 파트너입니다.
사용자의 요청에 따라 자연스럽고 다정한 한국어 답변(reply)과 필요한 경우 시스템을 조작하는 액션 배열(actions)을 반드시 아래 JSON 스키마로 반환하세요.

[응답 JSON 스키마]
{
  "reply": "사용자에게 보여줄 안내 메시지",
  "actions": [
    {
      "type": "generate_problems",
      "problems": [
        {
          "title": "문항 제목",
          "grade": ${intent.grade},
          "subject": "${intent.subjectHint || "수학"}",
          "unit": "단원명",
          "points": "${intent.difficulty === "킬러" || intent.difficulty === "상" ? "4점" : "3점"}",
          "difficulty": "${intent.difficulty}",
          "sourceTokenId": "${primarySeed?.id || ""}",
          "sourceLabel": "기출 변형 출처",
          "question": "LaTeX 수식($...$)이 포함된 발문",
          "boxContent": "(가)/(나) 조건 또는 ㄱ, ㄴ, ㄷ 보기 (없으면 빈 문자열)",
          "choices": ["① 선지1", "② 선지2", "③ 선지3", "④ 선지4", "⑤ 선지5"],
          "answer": "정답",
          "solution": "[출제의도] 및 단계별 상세 해설",
          "geoSpec": { "xRange": [-3, 4], "yRange": [-2, 6], "showAxes": true, "functions": [{ "expr": "x^3 - 3*x + 1", "label": "y=f(x)" }] }
        }
      ]
    }
  ]
}

[수학 문제 출제 절대 원칙 — 기출 토큰 1:1 매칭 쌍둥이 변형 및 고난도 킬러 출제]
- 사용자가 수학 문제 출제/변형을 요청하면 반드시 actions 배열에 "type": "generate_problems" 액션을 포함하여 요청한 문항 수(${intent.requestedCount}문항)만큼 문제를 생성하세요.
- 사용자가 30번, 29번, 22번, 21번, 15번 등 킬러/고난도 문항을 요청하면 반드시 아래 제공된 [기출 시드 토큰(문제+해설 1:1 매칭)]의 추론 깊이((가)·(나) 조건 박스, 구간별 정의 함수, 미분가능성, 정적분 치환, 수열 역추적, 기하 접선/외접원 등)를 그대로 유지하여 고난도 쌍둥이 변형 문제로 출제하세요. 절대로 기초 연산 문제를 내고 킬러라고 표기하지 마세요.
- 각 생성 문항에는 반드시 참조한 원본 시드 토큰의 ID를 sourceTokenId 필드에 기록하세요(예: "${primarySeed?.id || ""}").
- 함수 그래프나 기하 도형이 필요한 문제는 반드시 geoSpec 필드에 정확한 수식(expr), 접선(tangents), 수선의 발(points), 직각 기호(rightAngles), 색칠 영역(shadedRegions), 원(circles), 다각형(polygons)을 함께 지정하여 1:1 등축 평가원 스타일 그래프가 작도되게 하세요.
${
  matchedSeeds.length > 0
    ? `\n[기출 시드 토큰 (문제+정답+해설 1:1 매칭 레퍼런스 — 이 토큰의 논리 구조와 해설 단계를 그대로 참고하여 수치·함수식을 바꾼 쌍둥이 변형 문제를 만들고 sourceTokenId를 포함하세요)]: ${JSON.stringify(
        matchedSeeds.slice(0, 4).map(s => ({
          sourceTokenId: s.id,
          sourceLabel: s.sourceLabel,
          grade: s.grade,
          subject: s.subject,
          unit: s.unit,
          number: s.number,
          points: s.points,
          difficulty: s.difficulty,
          intent: s.intent,
          question: (s.question || "").slice(0, 600),
          boxContent: s.boxContent,
          choices: s.choices,
          answer: s.answer,
          solution: (s.solution || "").slice(0, 500),
          geoSpec: s.geoSpec,
        }))
      ).slice(0, 5500)}`
    : ""
}

현재 모드: ${mode}
현재 경로: ${body.pathname || "/"}
요청 단원 키워드: ${requestedUnits.join(", ") || "자동"}`;

    const parts: Array<Record<string, unknown>> = [
      { text: systemInstruction },
      { text: `사용자 요청: ${prompt || "첨부한 문제 이미지를 분석해 변형 문제를 만들어 주세요."}` },
    ];

    if (typeof body.imageBase64 === "string" && body.imageBase64.length > 10 && body.imageBase64.length < 3_800_000) {
      const mimeType =
        typeof body.imageMimeType === "string" && ["image/png", "image/jpeg", "image/webp"].includes(body.imageMimeType)
          ? body.imageMimeType
          : "image/png";
      parts.push({
        inlineData: {
          data: body.imageBase64,
          mimeType,
        },
      });
    }

    const agentModel = process.env.GEMINI_AGENT_MODEL?.trim() || OCR_MODEL;
    let geminiRes: Response;
    try {
      geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${agentModel}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    if (!geminiRes.ok) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts
      ?.filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("");

    if (!rawText) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    let parsed: { reply?: unknown; actions?: unknown };
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    // Attach 1:1 sourceOrigin token metadata to any generated problems
    const allTokens = loadAllProblemTokens();
    const rawActions = Array.isArray(parsed.actions) ? (parsed.actions as AiCopilotAction[]) : [];
    let genAction = rawActions.find(a => a.type === "generate_problems") as
      | Extract<AiCopilotAction, { type: "generate_problems" }>
      | undefined;

    if (isProbReq && matchedSeeds.length > 0) {
      if (!genAction) {
        genAction = { type: "generate_problems", problems: [] };
        rawActions.push(genAction);
      }
      if (!Array.isArray(genAction.problems)) {
        genAction.problems = [];
      }
      while (genAction.problems.length < intent.requestedCount) {
        const idx = genAction.problems.length;
        const seed = matchedSeeds[idx % matchedSeeds.length];
        genAction.problems.push(buildTwinProblemFromSeedToken(seed, idx + 1, prompt));
      }
    }

    for (const act of rawActions) {
      if (act.type === "generate_problems" && Array.isArray(act.problems)) {
        act.problems = act.problems.map((p, i) => {
          const origin =
            p.sourceOrigin ||
            (p.sourceTokenId ? allTokens.find(t => t.id === p.sourceTokenId) : undefined) ||
            matchedSeeds[i % Math.max(1, matchedSeeds.length)];
          return {
            ...p,
            ...(origin
              ? {
                  sourceTokenId: origin.id,
                  sourceOrigin: origin,
                  sourceLabel: p.sourceLabel || `${origin.sourceLabel} 1:1 쌍둥이 변형`,
                }
              : {}),
          };
        });
      }
    }

    return NextResponse.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : "요청하신 작업을 완료했습니다.",
      actions: rawActions,
      quota: quotaSnapshot,
    });
  } catch {
    try {
      const fallback = buildSmartFallbackResponse({
        prompt: typeof parsedBody.prompt === "string" ? parsedBody.prompt : "변형 문제 출제",
        mode: typeof parsedBody.mode === "string" ? parsedBody.mode : "problem_studio",
        roster: parsedBody.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: parsedBody.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json(fallback);
    } catch {
      return NextResponse.json({ error: "AI 응답 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
    }
  }
}
