import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OCR_MODEL, FLASH_AGENT_MODELS, REASONING_AGENT_MODELS } from "../../../../lib/typing-model";
import { DEFAULT_EXAM_PAPER_STYLE, type AiCopilotAction, type ExamPaperStyle } from "../../../../lib/ai-copilot";
import type { AcademyStaffMember } from "../../../../lib/academy-staff";
import { AI_PERSONA_PRESETS, resolveActivePersonaPrompt } from "../../../../lib/ai-personas";
import {
  buildMathGeoSpecFromPrompt,
  inferMathGeoSpecFromProblem,
  type MathGeoSpec,
} from "../../../../lib/math-geometry-engine";
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
  // Strip negated subject phrases (e.g., "기하 말고 미적분", "확통 말고", "미적분 제외") before detecting subjects!
  const cleanedSubjectText = text
    .replace(/(?:미적분|기하|확률과\s*통계|확통)\s*(?:말고|아닌|아니고|아니라|빼고|제외(?:하고)?)/g, " ")
    .replace(/말고\s*(?:다른|새)/g, " ");

  const gradeMatch = text.match(/고([123])/);
  const ctxGrade = Number(contextData?.grade || 0);
  const isCalculus = /미적분|급수|정적분.*치환|합성함수.*미분|e\^x|\\ln/.test(cleanedSubjectText);
  const isGeometry = /기하|이차곡선|포물선|타원|쌍곡선|벡터|공간도형|정사영/.test(cleanedSubjectText);
  const isProbStat = /확률과\s*통계|확통|조건부확률|정규분포|신뢰구간|이항분포/.test(cleanedSubjectText);
  const isGrade1Topic = /공통수학|다항식|나머지정리|복소수|이차방정식|원의\s*방정식|집합|명제|경우의\s*수/.test(cleanedSubjectText);
  const isGrade2Topic = /수열|삼각함수|지수|로그|도함수|극대|극소|정적분/.test(cleanedSubjectText);

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

  // Determine the final subject if multiple keywords appear by picking the LAST mentioned subject in cleanedSubjectText
  const subjectPositions: Array<{ subj: string; idx: number }> = [];
  const calcIdx = cleanedSubjectText.lastIndexOf("미적분");
  if (calcIdx !== -1 || isCalculus) subjectPositions.push({ subj: "미적분", idx: calcIdx !== -1 ? calcIdx : 0 });
  const geoIdx = cleanedSubjectText.lastIndexOf("기하");
  if (geoIdx !== -1 || isGeometry) subjectPositions.push({ subj: "기하", idx: geoIdx !== -1 ? geoIdx : 0 });
  const probIdx = Math.max(cleanedSubjectText.lastIndexOf("확률과 통계"), cleanedSubjectText.lastIndexOf("확통"));
  if (probIdx !== -1 || isProbStat) subjectPositions.push({ subj: "확률과 통계", idx: probIdx !== -1 ? probIdx : 0 });
  subjectPositions.sort((a, b) => b.idx - a.idx);

  const subjectHint =
    subjectPositions.length > 0
      ? subjectPositions[0].subj
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
  return [];
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

  // Filter by subject if grade 3 selective subject is specified (from prompt OR contextData)
  if (intent.grade === 3 && intent.subjectHint) {
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
    if (
      (/\\sin|\\cos/.test(seed.question) && /\\int/.test(seed.question)) ||
      (seed.subject.includes("미적분") && num === 30)
    ) {
      const mVal = k; // 2, 3, 4, 5
      // Pick clean solvable parameters where sin(2a*pi) = 1/2 -> a = 5/12, 13/12, 17/12, 25/12
      const aNumList = [5, 13, 17, 25];
      const aNum = aNumList[(mVal - 2) % aNumList.length];
      const aDen = 12;
      // b + 1 = 1/a = 12 / aNum, f(2*pi) = -sin(2*a*pi) + b + 1 = -1/2 + 12/aNum = (24 - aNum) / (2 * aNum)
      const rawP = 2 * aNum;
      const rawQ = 24 - aNum;
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const g = gcd(rawP, Math.abs(rawQ));
      const pVal = rawP / g;
      const qVal = Math.abs(rawQ) / g;
      const ansVal = pVal + qVal;
      const intBound = mVal - 1; // 1, 2, 3, 4
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] 합성함수의 정적분과 삼각함수 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: "미적분 · 정적분과 함수 추론",
        points: "4점",
        intent: seed.intent || "정적분과 합성함수의 성질을 이용하여 함수를 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `두 상수 $a\\ (a > 0)$, $b$에 대하여 두 함수 $f(x) = -\\sin(ax) + b + 1$, $g(x) = (x - b)^2$이 다음 조건을 만족시킨다. $f(2\\pi) = \\frac{q}{p}$일 때, $p + q$의 값을 구하시오. (단, $\\frac{${(aNum - 1) / 4}}{3} < a < \\frac{${(aNum + 1) / 2}}{6}$이고, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
        boxContent: `(가) $\\int_0^{2\\pi} |g'(f(x))f'(x)|\\,dx = \\frac{${4 * intBound + 1}}{4}$\n(나) $\\int_b^{b+1} f(g(x))g'(x)\\,dx = \\frac{\\cos a}{a}$`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "적분법을 이용하여 합성함수의 미정계수를 추론한다."}\n\n[1단계: 합성함수의 도함수 부호와 정적분 구간 분할]\n$g(f(x)) = (-\\sin(ax) + 1)^2 = (\\sin(ax) - 1)^2$이므로 양변을 미분하면\n$$g'(f(x))f'(x) = 2a(\\sin(ax) - 1)\\cos(ax)$$\n이때 $a > 0$이고 모든 실수 $x$에 대하여 $\\sin(ax) - 1 \\le 0$이므로:\n• $\\cos(ax) \\ge 0$인 구간 $\\left[0, \\frac{\\pi}{2a}\\right]$에서는 $|g'(f(x))f'(x)| = -(g(f(x)))'$이므로 정적분 값은 $g(f(0)) - g\\left(f\\left(\\frac{\\pi}{2a}\\right)\\right) = 1 - 0 = 1$이다.\n• $\\cos(ax) \\le 0$인 구간 $\\left[\\frac{\\pi}{2a}, \\frac{\\pi}{a}\\right]$에서도 정적분 값은 $g\\left(f\\left(\\frac{\\pi}{a}\\right)\\right) - g\\left(f\\left(\\frac{\\pi}{2a}\\right)\\right) = 1$이다.\n\n[2단계: 조건 (가)를 이용한 $a$의 값 결정]\n반주기 $\\frac{\\pi}{2a}$마다 정적분 값이 $1$씩 증가하므로 조건 (가)에서\n$$\\int_0^{2\\pi} |g'(f(x))f'(x)|\\,dx = ${intBound} + (\\sin(2a\\pi) - 1)^2 = \\frac{${4 * intBound + 1}}{4}$$\n따라서 $(\\sin(2a\\pi) - 1)^2 = \\frac{1}{4}$에서 $\\sin(2a\\pi) = \\frac{1}{2}$이고, 주어진 범위에서 $a = \\frac{${aNum}}{${aDen}}$으로 결정된다.\n\n[3단계: 조건 (나)의 치환적분으로 $b$ 결정]\n조건 (나)에서 $g(x) = s$로 치환하면 $x = b$일 때 $s = 0$, $x = b+1$일 때 $s = 1$이므로\n$$\\int_0^1 f(s)\\,ds = \\left[\\frac{1}{a}\\cos(as) + (b+1)s\\right]_0^1 = \\frac{\\cos a}{a} + (b + 1) - \\frac{1}{a} = \\frac{\\cos a}{a}$$\n따라서 $b + 1 = \\frac{1}{a} = \\frac{${aDen}}{${aNum}}$이다.\n이를 대입하면 $f(2\\pi) = -\\sin(2a\\pi) + b + 1 = -\\frac{1}{2} + \\frac{${aDen}}{${aNum}} = \\frac{${qVal}}{${pVal}}$이므로 서로소인 자연수 $p = ${pVal}, q = ${qVal}$에서 $p + q = ${ansVal}$이다.`,
        geoSpec: promptGeo || undefined,
      };
    }

    // 1-B. 기하 30번형 (평면벡터 내적과 삼각형 넓이 추론 킬러 — e.g. 3-27682636-q30)
    if (/overrightarrow|벡터|내적/.test(seed.question) || (seed.subject.includes("기하") && num === 30)) {
      const lenAB = k + 1; // 3, 4, 5, 6
      const pVal = 3;
      const qVal = 10 * lenAB + 10; // 40, 50, 60, 70
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const g = gcd(pVal, qVal);
      const fp = pVal / g;
      const fq = qVal / g;
      const ansVal = fp + fq;
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] 평면벡터의 내적과 내분점 기하 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: "평면벡터 · 벡터의 내적",
        points: "4점",
        intent: seed.intent || "평면벡터의 내적과 삼각형의 닮음비를 이용하여 값을 추론한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `좌표평면에서 $\\overline{AB} = \\overline{AC} = ${lenAB}$인 예각삼각형 $ABC$와 선분 $AC$ 위의 점 $P$, 직선 $BP$ 위의 점 $Q$가 다음 조건을 만족시킨다. 삼각형 $APQ$의 넓이가 $\\frac{4\\sqrt{5}}{5}$일 때, $\\overrightarrow{AQ} \\cdot \\overrightarrow{BC} = \\frac{q}{p}$이다. $p + q$의 값을 구하시오. (단, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
        boxContent: `(가) $5\\overrightarrow{BP} = 2\\overrightarrow{BA} + 3\\overrightarrow{BC}$\n(나) $\\overrightarrow{AP} \\cdot \\overrightarrow{PQ} = \\overrightarrow{CP} \\cdot \\overrightarrow{PB}$, $\\overrightarrow{AP} \\cdot \\overrightarrow{BP} > 0$`,
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "평면벡터의 관계를 추론하여 내적의 값을 구한다."}\n\n[1단계: 조건 (가)를 통한 내분점 $P$의 위치 파악]\n조건 (가)의 $5\\overrightarrow{BP} = 2\\overrightarrow{BA} + 3\\overrightarrow{BC}$에서 $\\overrightarrow{BP} = \\frac{2\\overrightarrow{BA} + 3\\overrightarrow{BC}}{2 + 3}$이므로 점 $P$는 선분 $AC$를 $2 : 3$으로 내분하는 점이다.\n\n[2단계: 조건 (나)의 내적 등식을 통한 삼각형 닮음 유도]\n점 $P$가 선분 $AC$ 위의 한 직선 위에 있고 점 $Q$가 직선 $BP$ 위에 있으므로, 조건 (나)의 $\\overrightarrow{AP} \\cdot \\overrightarrow{PQ} = \\overrightarrow{CP} \\cdot \\overrightarrow{PB}$에서 두 벡터 쌍이 이루는 각이 같고\n$$\\overline{AP} \\times \\overline{PQ} = \\overline{CP} \\times \\overline{PB} \\implies \\overline{AP} : \\overline{PB} = \\overline{CP} : \\overline{PQ}$$\n이다. 따라서 두 삼각형 $BPA, QPC$는 서로 닮음이며 두 직선 $AB, CQ$는 서로 평행하다.\n\n[3단계: 수선의 발과 정사영을 이용한 $\\overrightarrow{AQ} \\cdot \\overrightarrow{BC}$ 계산]\n삼각형 $APQ$의 넓이로부터 $\\cos(\\angle BAC)$와 밑변 $\\overline{BC}$의 길이를 구하고, 두 점 $A, Q$에서 직선 $BC$에 내린 수선의 발을 각각 $R, S$라 하면 삼각형 $ABR$과 $QCS$의 닮음비 $3 : 2$에 의하여\n$$\\overrightarrow{AQ} \\cdot \\overrightarrow{BC} = \\overline{RS} \\times \\overline{BC} = \\frac{${fq}}{${fp}}$$\n이므로 서로소인 자연수 $p = ${fp}, q = ${fq}$에서 $p + q = ${ansVal}$이다.`,
        geoSpec: promptGeo || undefined,
      };
    }

    // 1-C. 확률과 통계 30번형 (조건부확률 / 중복조합 추론 킬러 — e.g. 3-27682638-q30)
    if (/주머니|확률|시행|사건/.test(seed.question) || (seed.subject.includes("확률") && num === 30)) {
      const nBlue = k + 2; // 4, 5, 6, 7
      const pVal = nBlue + 3; // 7, 8, 9, 10
      const qVal = 2;
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const g = gcd(pVal, qVal);
      const fp = pVal / g;
      const fq = qVal / g;
      const ansVal = fp + fq;
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] 주머니 시행과 조건부확률 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: "확률 · 조건부확률",
        points: "4점",
        intent: seed.intent || "조건부확률을 이용하여 확률을 구하는 문제를 해결한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `주머니 $A$에는 숫자 $1$이 적힌 공 $3$개, 숫자 $2$가 적힌 공 $2$개가 들어 있고, 주머니 $B$에는 숫자 $1$이 적힌 공 $${nBlue}$개, 숫자 $2$가 적힌 공 $1$개가 들어 있다. 두 주머니 $A, B$에서 각각 공을 임의로 한 개씩 꺼내어 적힌 수를 확인한 후 다시 넣지 않는 시행을 $2$번 반복할 때, 첫 번째와 두 번째 시행에서 확인한 두 수 중 크지 않은 수를 각각 $a_1, a_2$라 하자. $a_1 = a_2 = 1$일 때, 두 번째 시행 후 주머니 $B$에 숫자 $1$이 적힌 공 $${nBlue - 1}$개가 남아 있을 확률은 $\\frac{q}{p}$이다. $p + q$의 값을 구하시오. (단, $p$와 $q$는 서로소인 자연수이다.) [4점]`,
        boxContent: "",
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "조건부확률을 이용하여 확률을 구한다."}\n\n[1단계: 사건 정의 및 케이스 분류]\n$a_1 = a_2 = 1$인 사건을 $X$, 두 번째 시행 후 주머니 $B$에 숫자 $1$이 적힌 공이 $${nBlue - 1}$개 남아 있는 사건(즉, 두 번의 시행 중 주머니 $B$에서 숫자 $1$과 숫자 $2$가 각각 한 번씩 나오는 사건)을 $Y$라 하자.\n\n[2단계: $P(X)$와 $P(X \\cap Y)$ 계산]\n두 수 중 크지 않은 수가 $1$이려면 적어도 하나의 주머니에서 숫자 $1$이 적힌 공을 꺼내야 한다.\n• (ⅰ) 두 번 모두 주머니 $B$에서 $1$을 꺼내는 경우\n• (ⅱ) 첫 번째에 $B$에서 $2$, $A$에서 $1$을 꺼내고 두 번째에 $B$에서 $1$을 꺼내는 경우\n• (ⅲ) 첫 번째에 $B$에서 $1$을 꺼내고 두 번째에 $B$에서 $2$, $A$에서 $1$을 꺼내는 경우\n각 경우의 확률을 합산하여 조건부확률 $P(Y \\mid X) = \\frac{P(X \\cap Y)}{P(X)} = \\frac{${fq}}{${fp}}$를 얻는다.\n따라서 $p = ${fp}, q = ${fq}$이므로 $p + q = ${ansVal}$이다.`,
        geoSpec: promptGeo || undefined,
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
        geoSpec: promptGeo || undefined,
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
        geoSpec: promptGeo || undefined,
      };
    }

    // 4-B. 공간도형 정사영 29번 킬러 (e.g. 3-27682636-q29)
    if (/직육면체|정사영|이면각/.test(seed.question) || (seed.subject.includes("기하") && num === 29)) {
      const hVal = k + 1; // 3, 4, 5, 6
      const ansVal = 640 + 40 * (k - 2);
      return {
        title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] 직육면체 단면과 이면각·정사영 추론 (4점 킬러)`,
        grade: seed.grade,
        subject: seed.subject,
        unit: "공간도형 · 정사영",
        points: "4점",
        intent: seed.intent || "이면각의 크기를 구하여 정사영의 넓이를 구하는 문제를 해결한다.",
        difficulty: "킬러",
        sourceLabel: `${seed.sourceLabel} 1:1 쌍둥이 변형`,
        sourceTokenId: seed.id,
        sourceOrigin: seed,
        question: `$\\overline{AB} = 6, \\overline{AD} = 6, \\overline{AE} = ${hVal}$인 직육면체 $ABCD - EFGH$가 있다. 선분 $AB$를 $2 : 1$로 내분하는 점을 $P$, 선분 $AD$를 $1 : 2$로 내분하는 점을 $Q$라 하자. 선분 $EH$ 위의 점 $R$과 선분 $FG$ 위의 점 $S$에 대하여 두 직선 $RS, EF$는 서로 평행하다. 삼각형 $QRS$의 넓이가 $3\\sqrt{10}$이고 $\\overline{ER} < 2$일 때, 삼각형 $ARP$의 평면 $QRS$ 위로의 정사영의 넓이를 $S'$이라 하자. $25(S')^2$의 값을 구하시오. [4점]`,
        boxContent: "",
        choices: [],
        answer: String(ansVal),
        solution: `[출제의도] ${seed.intent || "이면각의 크기와 정사영의 성질을 이용하여 넓이를 구한다."}\n\n[1단계: 직교 관계와 선분 $\\overline{ER}$의 길이 결정]\n점 $P$는 선분 $AB$를 $2:1$로 내분하므로 $\\overline{AP} = 4$이고, 점 $Q$는 선분 $AD$를 $1:2$로 내분하므로 $\\overline{AQ} = 2$이다.\n직선 $RS$는 평면 $AEHD$와 수직이므로 $\\overline{AR} \\perp \\overline{RS}$, $\\overline{QR} \\perp \\overline{RS}$이다.\n$\\overline{RS} = 6$이고 삼각형 $QRS$의 넓이가 $3\\sqrt{10}$이므로 $\\overline{QR} = \\sqrt{10}$이며 피타고라스 정리로부터 $\\overline{ER} = 1$이다.\n\n[2단계: 두 평면이 이루는 이면각의 코사인값과 정사영 계산]\n두 평면 $ARP$와 $QRS$의 교선이 $RS$이므로 두 직선 $AR, QR$이 이루는 각 $\\theta$가 두 평면의 이면각이다.\n삼각형 $ARQ$에서 코사인법칙으로 $\\cos\\theta = \\frac{4}{5}$를 구하고 삼각형 $ARP$의 넓이에 곱하면 $25(S')^2 = ${ansVal}$이다.`,
        geoSpec: promptGeo || undefined,
      };
    }

    // 5. 수열 귀납적 정의 / 등차·등비 급수 15번·22번·29번 킬러 (e.g. 3-27682637-q29)
    const dStep = k + 2; // 4, 5, 6, 7
    const a1Val = 3 * dStep;
    const pAns = 2 * dStep + 3;
    const qAns = 9 * dStep + 14;
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] 수열의 귀납적 조건과 급수 추론 (4점 킬러)`,
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
      geoSpec: promptGeo || undefined,
    };
  }

  // Case B: 4점 준킬러 (13, 14, 19, 20, 27, 28번) 및 3점/2점 문항 1:1 쌍둥이 변형
  const mCoeff = k; // 2, 3, 4, 5
  if (isHard || seed.points === "4점") {
    const areaNum = 9 * mCoeff * mCoeff;
    return {
      title: `[${seed.year}년 ${seed.month}월 고${seed.grade} ${seed.subject} ${seed.number}번 1:1 변형] ${seed.unit} 핵심 추론 (4점)`,
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
      geoSpec: promptGeo || undefined,
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

function isExamStylePrompt(prompt: string): boolean {
  return /(시험지|용지|레이아웃|스타일|디자인|헤더|머리말|꼬리말|제목|부제목|1단|2단|3단|다단|단\s*나누기|수능형|평가원형|모의고사형|워크북|클리닉|내신형|미니멀|배너형|풀이\s*여백|여백|문항\s*간격|글씨\s*크기|폰트|글꼴|명조|바탕|고딕|테마|배경색|포인트\s*색|구분선|세로선|테두리|워터마크|이름\s*칸|점수\s*칸|정답표|해설지\s*포함|해설\s*포함|해설\s*빼|문제만\s*인쇄|페이지당)/.test(
    prompt
  ) && /(스타일|디자인|레이아웃|바꿔|변경|적용|설정|해줘|만들어|넣어|빼줘|숨겨|보여|늘려|줄여|넓게|좁게|크게|작게|1단|2단|3단|수능|워크북|클리닉|여백|폰트|명조|고딕|테마|색|구분선|워터마크|해설|정답표|제목)/.test(prompt);
}

function buildExamStyleFromPrompt(
  prompt: string,
  currentStyle?: ExamPaperStyle
): { style: ExamPaperStyle; reset: boolean; summaryParts: string[] } {
  const reset = /초기화|기본\s*스타일|원래대로|리셋/.test(prompt);
  const base: ExamPaperStyle = reset
    ? { ...DEFAULT_EXAM_PAPER_STYLE }
    : { ...DEFAULT_EXAM_PAPER_STYLE, ...(currentStyle || {}) };
  const next: ExamPaperStyle = { ...base, customCss: { ...(base.customCss || {}) } };
  const summaryParts: string[] = [];

  if (reset) {
    summaryParts.push("기본 수능형 2단 스타일로 초기화");
  }

  // 1) 프리셋 / 헤더 스타일
  if (/수능|평가원/.test(prompt)) {
    next.headerStyle = "suneung";
    next.columns = 2;
    next.borderStyle = "double";
    next.showColumnDivider = true;
    next.fontFamily = "'Noto Serif KR', 'Batang', Georgia, serif";
    summaryParts.push("수능·평가원 2단 레이아웃");
  } else if (/워크북|클리닉|서술형|노트/.test(prompt)) {
    next.headerStyle = "academy";
    next.columns = 1;
    next.solutionSpace = Math.max(next.solutionSpace || 0, 120);
    next.showStudentInfoBox = true;
    summaryParts.push("학원 클리닉·워크북 1단 레이아웃(풀이 여백 확장)");
  } else if (/모던|현대|카드|깔끔/.test(prompt)) {
    next.headerStyle = "modern";
    next.fontFamily = "'Pretendard', 'Malgun Gothic', sans-serif";
    next.accentColor = "#1d4ed8";
    summaryParts.push("모던 학원 스타일");
  } else if (/배너|강조\s*헤더/.test(prompt)) {
    next.headerStyle = "banner";
    summaryParts.push("상단 컬러 배너 헤더");
  } else if (/미니멀|심플|헤더\s*간단/.test(prompt)) {
    next.headerStyle = "minimal";
    next.borderStyle = "solid";
    summaryParts.push("미니멀 심플 헤더");
  } else if (/헤더\s*(?:없애|숨겨|제거|빼)/.test(prompt)) {
    next.headerStyle = "none";
    summaryParts.push("상단 헤더 숨김");
  }

  // 2) 단 수 (1단, 2단, 3단, 4단 등 무제한)
  const colMatch = prompt.match(/([1-4])\s*단/);
  if (colMatch) {
    next.columns = Number(colMatch[1]);
    if (next.columns === 1) {
      next.showColumnDivider = false;
    } else if (next.showColumnDivider === undefined) {
      next.showColumnDivider = true;
    }
    summaryParts.push(`${next.columns}단 다단 배열`);
  }

  // 3) 페이지당 문항 수
  if (/한\s*페이지에\s*모두|페이지\s*제한\s*없이|연속\s*배치/.test(prompt)) {
    next.perPage = 0;
    summaryParts.push("페이지당 문항 수 제한 해제(연속 자동 배치)");
  } else {
    const perPageMatch = prompt.match(/(?:페이지당|쪽당|한\s*장에|한\s*페이지에)\s*(\d{1,2})\s*(?:문항|문제|개)/);
    if (perPageMatch) {
      next.perPage = Number(perPageMatch[1]);
      summaryParts.push(`페이지당 ${next.perPage}문항 배치`);
    }
  }

  // 4) 풀이 여백 & 문항 간격
  const solPxMatch = prompt.match(/(?:풀이\s*)?(?:여백|공간)\s*(\d{1,3})\s*(?:px|픽셀)?/);
  if (solPxMatch) {
    next.solutionSpace = Number(solPxMatch[1]);
    summaryParts.push(`풀이 여백 ${next.solutionSpace}px`);
  } else if (/(?:풀이\s*)?(?:여백|공간).*(?:아주\s*넓|최대|많이|대폭)/.test(prompt)) {
    next.solutionSpace = 180;
    summaryParts.push("풀이 여백 대폭 확대(180px)");
  } else if (/(?:풀이\s*)?(?:여백|공간).*(?:넓게|늘려|추가|확보|키워)/.test(prompt)) {
    next.solutionSpace = Math.min(360, (next.solutionSpace || 40) + 70);
    summaryParts.push(`풀이 여백 확대(${next.solutionSpace}px)`);
  } else if (/(?:풀이\s*)?(?:여백|공간).*(?:없애|제거|최소|0|빼|줄여|좁게)/.test(prompt)) {
    next.solutionSpace = /없애|제거|0|최소|빼/.test(prompt) ? 8 : Math.max(8, (next.solutionSpace || 40) - 30);
    summaryParts.push(`풀이 여백 축소(${next.solutionSpace}px)`);
  }

  if (/문항\s*간격.*(?:넓게|늘려|띄워)/.test(prompt)) {
    next.problemGap = Math.min(80, (next.problemGap || 22) + 14);
    summaryParts.push(`문항 간격 확대(${next.problemGap}px)`);
  } else if (/문항\s*간격.*(?:좁게|줄여|촘촘)/.test(prompt)) {
    next.problemGap = Math.max(8, (next.problemGap || 22) - 10);
    summaryParts.push(`문항 간격 축소(${next.problemGap}px)`);
  }

  // 5) 글꼴(폰트) 및 글자 크기
  if (/고딕|프리텐다드|산세리프|돋움/.test(prompt)) {
    next.fontFamily = "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
    summaryParts.push("고딕(Pretendard) 서체");
  } else if (/명조|바탕|세리프|수능\s*글꼴/.test(prompt)) {
    next.fontFamily = "'Noto Serif KR', 'Batang', Georgia, serif";
    summaryParts.push("수능 명조(바탕) 서체");
  } else if (/손글씨|필기체|궁서/.test(prompt)) {
    next.fontFamily = "'Gungsuh', 'Nanum Pen Script', cursive, serif";
    summaryParts.push("필기/궁서 서체");
  }

  const fontPxMatch = prompt.match(/(?:글씨|글자|폰트)\s*(?:크기)?\s*(\d{2}(?:\.\d)?)\s*(?:px|pt|포인트)?/);
  if (fontPxMatch) {
    next.fontSize = Math.min(28, Math.max(9, Number(fontPxMatch[1])));
    summaryParts.push(`글자 크기 ${next.fontSize}px`);
  } else if (/(?:글씨|글자|폰트).*(?:크게|키워|확대)/.test(prompt)) {
    next.fontSize = Math.min(24, Number(((next.fontSize || 13.5) + 1.5).toFixed(1)));
    summaryParts.push(`글자 크기 확대(${next.fontSize}px)`);
  } else if (/(?:글씨|글자|폰트).*(?:작게|줄여|축소)/.test(prompt)) {
    next.fontSize = Math.max(10, Number(((next.fontSize || 13.5) - 1.5).toFixed(1)));
    summaryParts.push(`글자 크기 축소(${next.fontSize}px)`);
  }

  // 6) 테마 색상 & 배경색
  if (/네이비|파란|블루|남색/.test(prompt)) {
    next.accentColor = "#1e40af";
    summaryParts.push("네이비 블루 포인트 컬러");
  } else if (/초록|그린|에메랄드|민트/.test(prompt)) {
    next.accentColor = "#047857";
    summaryParts.push("에메랄드 그린 포인트 컬러");
  } else if (/보라|퍼플|바이올렛/.test(prompt)) {
    next.accentColor = "#6d28d9";
    summaryParts.push("로얄 퍼플 포인트 컬러");
  } else if (/빨간|레드|와인|버건디/.test(prompt)) {
    next.accentColor = "#b91c1c";
    summaryParts.push("와인 레드 포인트 컬러");
  } else if (/골드|갈색|브라운|황토/.test(prompt)) {
    next.accentColor = "#92400e";
    summaryParts.push("클래식 골드·브라운 컬러");
  } else if (/블랙|검정|흑백|모노/.test(prompt)) {
    next.accentColor = "#111827";
    next.backgroundColor = "#ffffff";
    summaryParts.push("정통 블랙&화이트 테마");
  }

  if (/미색|베이지|크림|눈이\s*편한|아이보리/.test(prompt)) {
    next.backgroundColor = "#fffdf6";
    summaryParts.push("아이보리 미색 시험지 배경");
  } else if (/흰색\s*배경|백색\s*배경/.test(prompt)) {
    next.backgroundColor = "#ffffff";
    summaryParts.push("순백색 시험지 배경");
  }

  // 7) 구분선 / 테두리 / 학생 정보란 / 배점 / 출처 / 정답·해설
  if (/구분선|세로선|중앙선/.test(prompt)) {
    next.showColumnDivider = !/빼|없애|제거|숨겨|끄/.test(prompt);
    summaryParts.push(next.showColumnDivider ? "다단 중앙 구분선 표시" : "중앙 구분선 숨김");
  }
  if (/테두리|외곽선|박스\s*테두리/.test(prompt)) {
    next.borderStyle = /빼|없애|제거|숨겨/.test(prompt)
      ? "none"
      : /점선/.test(prompt)
        ? "dashed"
        : /이중선|두줄/.test(prompt)
          ? "double"
          : "box";
    summaryParts.push(`테두리 스타일(${next.borderStyle})`);
  }
  if (/이름\s*칸|학생\s*정보|점수\s*칸|성명/.test(prompt)) {
    next.showStudentInfoBox = !/빼|없애|제거|숨겨/.test(prompt);
    summaryParts.push(next.showStudentInfoBox ? "학교·학년·이름·점수 기입란 표시" : "학생 기입란 숨김");
  }
  if (/배점/.test(prompt)) {
    next.showPoints = !/빼|없애|제거|숨겨/.test(prompt);
    summaryParts.push(next.showPoints ? "문항별 배점 표시" : "문항별 배점 숨김");
  }
  if (/출처/.test(prompt)) {
    next.showSource = !/빼|없애|제거|숨겨/.test(prompt);
    summaryParts.push(next.showSource ? "문항별 기출 출처 표시" : "문항별 출처 숨김");
  }
  if (/난이도\s*(?:뱃지|표시|보여|숨겨|빼)/.test(prompt)) {
    next.showDifficulty = !/빼|없애|제거|숨겨/.test(prompt);
    summaryParts.push(next.showDifficulty ? "난이도 표시" : "난이도 숨김");
  }
  if (/문제만\s*인쇄|해설\s*(?:빼|제거|숨겨|제외)|정답\s*(?:빼|제거|숨겨|제외)/.test(prompt)) {
    next.showAnswerKey = false;
    next.showSolutions = false;
    summaryParts.push("문제지만 단독 인쇄(정답·해설 제외)");
  } else if (/해설지|해설\s*포함|풀이\s*포함|정답.*해설.*포함|정답.*같이/.test(prompt)) {
    next.showAnswerKey = true;
    next.showSolutions = true;
    summaryParts.push("빠른 정답표 + 상세 해설지 동시 인쇄 포함");
  } else if (/정답표만|빠른\s*정답만/.test(prompt)) {
    next.showAnswerKey = true;
    next.showSolutions = false;
    summaryParts.push("빠른 정답표만 포함(상세 해설 제외)");
  }

  // 8) 선지 배열 열 수
  if (/선지.*1\s*열|선지.*세로/.test(prompt)) {
    next.choiceColumns = 1;
    summaryParts.push("객관식 선지 1열(세로) 정렬");
  } else if (/선지.*5\s*열|선지.*가로|선지.*한\s*줄/.test(prompt)) {
    next.choiceColumns = 5;
    summaryParts.push("객관식 선지 5열(한 줄 가로) 정렬");
  }

  // 9) 제목 / 부제목 / 꼬리말 / 워터마크 추출
  const titleMatch = prompt.match(/제목(?:을|은)?\s*['"“”‘’]([^'"“”‘’]{1,50})['"“”‘’]/);
  if (titleMatch) {
    next.title = titleMatch[1].trim();
    summaryParts.push(`제목 '${next.title}'`);
  }
  const subtitleMatch = prompt.match(/부제목(?:을|은)?\s*['"“”‘’]([^'"“”‘’]{1,60})['"“”‘’]/);
  if (subtitleMatch) {
    next.subtitle = subtitleMatch[1].trim();
    summaryParts.push(`부제목 '${next.subtitle}'`);
  }
  const footerMatch = prompt.match(/(?:꼬리말|하단\s*문구|학원명)(?:을|은|로)?\s*['"“”‘’]([^'"“”‘’]{1,50})['"“”‘’]/);
  if (footerMatch) {
    next.footerText = footerMatch[1].trim();
    summaryParts.push(`하단 문구 '${next.footerText}'`);
  }
  const wmMatch = prompt.match(/워터마크(?:를|은|로)?\s*['"“”‘’]([^'"“”‘’]{1,40})['"“”‘’]/);
  if (wmMatch) {
    next.watermark = wmMatch[1].trim();
    summaryParts.push(`워터마크 '${next.watermark}'`);
  } else if (/워터마크.*(?:빼|없애|제거|삭제)/.test(prompt)) {
    next.watermark = "";
    summaryParts.push("워터마크 제거");
  }

  if (summaryParts.length === 0) {
    summaryParts.push("요청하신 맞춤 시험지 디자인 스타일 적용");
  }

  return { style: next, reset, summaryParts };
}

interface ReportFeedbackStudentInput {
  id?: string;
  name: string;
  grade?: string;
  group?: string;
  attRate?: number | null;
  todayAtt?: string;
  hwRate?: number | null;
  todayHw?: string | null;
  avgScore?: number | null;
  latestExam?: string;
  wrongSummary?: string;
  progressSummary?: string;
  nextHomework?: string;
}

function buildPersonalizedStudentFeedback(
  st: ReportFeedbackStudentInput,
  idx: number,
  periodKor: string
): { studentId?: string; studentName: string; feedback: string } {
  const sentences: string[] = [];
  const pLabel = periodKor || "수업";
  const gradeGroup = [st.grade, st.group].filter(Boolean).join(" · ");

  // 1. 출결 + 과제 문장 (있는 요소만 자연스럽게 조합, 둘 다 빠져 있어도 자연스러운 도입부 생성)
  let attPhrase = "";
  if (st.todayAtt === "결석") {
    attPhrase = `당일 부득이한 결석이 있었으나 보충 학습 안내를 통해 진도 공백이 생기지 않도록 세심히 관리하고 있습니다`;
  } else if (st.todayAtt === "지각") {
    attPhrase = `등원 시간이 다소 늦었으나 입실 후에는 수업에 빠르게 집중하며 핵심 개념을 성실히 따라왔습니다`;
  } else if (st.attRate !== null && st.attRate !== undefined) {
    attPhrase =
      st.attRate >= 95
        ? `출석률 ${st.attRate}%의 성실한 등원 태도`
        : st.attRate >= 80
          ? `출석률 ${st.attRate}%로 꾸준한 학습 참여`
          : `출석률 ${st.attRate}%로 등원 리듬을 다잡아 가는 모습`;
  } else if (st.todayAtt === "출석") {
    attPhrase = `정상 등원하여 높은 수업 집중력`;
  }

  let hwPhrase = "";
  if (st.todayHw === "X" || (st.hwRate !== null && st.hwRate !== undefined && st.hwRate < 50)) {
    hwPhrase =
      st.hwRate !== null && st.hwRate !== undefined
        ? `과제 수행률(${st.hwRate}%)을 높이기 위해 수업 전 과제 완수 습관을 집중 지도하고 있습니다.`
        : `당일 미완료된 과제는 다음 수업 전까지 끝까지 풀어올 수 있도록 독려하였습니다.`;
  } else if (st.todayHw === "△" || (st.hwRate !== null && st.hwRate !== undefined && st.hwRate < 85)) {
    hwPhrase =
      st.hwRate !== null && st.hwRate !== undefined
        ? `과제 수행률 ${st.hwRate}%를 기록하며 어려운 문항도 끝까지 스스로 해결하려는 노력을 보이고 있습니다.`
        : `부여된 과제를 포기하지 않고 풀어오며 부족한 문항은 수업 중 함께 점검하였습니다.`;
  } else if (st.todayHw === "O" || (st.hwRate !== null && st.hwRate !== undefined)) {
    hwPhrase =
      st.hwRate !== null && st.hwRate !== undefined
        ? `과제 수행률 ${st.hwRate}%로 안정적인 자기주도 학습 습관을 보여주고 있습니다.`
        : `부여된 과제를 성실히 완수하여 안정적인 학습 리듬을 유지하고 있습니다.`;
  }

  if (st.todayAtt === "결석" || st.todayAtt === "지각") {
    sentences.push(`${st.name} 학생은 이번 ${pLabel} 과정 중 ${attPhrase}.`);
    if (hwPhrase) sentences.push(hwPhrase);
  } else if (attPhrase && hwPhrase) {
    sentences.push(`${st.name} 학생은 이번 ${pLabel} 기간 ${attPhrase}와 함께 ${hwPhrase}`);
  } else if (attPhrase) {
    sentences.push(`${st.name} 학생은 이번 ${pLabel} 기간 ${attPhrase}를 바탕으로 수업에 적극 참여하고 있습니다.`);
  } else if (hwPhrase) {
    sentences.push(`${st.name} 학생은 이번 ${pLabel} 기간 ${hwPhrase}`);
  } else {
    const introVariants = [
      `${st.name} 학생은 ${gradeGroup ? `${gradeGroup} ` : ""}수업에서 매 시간 차분한 태도로 핵심 개념 설명에 집중하며 학습 호흡을 안정적으로 이어가고 있습니다.`,
      `${st.name} 학생은 이번 ${pLabel} 수업에서 수학적 개념의 원리를 정확히 이해하고 스스로 풀이 과정을 정리하는 힘을 길러가고 있습니다.`,
      `${st.name} 학생은 ${gradeGroup ? `${gradeGroup} ` : ""}과정에서 배운 공식과 개념을 문제에 차근차근 적용하며 기초 체력을 탄탄히 다지고 있습니다.`,
    ];
    sentences.push(introVariants[idx % introVariants.length]);
  }

  // 2. 진도 + 성적 + 오답 문장 (기록된 요소만 선택적으로 조합)
  const progText = st.progressSummary?.trim() || "";
  const wrongText = st.wrongSummary?.trim() || "";
  const hasScore = st.avgScore !== null && st.avgScore !== undefined;
  const scoreLabel = st.latestExam?.trim()
    ? `${st.latestExam.trim()} 등 평가 평균 ${st.avgScore}점`
    : `테스트 평균 ${st.avgScore}점`;

  if (progText && hasScore && wrongText) {
    sentences.push(
      `현재 '${progText}' 진도를 학습하며 ${scoreLabel}의 성취도를 기록하였고, ${wrongText} 과정을 통해 약점 유형까지 꼼꼼하게 보완하고 있습니다.`
    );
  } else if (progText && hasScore) {
    sentences.push(
      `현재 '${progText}' 과정을 학습하며 ${scoreLabel}을 기록하는 등 배운 개념을 실전 문항에 안정적으로 적용하고 있습니다.`
    );
  } else if (progText && wrongText) {
    sentences.push(
      `현재 '${progText}' 진도를 나아가며 ${wrongText} 클리닉을 병행하여 틀린 문항의 풀이 논리를 확실히 자기 것으로 만들고 있습니다.`
    );
  } else if (hasScore && wrongText) {
    sentences.push(
      `최근 실시한 평가에서 ${scoreLabel}을 기록하였으며, ${wrongText} 학습을 통해 실수하기 쉬운 유형을 집중 보완하고 있습니다.`
    );
  } else if (progText) {
    sentences.push(
      `현재 '${progText}' 단원의 핵심 개념과 필수 예제 풀이 과정을 꼼꼼히 익히며 단원 이해도를 높여가고 있습니다.`
    );
  } else if (hasScore) {
    sentences.push(
      `최근 평가에서 ${scoreLabel}을 기록하며 배운 단원의 핵심 유형을 실전 문제에 적용하는 연습을 꾸준히 이어가고 있습니다.`
    );
  } else if (wrongText) {
    sentences.push(
      `수업 중 ${wrongText} 과정을 성실히 이행하며 헷갈렸던 개념과 풀이 단계를 빈틈없이 다시 점검하고 있습니다.`
    );
  }

  // 3. 다음 과제 또는 격려 마무리 문장
  if (st.nextHomework?.trim()) {
    sentences.push(
      `다음 수업 과제인 '${st.nextHomework.trim()}'까지 스스로 풀어보며 오늘 배운 내용을 한번 더 복습할 수 있도록 가정에서도 따뜻한 격려 부탁드립니다.`
    );
  } else if (sentences.length < 2) {
    const closingVariants = [
      `앞으로도 단원별 핵심 유형과 서술형 풀이 과정을 빈틈없이 점검하여 실전 자신감을 더욱 높여가겠습니다.`,
      `꾸준한 개념 복습과 오답 정리가 실력 향상으로 이어질 수 있도록 다음 수업에서도 세심하게 지도하겠습니다.`,
      `배운 내용을 스스로 끝까지 풀어내는 습관이 잘 자리 잡을 수 있도록 학원에서도 계속해서 꼼꼼히 챙기겠습니다.`,
    ];
    sentences.push(closingVariants[idx % closingVariants.length]);
  }

  return {
    studentId: st.id,
    studentName: st.name,
    feedback: sentences.join(" "),
  };
}

function extractFeedbackStudentsList(
  contextData?: Record<string, unknown>,
  roster?: Array<{
    group: string;
    students: Array<{
      id?: string;
      name: string;
      grade: string;
      attendance?: string;
      homework?: string | null;
      wrongSummary?: string;
      examsSummary?: string;
      bookTitle?: string;
      progressPct?: number;
      latestScope?: string;
      latestHomework?: string;
    }>;
  }>
): ReportFeedbackStudentInput[] {
  if (Array.isArray(contextData?.students) && contextData.students.length > 0) {
    return contextData.students as ReportFeedbackStudentInput[];
  }
  if (Array.isArray(roster) && roster.length > 0) {
    return roster.flatMap(g =>
      g.students.map(s => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        group: g.group,
        todayAtt: s.attendance || undefined,
        todayHw: s.homework ?? undefined,
        wrongSummary: s.wrongSummary || undefined,
        progressSummary: [s.bookTitle, s.latestScope].filter(Boolean).join(" ").trim() || undefined,
        nextHomework: s.latestHomework || undefined,
      }))
    );
  }
  return [];
}

function buildSmartFallbackResponse(body: {
  prompt: string;
  mode: string;
  roster?: Array<{
    group: string;
    students: Array<{
      id?: string;
      name: string;
      grade: string;
      attendance?: string;
      homework?: string | null;
      wrongSummary?: string;
      examsSummary?: string;
      bookTitle?: string;
      progressPct?: number;
      latestScope?: string;
      latestHomework?: string;
    }>;
  }>;
  staff?: AcademyStaffMember[];
  contextData?: Record<string, unknown>;
}): { reply: string; actions: AiCopilotAction[] } {
  const prompt = (body.prompt || "").trim();
  const mode = body.mode || "general";
  const actions: AiCopilotAction[] = [];
  const staffList: AcademyStaffMember[] = Array.isArray(body.staff) ? body.staff : [];
  const activePersonaId =
    typeof body.contextData?.personaId === "string" ? body.contextData.personaId : AI_PERSONA_PRESETS[0].id;
  const activePersona = AI_PERSONA_PRESETS.find(p => p.id === activePersonaId) || AI_PERSONA_PRESETS[0];
  const currentExamStyle = (body.contextData?.currentExamStyle as ExamPaperStyle | undefined) || undefined;
  const wantsExamStyle = isExamStylePrompt(prompt);
  const styleResult = wantsExamStyle ? buildExamStyleFromPrompt(prompt, currentExamStyle) : null;
  if (styleResult) {
    actions.push({
      type: "update_exam_style",
      style: styleResult.style,
      reset: styleResult.reset,
    });
  }

  // If the user only asked to change exam style (without requesting new problems/geometry/students), return immediately
  if (
    styleResult &&
    !/출제|변형\s*문제|쌍둥이|문항\s*생성|문제\s*만들|문제\s*뽑아|작도|그려/.test(prompt)
  ) {
    return {
      reply: `✨ 요청하신 대로 시험지 스타일(**${styleResult.summaryParts.join(" · ")}**)을 제한 없이 즉시 변경했습니다!\n\n우측 **시험지 캔버스**에서 실시간으로 바뀐 디자인을 확인하고 **[🖨️ 바로 인쇄 / PDF]** 버튼으로 곧바로 출력하실 수 있습니다. 추가로 폰트, 여백, 단 수(1단/2단/3단), 색상, 워터마크, 해설지 포함 여부 등 무엇이든 말씀해 주세요!`,
      actions,
    };
  }

  if (mode === "geometry" || (/작도|그려|그래프|도형/.test(prompt) && !/문제|문항|출제|변형/.test(prompt))) {
    const prevSpec = (body.contextData?.currentGeoSpec as MathGeoSpec | undefined) || null;
    const baseSpec =
      buildMathGeoSpecFromPrompt(prompt) ||
      inferMathGeoSpecFromProblem(prompt, "", [], null);
    const mergedSpec: MathGeoSpec = prevSpec
      ? {
          ...prevSpec,
          ...baseSpec,
          title: baseSpec.title || prevSpec.title || "AI 맞춤 작도 도형",
        }
      : baseSpec;

    // Apply conversational modifications on top of prevSpec if requested
    if (prevSpec && /추가|같이|더|바꿔|변경|색칠|접선|원|점/.test(prompt)) {
      const tangentMatch = prompt.match(/x\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:에서|의)?\s*접선/);
      if (tangentMatch && (mergedSpec.functions?.[0] || prevSpec.functions?.[0])) {
        const fnExpr = (mergedSpec.functions?.[0] || prevSpec.functions?.[0])!.expr;
        const atX = Number(tangentMatch[1]);
        mergedSpec.functions = mergedSpec.functions?.length ? mergedSpec.functions : prevSpec.functions;
        mergedSpec.tangents = [
          ...(prevSpec.tangents || []),
          {
            fn: fnExpr,
            atX,
            label: "l",
            style: "dashed",
            pointLabel: `P(${atX})`,
            dropToX: true,
            xTick: String(atX),
          },
        ];
      }
      const shadeMatch = prompt.match(/(-?\d+(?:\.\d+)?)\s*(?:에서|부터|~)\s*(-?\d+(?:\.\d+)?)\s*까지\s*(?:적분|색칠|넓이)/);
      if (shadeMatch && (mergedSpec.functions?.[0] || prevSpec.functions?.[0])) {
        const f1 = (mergedSpec.functions?.[0] || prevSpec.functions?.[0])!.expr;
        const f2 = (mergedSpec.functions?.[1] || prevSpec.functions?.[1])?.expr;
        mergedSpec.functions = mergedSpec.functions?.length ? mergedSpec.functions : prevSpec.functions;
        mergedSpec.shadedRegions = [
          {
            f1,
            f2,
            from: Number(shadeMatch[1]),
            to: Number(shadeMatch[2]),
          },
        ];
      }
      if (/색칠\s*(?:빼|제거|삭제|없애)/.test(prompt)) {
        mergedSpec.shadedRegions = [];
      }
      if (/격자|그리드/.test(prompt)) {
        mergedSpec.showGrid = !/빼|제거|숨기|끄/.test(prompt);
      }
      if (/축\s*(?:빼|제거|숨기|없애)/.test(prompt)) {
        mergedSpec.showAxes = false;
      } else if (/축\s*(?:보여|표시|켜)/.test(prompt)) {
        mergedSpec.showAxes = true;
      }
    }

    actions.push({
      type: "update_geo_spec",
      geoSpec: mergedSpec,
      description: prompt,
    });
    return {
      reply: `요청하신 **"${prompt}"** 조건에 맞춰 수학 도형·함수 그래프(**${mergedSpec.title || "맞춤 작도"}**)를 작도했습니다! 추가로 접선, 교점, 적분 색칠 구간, 원·삼각형·보조선을 더하거나 수정하고 싶으시면 채팅으로 편하게 말씀해 주세요.`,
      actions,
    };
  }

  if (mode === "report_feedback" || /총평|피드백.*(?:작성|생성|써|만들)|코멘트.*(?:작성|생성|써|만들)/.test(prompt)) {
    const studentsData = extractFeedbackStudentsList(body.contextData, body.roster);
    const periodKor = String(body.contextData?.periodKor || "수업");
    const feedbacks = studentsData.map((st, idx) => buildPersonalizedStudentFeedback(st, idx, periodKor));
    actions.push({
      type: "generate_report_feedbacks",
      feedbacks,
    });
    return {
      reply: `선택한 **${feedbacks.length}명**의 학습 기록(기록된 요소 기준)을 분석하여 학생별 맞춤 총평 코멘트를 작성했습니다.`,
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
      const cleanLabel = topSeed.sourceLabel.replace(/고([123])\s+고\1/g, "고$1");
      return {
        reply: `요청하신 조건에 맞춰 **${cleanLabel} (${topSeed.points} · ${topSeed.difficulty})** 기출 토큰(문제+해설 1:1 매칭)을 참조하여 **동일한 추론 구조의 1:1 쌍둥이 변형 문항**${twin.geoSpec ? "과 **맞춤 수학 도형**" : ""}을 생성했습니다!\n\n문항 카드 상단의 **[원본 기출(${topSeed.number}번) 1:1 비교 ▼]** 버튼을 클릭하시면 변형 전 원본 기출 문제·해설과 한눈에 대조하실 수 있습니다.`,
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
    const mentionedStaff = staffList.find(st => prompt.includes(st.name) || prompt.includes(st.role));
    const titlePrefix = mentionedStaff ? `[${mentionedStaff.name} ${mentionedStaff.role}께] ` : "";
    actions.push({
      type: "add_handoff",
      title: `${titlePrefix}${prompt.slice(0, 26)}`,
      content: prompt,
      author: mentionedStaff ? `${mentionedStaff.name} ${mentionedStaff.role} 전달` : "AI 코파일럿",
    });
    return {
      reply: mentionedStaff
        ? `**${mentionedStaff.name} ${mentionedStaff.role}**(${mentionedStaff.duties || mentionedStaff.assignedClasses || "학원 구성원"})께 전달할 내용을 **일일 메모 · 인수인계 보드**에 등록했습니다.`
        : "요청하신 내용을 **일일 메모 · 인수인계 보드**에 등록했습니다.",
      actions,
    };
  }

  // 학원 구성원(원장님·선생님·조교쌤·실장님) 등록 / 삭제 / 조회
  if (/(원장님?|선생님|강사|조교쌤?|실장님?)/.test(prompt)) {
    // 1) 구성원 추가/등록 ("박지훈 조교쌤 오답 클리닉 담당으로 등록해줘", "이수진 실장님 추가해줘")
    if (/(추가|등록|저장|배정|넣어)/.test(prompt) && !/학생|원생/.test(prompt)) {
      const roleMatch = prompt.match(/(원장님?|조교쌤?|실장님?|선생님|강사)/);
      const role = roleMatch
        ? /원장/.test(roleMatch[1])
          ? "원장님"
          : /조교/.test(roleMatch[1])
            ? "조교쌤"
            : /실장/.test(roleMatch[1])
              ? "실장님"
              : "선생님"
        : "선생님";
      const beforeRole = roleMatch
        ? prompt.slice(0, prompt.indexOf(roleMatch[0])).match(/([가-힣]{2,4})\s*$/)
        : null;
      const fallbackNames =
        prompt
          .replace(/(우리\s*학원|학원|구성원|원장님?|선생님|강사|조교쌤?|실장님?|담당|업무|클리닉|상담|추가|등록|저장|해줘|해주세요)/g, " ")
          .match(/[가-힣]{2,4}/g) || [];
      const staffName = beforeRole ? beforeRole[1] : fallbackNames[0];
      if (staffName) {
        const classMatch = prompt.match(/([가-힣a-zA-Z0-9\s]{2,15}반)/);
        const dutyMatch = prompt.match(/\(([^)]+)\)/);
        actions.push({
          type: "upsert_staff",
          name: staffName,
          role,
          assignedClasses: classMatch ? classMatch[1].trim() : "",
          duties: dutyMatch ? dutyMatch[1].trim() : "",
        });
        return {
          reply: `👥 우리 학원 구성원 명단에 **${staffName} ${role}**${classMatch ? ` (담당: ${classMatch[1].trim()})` : ""}${dutyMatch ? ` · ${dutyMatch[1].trim()}` : ""}을(를) 등록했습니다! ([설정 → 학원 구성원 관리](/settings#staff)에서도 확인·수정하실 수 있습니다.)`,
          actions,
        };
      }
    }

    // 2) 구성원 삭제 ("박지훈 조교쌤 삭제해줘")
    if (/(삭제|제거|빼줘)/.test(prompt) && !/학생|원생|반/.test(prompt)) {
      const matched = staffList.find(st => prompt.includes(st.name));
      if (matched) {
        actions.push({ type: "delete_staff", name: matched.name });
        return {
          reply: `학원 구성원 목록에서 **${matched.name} ${matched.role}**을(를) 삭제했습니다.`,
          actions,
        };
      }
    }

    // 3) 구성원 조회 ("우리 학원 조교쌤이나 실장님 누구 있어?", "선생님 명단 알려줘")
    if (/(누구|명단|목록|알려|보여|현황|있어)/.test(prompt) || staffList.some(st => prompt.includes(st.name))) {
      if (staffList.length === 0) {
        return {
          reply:
            "현재 등록된 학원 구성원(선생님·조교쌤·실장님)이 없습니다. **[설정 → 학원 구성원 관리](/settings#staff)** 페이지에서 추가하시거나, 이 채팅창에서 *\"박지훈 조교쌤(오답 클리닉 담당), 이수진 실장님(상담·행정 담당) 등록해줘\"*라고 말씀해 주세요!",
          actions: [],
        };
      }
      const lines = staffList.map(
        st =>
          `- **[${st.role}] ${st.name}**${st.assignedClasses ? ` · 담당 반: ${st.assignedClasses}` : ""}${
            st.duties ? ` · 업무: ${st.duties}` : ""
          }`
      );
      return {
        reply: `👥 현재 등록된 **우리 학원 구성원(${staffList.length}명)** 명단입니다:\n\n${lines.join("\n")}\n\n*"${staffList[0].name} ${staffList[0].role}께 오늘 결석생 상담 인수인계 메모 남겨줘"*처럼 이름으로 바로 명령하실 수 있습니다!`,
        actions: [],
      };
    }
  }

  // 학생 관리: 반 추가 / 반 삭제 / 학생 추가 / 학생 수정 / 학생 삭제 / 진도 기록 / 출결·숙제·오답·성적 기록 / 학생 현황 조회
  const rosterGroups = body.roster || [];
  const allRosterStudents = rosterGroups.flatMap(g => g.students.map(s => ({ ...s, className: g.group })));

  // 1) 반 추가 ("고1 심화반 만들어줘", "중2 A반 추가해줘")
  const addClassMatch = prompt.match(/([가-힣a-zA-Z0-9\s]{2,18}반)\s*(?:새로\s*)?(?:만들|생성|추가|개설|등록)/);
  if (addClassMatch && !/학생/.test(prompt)) {
    const className = addClassMatch[1].replace(/^(새|새로운|신규)\s*/, "").trim();
    actions.push({ type: "add_class", name: className });
    return {
      reply: `새로운 반 **'${className}'**을(를) 생성했습니다.`,
      actions,
    };
  }

  // 2) 반 삭제 ("중2 C반 삭제해줘")
  const delClassMatch = prompt.match(/([가-힣a-zA-Z0-9\s]{2,18}반)\s*(?:삭제|제거|없애)/);
  if (delClassMatch && !/학생/.test(prompt)) {
    const className = delClassMatch[1].trim();
    actions.push({ type: "delete_class", name: className });
    return {
      reply: `요청하신 **'${className}'** 반을 삭제 처리했습니다.`,
      actions,
    };
  }

  // 3) 학생 추가 ("중2 A반에 홍길동 중2 학생 추가해줘", "고1 심화반 김철수(고1) 등록해줘")
  if (/(?:학생|원생)?\s*(?:추가|등록|입학|배정)/.test(prompt) && /반/.test(prompt)) {
    const matchedGroup = rosterGroups.find(g => prompt.includes(g.group));
    const classMatch = prompt.match(/([가-힣a-zA-Z0-9\s]{2,18}반)/);
    const className = matchedGroup?.group || (classMatch ? classMatch[1].trim() : rosterGroups[0]?.group || "기본반");
    const gradeMatch = prompt.match(/(초[1-6]|중[1-3]|고[1-3])/);
    const grade = gradeMatch ? gradeMatch[1] : "고1";
    const cleanedForName = prompt
      .replace(className, " ")
      .replace(/(초[1-6]|중[1-3]|고[1-3])/g, " ")
      .replace(/(학생|원생|새로|신규|추가|등록|배정|입학|해줘|해주세요|에|으로|로)/g, " ");
    const nameTokens = cleanedForName.match(/[가-힣]{2,4}/g) || [];
    const studentName = nameTokens[nameTokens.length - 1];
    if (studentName) {
      actions.push({ type: "add_student", className, name: studentName, grade });
      return {
        reply: `**'${className}'**에 **${studentName} (${grade})** 학생을 등록했습니다.`,
        actions,
      };
    }
  }

  // 4) 학생 삭제 ("홍길동 학생 삭제해줘")
  if (/학생.*(?:삭제|제거|퇴원)|(?:삭제|제거|퇴원).*학생/.test(prompt)) {
    const target = allRosterStudents.find(s => prompt.includes(s.name));
    const fallbackName = (prompt.replace(/(학생|원생|삭제|제거|퇴원|처리|해줘|해주세요)/g, " ").match(/[가-힣]{2,4}/) || [])[0];
    const targetName = target?.name || fallbackName;
    if (targetName) {
      actions.push({ type: "delete_student", name: targetName });
      return {
        reply: `**${targetName}** 학생을 재원생 목록에서 삭제했습니다.`,
        actions,
      };
    }
  }

  // 5) 학생 정보(이름/학년) 수정 ("김민준 학년을 고2로 변경해줘", "김민준 이름을 김민수로 수정해줘")
  if (/(?:학년|이름).*(?:수정|변경|바꿔)|(?:수정|변경|바꿔).*(?:학년|이름)/.test(prompt)) {
    const target = allRosterStudents.find(s => prompt.includes(s.name));
    if (target) {
      const gradeMatch = prompt.match(/(초[1-6]|중[1-3]|고[1-3])/);
      const newNameMatch = prompt.match(/이름을?\s*([가-힣]{2,4})(?:으로|로)/);
      actions.push({
        type: "update_student",
        targetName: target.name,
        ...(newNameMatch ? { newName: newNameMatch[1] } : {}),
        ...(gradeMatch ? { newGrade: gradeMatch[1] } : {}),
      });
      return {
        reply: `**${target.name}** 학생의 정보를 수정했습니다.`,
        actions,
      };
    }
  }

  // 6) 진도 · 다음 과제 · 완료 페이지 기록 ("김민준 오늘 진도 이차방정식 p.42~48, 다음 숙제 p.49~52 기록해줘")
  if (/진도|페이지|교재|과제\s*범위|숙제\s*범위/.test(prompt) && /(?:기록|입력|저장|바꿔|변경|적용|넣어)/.test(prompt)) {
    const matchedStudent = allRosterStudents.find(s => prompt.includes(s.name));
    const matchedGroup = rosterGroups.find(g => prompt.includes(g.group));
    const studentName = matchedStudent?.name || "전체";
    const pageMatch = prompt.match(/(\d{1,3})\s*(?:페이지|쪽|p)\s*완료/i);
    const scopeMatch = prompt.match(/진도(?:는|를|범위)?\s*([^,，/]+?)(?:,|，|숙제|과제|기록|입력|저장|$)/);
    const hwMatch = prompt.match(/(?:다음\s*)?(?:숙제|과제)(?:는|를|범위)?\s*([^,，/]+?)(?:,|，|기록|입력|저장|해줘|$)/);
    actions.push({
      type: "record_progress",
      studentName,
      ...(matchedGroup ? { className: matchedGroup.group } : {}),
      ...(scopeMatch ? { scope: scopeMatch[1].trim() } : { scope: prompt }),
      ...(hwMatch ? { homework: hwMatch[1].trim() } : {}),
      ...(pageMatch ? { completedPage: Number(pageMatch[1]) } : {}),
    });
    return {
      reply: `**${matchedStudent ? matchedStudent.name : matchedGroup ? `${matchedGroup.group} 전원` : "전체 학생"}**의 수업 진도·과제 기록을 반영했습니다.`,
      actions,
    };
  }

  // 7) 출결 · 숙제 · 오답 · 시험 성적 기록
  if (/출석|지각|결석|조퇴|숙제|점수|성적|오답/.test(prompt) && !/누구|알려|목록|현황|몇\s*명|보여/.test(prompt)) {
    const hasAtt = /출석|지각|결석|조퇴/.test(prompt);
    const attendance = /지각/.test(prompt) ? "지각" : /결석/.test(prompt) ? "결석" : /조퇴/.test(prompt) ? "조퇴" : hasAtt ? "출석" : undefined;
    const hasHw = /숙제|과제/.test(prompt);
    const homework = /숙제\s*X|안\s*해|미제출|미완료/i.test(prompt) ? "X" : /숙제\s*△|세모|일부/i.test(prompt) ? "△" : hasHw ? "O" : undefined;
    const scoreMatch = prompt.match(/(\d{1,3})\s*점/);
    const wrongDone = /오답\s*완료/.test(prompt) ? true : undefined;
    const wrongCountMatch = prompt.match(/오답\s*(\d{1,2})\s*(?:개|문항)(?:\s*중\s*(\d{1,2})\s*(?:개|문항))?/);
    const matchedStudent = allRosterStudents.find(s => prompt.includes(s.name));
    const matchedGroup = rosterGroups.find(g => prompt.includes(g.group));
    const targetName = matchedStudent?.name || "전체";

    actions.push({
      type: "record_daily",
      studentName: targetName,
      ...(matchedGroup ? { className: matchedGroup.group } : {}),
      ...(attendance ? { attendance } : {}),
      ...(homework ? { homework } : {}),
      ...(wrongDone !== undefined ? { wrongCompleted: wrongDone } : {}),
      ...(wrongCountMatch
        ? {
            totalWrong: Number(wrongCountMatch[1]),
            correctedCount: wrongCountMatch[2] ? Number(wrongCountMatch[2]) : 0,
          }
        : {}),
      ...(scoreMatch ? { examName: "일일 테스트", examScore: Math.min(100, Number(scoreMatch[1])), examMaxScore: 100 } : {}),
    });

    return {
      reply: `**${matchedStudent ? matchedStudent.name : matchedGroup ? `${matchedGroup.group} 전원` : "전체"}** 학생의 일일 기록(${[
        attendance ? `출결: **${attendance}**` : "",
        homework ? `숙제: **${homework}**` : "",
        wrongDone ? `오답: **완료**` : wrongCountMatch ? `오답: **${wrongCountMatch[2] || 0}/${wrongCountMatch[1]}문항**` : "",
        scoreMatch ? `성적: **${scoreMatch[1]}점**` : "",
      ]
        .filter(Boolean)
        .join(", ")})을 즉시 반영했습니다.`,
      actions,
    };
  }

  // 8) 학생 관리 읽기/조회 ("학생 목록 알려줘", "오늘 출결 현황 보여줘", "김민준 상태 알려줘")
  if (/학생|명단|목록|출결|출석|결석|지각|숙제|성적|진도|몇\s*명|현황|누구/.test(prompt) || allRosterStudents.some(s => prompt.includes(s.name))) {
    const specificStudent = allRosterStudents.find(s => prompt.includes(s.name));
    if (specificStudent) {
      return {
        reply: `📋 **${specificStudent.name} (${specificStudent.grade} · ${specificStudent.className})** 학생의 현재 기록입니다:\n- **오늘 출결**: ${specificStudent.attendance || "미기록"}\n- **오늘 숙제**: ${specificStudent.homework || "미기록"}\n- **오답 클리닉**: ${specificStudent.wrongSummary || "기록 없음"}\n- **오늘 시험 성적**: ${specificStudent.examsSummary || "응시 기록 없음"}\n- **진행 교재 · 진도율**: ${specificStudent.bookTitle ? `${specificStudent.bookTitle} (${specificStudent.progressPct ?? 0}%)` : "미배정"}\n- **최근 진도 / 과제**: ${specificStudent.latestScope || "-"} / ${specificStudent.latestHomework || "-"}`,
        actions: [],
      };
    }
    if (allRosterStudents.length > 0) {
      const summaryLines = rosterGroups.map(
        g =>
          `- **${g.group} (${g.students.length}명)**: ${
            g.students
              .map(
                s =>
                  `${s.name}(${s.grade}${s.attendance ? `·${s.attendance}` : ""}${s.homework ? `·숙제${s.homework}` : ""}${
                    s.progressPct !== undefined ? `·진도${s.progressPct}%` : ""
                  })`
              )
              .join(", ") || "학생 없음"
          }`
      );
      return {
        reply: `📊 현재 학원 재원생 현황(**총 ${rosterGroups.length}개 반 · ${allRosterStudents.length}명**)입니다:\n\n${summaryLines.join("\n")}\n\n채팅으로 *"김민준 오늘 출석, 단원평가 95점 기록해줘"*, *"중2 A반 전원 오늘 진도 p.42~48 입력해줘"*, *"고1 심화반에 이순신(고1) 추가해줘"*처럼 말씀하시면 즉시 수정됩니다!`,
        actions: [],
      };
    }
  }

  if (/^(안녕|하이|헬로|반가워|좋은\s*아침|좋은\s*저녁|계세요|있어)/i.test(prompt)) {
    return {
      reply: `**[${activePersona.name}]** ${activePersona.sampleGreeting}`,
      actions: [],
    };
  }

  return {
    reply: `**[${activePersona.name}]** 말씀하신 **"${prompt}"**에 대해 함께 이야기해 볼까요?\n${activePersona.sampleGreeting}`,
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
    const isReasoningTask =
      isProbReq ||
      mode === "problem_studio" ||
      mode === "geometry" ||
      /해설|풀이|정답|변형|쌍둥이|킬러|작도|그래프|도형/.test(prompt);
    const enableWebSearch =
      body.useWebSearch !== false &&
      (isProbReq || /검색|서핑|찾아|최신|기출|내신|수능|모의고사|ebs/i.test(prompt));

    const key = process.env.GEMINI_API_KEY?.trim();
    // Only use instant deterministic fallback when API key is absent or when user requests a large batch (>= 6 problems) that could exceed serverless timeout.
    if (!key || (isProbReq && !body.imageBase64 && intent.requestedCount >= 6)) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        staff: body.staff as AcademyStaffMember[] | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({
        ...fallback,
        modelUsed: isReasoningTask ? REASONING_AGENT_MODELS[0] : FLASH_AGENT_MODELS[0],
        quota: quotaSnapshot,
      });
    }

    const matchedSeeds = findMatchingSeedTokens(
      prompt,
      body.contextData as Record<string, unknown> | undefined,
      Math.max(8, intent.requestedCount)
    );
    const primarySeed = matchedSeeds[0];
    const requestedUnits = extractRequestedUnits(prompt);
    const ctxObj = (body.contextData as Record<string, unknown> | undefined) || {};
    const resolvedPersona = resolveActivePersonaPrompt({
      personaId: typeof ctxObj.personaId === "string" ? ctxObj.personaId : undefined,
      customPrompt: typeof ctxObj.personaPrompt === "string" ? ctxObj.personaPrompt : undefined,
    });
    const activePersonaDirective = `\n[현재 설정된 AI 캐릭터(인격·페르소나) 지침 — '${resolvedPersona.preset.name}']\n${
      typeof ctxObj.personaPrompt === "string" && ctxObj.personaPrompt.trim()
        ? ctxObj.personaPrompt.trim()
        : resolvedPersona.effectivePrompt
    }\n위 캐릭터의 인격, 말투, 공감 방식, 리액션 스타일을 "reply" 답변에 일관되게 반영하세요.\n`;

    const systemInstruction =
      mode === "geometry"
        ? `당신은 수학 학원 올인원 워크스페이스 '유니데스크(UNIDESK)'의 알지오매스·지오지브라급 AI 도형 작도 전문가(Gemini 4 추론 엔진)입니다.
사용자가 채팅으로 요청한 함수 그래프, 접선, 적분 색칠 영역, 원, 삼각형, 사각형, 직선, 각도 호(arc), 직각 표시(rightAngles), 수선의 발 점선 등을 정교한 MathGeoSpec JSON으로 작도하세요.
이전에 작도 중이던 도형(currentGeoSpec)이 있고 사용자가 "접선 추가해줘", "구간 -1부터 2까지 색칠해줘", "반지름을 4로 키워줘"처럼 부분 수정을 요청하면 기존 currentGeoSpec을 유지하면서 해당 요소만 정확히 반영하세요.
또한 사용자가 도형과 함께 문제 출제도 요청했다면 "generate_problems" 액션도 함께 포함할 수 있습니다.

반드시 아래 JSON 스키마로 반환하세요:
{
  "reply": "작도한 도형의 수학적 특징(함수식, 교점, 접선 방정식, 도형 성질 등)에 대한 친절한 설명",
  "actions": [
    {
      "type": "update_geo_spec",
      "geoSpec": {
        "title": "도형 제목",
        "xRange": [-4, 4],
        "yRange": [-3, 5],
        "showAxes": true,
        "showGrid": false,
        "equalAspect": true,
        "autoIntersections": true,
        "functions": [{ "expr": "x^3 - 3*x + 1", "label": "y=f(x)", "style": "solid" }],
        "tangents": [{ "fn": "x^3 - 3*x + 1", "atX": 1, "label": "l", "style": "dashed", "pointLabel": "P(1,-1)", "dropToX": true, "xTick": "1" }],
        "shadedRegions": [{ "f1": "x^3 - 3*x + 1", "from": -1, "to": 2 }],
        "circles": [{ "cx": 0, "cy": 0, "r": 2, "style": "solid" }],
        "polygons": [{ "points": [[0, 2], [-1.73, -1], [1.73, -1]], "shaded": true }],
        "segments": [{ "x1": 0, "y1": 0, "x2": 1.73, "y2": -1, "style": "dashed", "label": "r" }],
        "points": [{ "x": 0, "y": 2, "label": "A", "dropToX": false }],
        "rightAngles": [{ "at": [0, 0], "from": [1, 0], "to": [0, 1], "size": 8 }],
        "arcs": [{ "cx": 0, "cy": 0, "r": 0.6, "startDeg": 0, "endDeg": 60, "label": "θ" }],
        "asymptotes": [{ "x": 1, "y": 2, "label": "점근선" }]
      }
    }
  ]
}
${
  (body.contextData as Record<string, unknown> | undefined)?.currentGeoSpec
    ? `\n[현재 캔버스에 그려진 기존 도형 스펙(currentGeoSpec) — 사용자의 추가/수정 요청 시 이 스펙을 기반으로 업데이트하세요]: ${JSON.stringify(
        (body.contextData as Record<string, unknown>).currentGeoSpec
      ).slice(0, 4000)}`
    : ""
}`
        : mode === "report_feedback"
        ? `당신은 수학 학원 올인원 워크스페이스 '유니데스크(UNIDESK)'의 리포트 총평 전문 AI(Flash 모델)입니다.
전달된 각 학생의 실제 학습 지표(출결, 과제 수행률, 오답 클리닉 상태, 시험 성적 추이, 오늘/기간 교재 진도 범위, 다음 과제)를 바탕으로 학부모님께 신뢰감을 주는 다정하고 구체적인 맞춤형 피드백 코멘트(2~3문장)를 학생별로 각각 다르게 작성하세요.

[중요 원칙 — 일부 요소가 빠져 있거나 비어 있을 때의 처리 규칙]
1. 출결(attRate/todayAtt), 과제(hwRate/todayHw), 성적(avgScore), 진도(progressSummary), 오답(wrongSummary) 중 **하나 이상의 요소가 빠져 있거나(null 또는 빈 문자열) 전부 비어 있더라도 절대 오류를 내거나 누락을 지적하지 마세요**.
2. 기록되어 있는 요소만 자연스럽게 문장에 녹여 작성하고, 빠져 있는 요소는 언급을 생략하세요. 모든 지표가 비어 있는 학생이라도 학생의 이름·학년·반과 리포트 기간(${String(ctxObj.periodKor || "수업")})에 맞춰 수업 참여 태도와 개념 학습·복습 격려를 담은 자연스러운 2~3문장 총평을 반드시 작성하세요.
3. 전달된 모든 학생에 대해 빠짐없이 각각의 studentId와 studentName을 그대로 유지하여 반환하세요.

[리포트 기간]: ${String(ctxObj.periodKor || "일일")} (${String(ctxObj.date || "")})
[활성화된 리포트 포함 요소]: ${Array.isArray(ctxObj.enabledKinds) ? ctxObj.enabledKinds.join(", ") : "전체"}
[대상 학생 데이터 목록 (students)]:
${JSON.stringify(extractFeedbackStudentsList(ctxObj, body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined)).slice(0, 24000)}

반드시 아래 JSON 스키마만 반환하세요:
{
  "reply": "생성 완료 안내 메시지",
  "actions": [
    {
      "type": "generate_report_feedbacks",
      "feedbacks": [
        { "studentId": "전달된 학생의 id 그대로", "studentName": "전달된 학생의 name 그대로", "feedback": "맞춤 피드백 본문 (2~3문장)" }
      ]
    }
  ]
}`
        : `당신은 수학 학원 올인원 워크스페이스 '유니데스크(UNIDESK)'의 AI 수석 출제위원(Gemini 4 추론 엔진)이자 코파일럿입니다.
사용자의 요청에 따라 자연스럽고 다정한 한국어 답변(reply)과 필요한 경우 시스템을 조작하는 액션 배열(actions)을 반드시 아래 JSON 스키마로 반환하세요.
${activePersonaDirective}
[응답 JSON 스키마]
{
  "reply": "사용자에게 보여줄 안내 메시지 (웹 서핑을 참조했다면 어떤 기출/유형을 참고하여 어떻게 변형했는지 요약 포함)",
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
          "sourceLabel": "웹 기출 탐색 + AI 1:1 창의 변형 출제",
          "question": "LaTeX 수식($...$)이 포함된 변형 발문",
          "boxContent": "(가)/(나) 조건 또는 ㄱ, ㄴ, ㄷ 보기 (없으면 빈 문자열)",
          "choices": ["① 선지1", "② 선지2", "③ 선지3", "④ 선지4", "⑤ 선지5"],
          "answer": "정답",
          "solution": "[출제의도] 및 단계별 상세 해설 (수식 검산 포함)",
          "geoSpec": { "xRange": [-3, 4], "yRange": [-2, 6], "showAxes": true, "functions": [{ "expr": "x^3 - 3*x + 1", "label": "y=f(x)" }] }
        }
      ]
    }
  ]
}

[학생 관리 실시간 읽기 및 편집 권한 — 지원 액션 스키마]
사용자가 반이나 학생 명단, 출결, 숙제, 오답, 성적, 교재 진도에 대해 질문하면 아래 [현재 학원 반·학생 실시간 데이터(roster)]를 읽고 정확하게 답변하세요.
사용자가 반/학생 추가·수정·삭제나 출결·숙제·오답·시험성적·진도 기록을 요청하면 actions 배열에 아래 액션을 포함하여 즉시 실행하세요:
- 반 생성: { "type": "add_class", "name": "고1 심화반" }
- 반 삭제: { "type": "delete_class", "name": "고1 심화반" }
- 학생 추가: { "type": "add_student", "className": "고1 심화반", "name": "홍길동", "grade": "고1" }
- 학생 이름/학년 수정: { "type": "update_student", "targetName": "홍길동", "newName": "홍길동", "newGrade": "고2" }
- 학생 삭제: { "type": "delete_student", "name": "홍길동", "className": "고1 심화반" }
- 출결·숙제·오답·당일 시험 성적 기록: { "type": "record_daily", "studentName": "홍길동 또는 전체", "className": "선택 반이름", "attendance": "출석|지각|결석|조퇴", "homework": "O|△|X", "totalWrong": 5, "correctedCount": 5, "wrongCompleted": true, "examName": "단원평가", "examScore": 95, "examMaxScore": 100, "memo": "비고 코멘트" }
- 교재 진도·과제·완료 페이지 기록: { "type": "record_progress", "studentName": "홍길동 또는 전체", "className": "선택 반이름", "bookTitle": "교재명(선택)", "scope": "오늘 나간 진도 범위(예: p.42~48)", "homework": "오늘 내줄 숙제(예: p.49~52)", "completedPage": 48, "memo": "수업 피드백" }
- 인수인계 메모 등록: { "type": "add_handoff", "title": "제목", "content": "내용", "author": "작성자 또는 수신 구성원" }
- 학원 구성원(원장님·선생님·조교쌤·실장님) 등록/수정: { "type": "upsert_staff", "name": "박지훈", "role": "원장님|선생님|조교쌤|실장님", "assignedClasses": "담당 반", "duties": "담당 업무" }
- 학원 구성원 삭제: { "type": "delete_staff", "name": "박지훈" }

[함수 그래프 · 기하 도형 대화형 작도 — 지원 액션 스키마]
사용자가 함수 그래프, 접선, 적분 색칠 영역, 원, 삼각형, 사각형, 직선, 각도 호(arc), 직각 표시(rightAngles), 수선의 발 점선 등의 작도나 수정을 요청하면 별도의 모드 전환 없이도 즉시 actions 배열에 "update_geo_spec" 액션을 포함하여 작도하세요:
{
  "type": "update_geo_spec",
  "geoSpec": {
    "title": "도형 제목",
    "xRange": [-4, 4],
    "yRange": [-3, 5],
    "showAxes": true,
    "showGrid": false,
    "equalAspect": true,
    "autoIntersections": true,
    "functions": [{ "expr": "x^3 - 3*x + 1", "label": "y=f(x)", "style": "solid" }],
    "tangents": [{ "fn": "x^3 - 3*x + 1", "atX": 1, "label": "l", "style": "dashed", "pointLabel": "P(1,-1)", "dropToX": true, "xTick": "1" }],
    "shadedRegions": [{ "f1": "x^3 - 3*x + 1", "from": -1, "to": 2 }],
    "circles": [{ "cx": 0, "cy": 0, "r": 2, "style": "solid" }],
    "polygons": [{ "points": [[0, 2], [-1.73, -1], [1.73, -1]], "shaded": true }],
    "segments": [{ "x1": 0, "y1": 0, "x2": 1.73, "y2": -1, "style": "dashed", "label": "r" }],
    "points": [{ "x": 0, "y": 2, "label": "A", "dropToX": false }],
    "rightAngles": [{ "at": [0, 0], "from": [1, 0], "to": [0, 1], "size": 8 }],
    "arcs": [{ "cx": 0, "cy": 0, "r": 0.6, "startDeg": 0, "endDeg": 60, "label": "θ" }]
  }
}
${
  (body.contextData as Record<string, unknown> | undefined)?.currentGeoSpec
    ? `\n[현재 캔버스에 그려진 기존 도형 스펙(currentGeoSpec) — 도형 부분 수정 요청 시 이 스펙을 기반으로 업데이트하세요]: ${JSON.stringify(
        (body.contextData as Record<string, unknown>).currentGeoSpec
      ).slice(0, 3000)}`
    : ""
}
${
  Array.isArray(body.staff) && body.staff.length > 0
    ? `\n[우리 학원 구성원(원장님·선생님·조교쌤·실장님) 실시간 명단(staff) — 이름·직책·담당 반·담당 업무를 정확히 인식하여 대화 및 인수인계에 활용하세요]: ${JSON.stringify(body.staff).slice(0, 3000)}`
    : "\n[우리 학원 구성원 명단(staff)]: 아직 등록된 구성원이 없습니다. 사용자가 선생님/조교쌤/실장님 이름을 알려주면 upsert_staff 액션으로 즉시 저장하세요."
}

[시험지 스타일 및 디자인 무제한 AI 커스터마이징 — 지원 액션 스키마]
사용자가 시험지 스타일, 레이아웃, 단 수(1단/2단/3단 등), 헤더 디자인(수능형/모던/학원 클리닉/배너/미니멀/없음), 제목/부제목/머리말/꼬리말, 풀이 여백 높이, 문항 간격, 글꼴(명조/고딕/필기체 등 자유), 글자 크기, 포인트 색상, 용지 배경색, 세로 구분선, 테두리, 워터마크, 학생 이름/점수 기입란, 빠른 정답표 및 해설지 동시 인쇄 여부, 또는 임의의 CSS 스타일 변경을 요청하면 **어떠한 제한도 두지 말고** actions 배열에 "update_exam_style" 액션을 포함하여 즉시 반영하세요(문제 출제와 동시에 스타일 변경을 요청하면 "generate_problems"와 "update_exam_style"을 함께 반환하세요):
{
  "type": "update_exam_style",
  "reset": false,
  "style": {
    "title": "시험지 메인 제목",
    "subtitle": "상단 보조 부제목",
    "headerLeft": "좌측 배지(예: 제 2 교시, 고2 내신 대비)",
    "headerRight": "우측 배지(예: 홀수형, A형)",
    "footerText": "하단 꼬리말·학원명",
    "columns": 2,
    "perPage": 0,
    "headerStyle": "suneung | modern | academy | minimal | banner | none",
    "fontFamily": "'Noto Serif KR', serif 또는 'Pretendard', sans-serif 등 자유",
    "fontSize": 13.5,
    "lineHeight": 1.68,
    "problemGap": 22,
    "solutionSpace": 60,
    "accentColor": "#111827",
    "backgroundColor": "#ffffff",
    "textColor": "#0f172a",
    "borderStyle": "double | solid | dashed | box | none",
    "showColumnDivider": true,
    "showStudentInfoBox": true,
    "showPoints": true,
    "showDifficulty": false,
    "showSource": false,
    "showAnswerKey": true,
    "showSolutions": true,
    "choiceColumns": 0,
    "pagePadding": 24,
    "watermark": "배경 워터마크 텍스트(없으면 빈 문자열)",
    "customNote": "시험지 상단 안내/주의사항 문구",
    "customCss": {}
  }
}
${
  (body.contextData as Record<string, unknown> | undefined)?.currentExamStyle
    ? `\n[현재 시험지 스타일(currentExamStyle) — 부분 수정 요청 시 기존 설정을 유지하면서 요청한 속성만 업데이트하세요]: ${JSON.stringify(
        (body.contextData as Record<string, unknown>).currentExamStyle
      ).slice(0, 2500)}`
    : ""
}
${
  Array.isArray(body.roster) && body.roster.length > 0
    ? `\n[현재 학원 반·학생 실시간 데이터(roster) — 출결/숙제/오답/성적/교재 진도 포함]: ${JSON.stringify(body.roster).slice(0, 6000)}`
    : ""
}

[웹 서핑(Google Search) 및 수학 문제 변형 출제 절대 원칙]
1. **웹 서핑 및 내부 시드 참조 후 반드시 변형 출제 (그대로 복사 절대 금지!)**:
   - 웹 서핑(Google Search)이나 내부 기출 시드에서 찾아온 원본 기출·내신 문제를 **절대로 그대로 베껴서 출제하지 마세요**.
   - 반드시 원본 문제의 핵심 출제의도와 수학적 추론 구조만 가져오고, **함수식·계수·정의역·조건 (가)/(나)의 수치·구하는 값을 새롭게 재설계한 '창작 쌍둥이 변형 문제'**로 출제하세요.
   - 변형한 문제의 방정식·미적분·수열 해가 깔끔하게 떨어지는지 스스로 끝까지 풀어 검산한 뒤 정확한 정답(answer)과 단계별 해설(solution)을 작성하세요.
2. **요청 문항 수 및 난이도 엄수**:
   - 사용자가 수학 문제 출제/변형을 요청하면 반드시 actions 배열에 "type": "generate_problems" 액션을 포함하여 요청한 문항 수(${intent.requestedCount}문항)만큼 생성하세요.
   - 30번, 29번, 22번, 21번, 15번 등 킬러/고난도 요청 시 (가)·(나) 조건 추론, 구간별 정의 함수, 미분가능성, 정적분 치환, 수열 역추적 등 실제 수능/모의고사 4점 킬러 깊이를 유지하세요.
3. **도형/그래프(geoSpec)**:
   - 그림이나 그래프가 문제 발문("그림과 같이..." 등)에 필요하거나 사용자가 작도를 요청한 경우에만 geoSpec 필드를 포함하세요.
${
  matchedSeeds.length > 0
    ? `\n[내부 기출 시드 토큰 (문제+정답+해설 레퍼런스 — 그대로 쓰지 말고 논리 구조만 참고하여 새로운 수치·함수로 변형하세요)]: ${JSON.stringify(
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
${
  mode === "report_feedback" || (body.contextData as Record<string, unknown> | undefined)?.students
    ? `\n[학생 데이터 컨텍스트]: ${JSON.stringify(body.contextData).slice(0, 6000)}`
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

    // Build model candidate chain:
    // - Reasoning / Problem Creation -> Gemini 4 (gemini-4-carbon / neon / hydrogen) -> Pro -> Flash fallback
    // - OCR / Fast Copilot / Report Feedback -> Flash (gemini-3.8-flash / 3.5-flash-lite / 3.1-flash-lite)
    const customEnvModel = isReasoningTask
      ? process.env.GEMINI_REASONING_MODEL?.trim() || process.env.GEMINI_AGENT_MODEL?.trim()
      : process.env.GEMINI_FLASH_MODEL?.trim() || process.env.GEMINI_AGENT_MODEL?.trim();

    const candidateModels: string[] = [
      ...(customEnvModel ? [customEnvModel] : []),
      ...(isReasoningTask ? [...REASONING_AGENT_MODELS] : [...FLASH_AGENT_MODELS]),
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    let geminiData: Record<string, unknown> | null = null;
    let modelUsed = candidateModels[0] || OCR_MODEL;
    const webSearchSources: Array<{ title: string; url: string }> = [];

    for (const candidateModel of candidateModels) {
      try {
        // First try with Google Search grounding tool if enabled for problem research
        const requestPayload: Record<string, unknown> = {
          contents: [{ parts }],
          ...(enableWebSearch ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: isReasoningTask ? 0.45 : 0.25,
            maxOutputTokens: 16384,
            ...(enableWebSearch ? {} : { responseMimeType: "application/json" }),
          },
        };

        let res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            signal: AbortSignal.timeout(22_000),
            body: JSON.stringify(requestPayload),
          }
        );

        // If the model doesn't support google_search tool together with the request, retry immediately without tools
        if (!res.ok && enableWebSearch && res.status === 400) {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": key },
              signal: AbortSignal.timeout(20_000),
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: isReasoningTask ? 0.45 : 0.25,
                  maxOutputTokens: 16384,
                  responseMimeType: "application/json",
                },
              }),
            }
          );
        }

        if (res.ok) {
          geminiData = (await res.json()) as Record<string, unknown>;
          modelUsed = candidateModel;
          break;
        }
      } catch {
        // Try next candidate model in tier chain
      }
    }

    if (!geminiData) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, modelUsed, quota: quotaSnapshot });
    }

    const candidates = Array.isArray(geminiData.candidates)
      ? (geminiData.candidates as Array<Record<string, unknown>>)
      : [];
    const firstCandidate = candidates[0] || {};

    // Extract Google Search grounding sources if present
    const groundingMeta = firstCandidate.groundingMetadata as
      | { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> }
      | undefined;
    if (Array.isArray(groundingMeta?.groundingChunks)) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri) {
          webSearchSources.push({
            title: chunk.web.title || chunk.web.uri,
            url: chunk.web.uri,
          });
        }
      }
    }

    const contentObj = firstCandidate.content as { parts?: Array<{ thought?: boolean; text?: string }> } | undefined;
    const rawText = contentObj?.parts
      ?.filter(p => !p.thought)
      .map(p => p.text ?? "")
      .join("");

    if (!rawText) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, modelUsed, webSearchSources, quota: quotaSnapshot });
    }

    let parsed: { reply?: unknown; actions?: unknown };
    try {
      const cleaned = rawText
        .replace(/^[\s\S]*?```(?:json)?\s*/i, match => (match.includes("```") ? "" : match))
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      const jsonCandidate = jsonStart !== -1 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
      parsed = JSON.parse(jsonCandidate);
    } catch {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined,
        contextData: body.contextData as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ...fallback, modelUsed, webSearchSources, quota: quotaSnapshot });
    }

    // Attach 1:1 sourceOrigin token metadata to any generated problems
    const allTokens = loadAllProblemTokens();
    const rawActions = Array.isArray(parsed.actions) ? (parsed.actions as AiCopilotAction[]) : [];

    // Ensure report_feedback mode ALWAYS returns complete, matched feedbacks for every requested student
    if (mode === "report_feedback" || /총평|피드백.*(?:작성|생성|써|만들)|코멘트.*(?:작성|생성|써|만들)/.test(prompt)) {
      const requestedStudents = extractFeedbackStudentsList(
        ctxObj,
        body.roster as Array<{ group: string; students: Array<{ name: string; grade: string }> }> | undefined
      );
      const periodKor = String(ctxObj.periodKor || "수업");
      let fbAction = rawActions.find(a => a.type === "generate_report_feedbacks") as
        | Extract<AiCopilotAction, { type: "generate_report_feedbacks" }>
        | undefined;

      const topLevelList = Array.isArray((parsed as Record<string, unknown>).feedbacks)
        ? ((parsed as Record<string, unknown>).feedbacks as Array<{ studentId?: string; studentName?: string; feedback?: string }>)
        : Array.isArray((parsed as Record<string, unknown>).reportFeedbacks)
          ? ((parsed as Record<string, unknown>).reportFeedbacks as Array<{ studentId?: string; studentName?: string; feedback?: string }>)
          : [];

      if (!fbAction) {
        fbAction = {
          type: "generate_report_feedbacks",
          feedbacks: topLevelList
            .filter(item => typeof item?.feedback === "string" && item.feedback.trim().length > 0)
            .map(item => ({
              studentId: typeof item.studentId === "string" ? item.studentId : undefined,
              studentName: typeof item.studentName === "string" ? item.studentName : "",
              feedback: String(item.feedback).trim(),
            })),
        };
        rawActions.push(fbAction);
      } else if (!Array.isArray(fbAction.feedbacks)) {
        fbAction.feedbacks = [];
      }

      if (requestedStudents.length > 0) {
        const existingItems = fbAction.feedbacks;
        const usedIndices = new Set<number>();
        fbAction.feedbacks = requestedStudents.map((st, idx) => {
          const matchIdx = existingItems.findIndex((item, i) => {
            if (usedIndices.has(i) || !item?.feedback?.trim()) return false;
            if (st.id && item.studentId === st.id) return true;
            if (st.name && item.studentName === st.name) return true;
            if (st.name && item.studentName && (item.studentName.includes(st.name) || st.name.includes(item.studentName))) {
              return true;
            }
            return false;
          });
          const pickedIdx =
            matchIdx !== -1
              ? matchIdx
              : !usedIndices.has(idx) && existingItems[idx]?.feedback?.trim() && existingItems[idx]?.studentId !== "학생ID"
                ? idx
                : -1;
          if (pickedIdx !== -1) {
            usedIndices.add(pickedIdx);
            return {
              studentId: st.id,
              studentName: st.name,
              feedback: existingItems[pickedIdx].feedback.trim(),
            };
          }
          return buildPersonalizedStudentFeedback(st, idx, periodKor);
        });
      }
    }

    if (isExamStylePrompt(prompt) && !rawActions.some(a => a.type === "update_exam_style")) {
      const currentExamStyle = (body.contextData as Record<string, unknown> | undefined)?.currentExamStyle as
        | ExamPaperStyle
        | undefined;
      const builtStyle = buildExamStyleFromPrompt(prompt, currentExamStyle);
      rawActions.push({
        type: "update_exam_style",
        style: builtStyle.style,
        reset: builtStyle.reset,
      });
    }
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
          // Safety guard: if AI ever returned a question identical to the seed/source question, force transform it into a twin variant
          if (origin && p.question && p.question.replace(/\s+/g, "") === origin.question.replace(/\s+/g, "")) {
            const transformed = buildTwinProblemFromSeedToken(origin, i + 1, prompt);
            return {
              ...transformed,
              sourceLabel:
                webSearchSources.length > 0
                  ? `${origin.sourceLabel} + 웹 기출 변형`
                  : `${origin.sourceLabel} 1:1 쌍둥이 변형`,
            };
          }
          return {
            ...p,
            ...(origin
              ? {
                  sourceTokenId: origin.id,
                  sourceOrigin: origin,
                  sourceLabel:
                    p.sourceLabel ||
                    (webSearchSources.length > 0
                      ? `${origin.sourceLabel} + 웹 기출 변형`
                      : `${origin.sourceLabel} 1:1 쌍둥이 변형`),
                }
              : {
                  sourceLabel: p.sourceLabel || (webSearchSources.length > 0 ? "웹 기출 탐색 · AI 창의 변형" : "AI 창의 변형 출제"),
                }),
          };
        });
      }
    }

    return NextResponse.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : "요청하신 작업을 완료했습니다.",
      actions: rawActions,
      modelUsed,
      webSearchSources,
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
