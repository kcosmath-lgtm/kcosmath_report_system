import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { OCR_MODEL } from "../../../../lib/typing-model";
import type { AiCopilotAction } from "../../../../lib/ai-copilot";

export const maxDuration = 60;

const UNIT_KEYWORDS = [
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
  "도형의 이동",
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
  "수열",
  "등차",
  "등비",
  "극한",
  "연속",
  "미분",
  "도함수",
  "적분",
  "정적분",
  "확률",
  "통계",
];

function extractRequestedUnits(prompt: string): string[] {
  return UNIT_KEYWORDS.filter(kw => prompt.includes(kw));
}

function loadInternalSeedProblems(grade: number, prompt: string, maxSeeds = 12): Array<Record<string, unknown>> {
  try {
    const filePath = resolve(process.cwd(), "src/data/mock-exam-problems.json");
    if (!existsSync(filePath)) return [];
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    const all: Array<Record<string, unknown>> = Array.isArray(raw.problems) ? raw.problems : [];
    if (!all.length) return [];

    const units = extractRequestedUnits(prompt);
    let pool = all.filter(p => !grade || Number(p.grade) === grade);
    if (!pool.length) pool = all;

    if (units.length > 0) {
      const unitMatched = pool.filter(p => {
        const text = `${p.unit || ""} ${p.question || ""} ${p.title || ""}`;
        return units.some(u => text.includes(u));
      });
      if (unitMatched.length > 0) pool = unitMatched;
    }

    return pool.slice(0, maxSeeds).map(p => ({
      unit: p.unit,
      points: p.points,
      difficulty: p.difficulty,
      questionStructure: p.question,
      boxContent: p.boxContent,
      choicesPattern: p.choices,
    }));
  } catch {
    return [];
  }
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

function buildFullMockExamSet(count: number, grade: number, sourceRef: string, prompt = "") {
  const templates = [
    // 2점 문항
    {
      points: "2점",
      difficulty: "하" as const,
      unit: "다항식의 연산",
      keywords: ["다항식", "연산"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 다항식의 연산 쌍둥이 변형 (2점)`,
        question: `[2점] 두 다항식 $A = 2x^2 + ${seed}xy - y^2$, $B = x^2 - 2xy + ${seed + 1}y^2$에 대하여 $A + 2B$를 간단히 하면 $ax^2 + bxy + cy^2$이다. $a + b + c$의 값은?`,
        boxContent: "",
        choices: [
          `$${3 * seed - 1}$`,
          `$${3 * seed}$`,
          `$${3 * seed + 1}$`,
          `$${3 * seed + 2}$`,
          `$${3 * seed + 3}$`,
        ],
        answer: `③ $${3 * seed + 1}$`,
        solution: `$A + 2B = (2x^2 + ${seed}xy - y^2) + 2(x^2 - 2xy + ${seed + 1}y^2) = 4x^2 + (${seed - 4})xy + (${2 * seed + 1})y^2$이므로 $a+b+c = 4 + (${seed - 4}) + (${2 * seed + 1}) = ${3 * seed + 1}$입니다.`,
      }),
    },
    {
      points: "2점",
      difficulty: "하" as const,
      unit: "복소수와 이차방정식",
      keywords: ["복소수", "방정식", "이차방정식"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 복소수의 연산 쌍둥이 변형 (2점)`,
        question: `[2점] 등식 $(2 + i)x + (1 - i)y = ${seed + 4} + ${seed}i$를 만족시키는 두 실수 $x, y$에 대하여 $3x$의 값은? (단, $i = \\sqrt{-1}$)`,
        boxContent: "",
        choices: [`$${2 * seed + 2}$`, `$${2 * seed + 3}$`, `$${2 * seed + 4}$`, `$${2 * seed + 5}$`, `$${2 * seed + 6}$`],
        answer: `③ $${2 * seed + 4}$`,
        solution: `실수부분과 허수부분을 정리하면 $2x+y = ${seed + 4}$, $x-y = ${seed}$이므로 두 식을 더하면 $3x = ${2 * seed + 4}$입니다.`,
      }),
    },
    {
      points: "2점",
      difficulty: "하" as const,
      unit: "집합과 명제",
      keywords: ["집합", "명제"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 집합의 연산 쌍둥이 변형 (2점)`,
        question: `[2점] 두 집합 $A = \\{1, 2, ${seed + 3}, ${seed + 5}\\}$, $B = \\{2, ${seed + 3}, ${seed + 7}\\}$에 대하여 집합 $A \\cup B$의 모든 원소의 합은?`,
        boxContent: "",
        choices: [
          `$${3 * seed + 16}$`,
          `$${3 * seed + 17}$`,
          `$${3 * seed + 18}$`,
          `$${3 * seed + 19}$`,
          `$${3 * seed + 20}$`,
        ],
        answer: `③ $${3 * seed + 18}$`,
        solution: `$A \\cup B = \\{1, 2, ${seed + 3}, ${seed + 5}, ${seed + 7}\\}$이므로 모든 원소의 합은 $1 + 2 + (${seed + 3}) + (${seed + 5}) + (${seed + 7}) = ${3 * seed + 18}$입니다.`,
      }),
    },
    {
      points: "3점",
      difficulty: "중" as const,
      unit: "나머지정리와 인수분해",
      keywords: ["나머지정리", "인수분해", "다항식"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 나머지정리 쌍둥이 변형 (3점)`,
        question: `[3점] 다항식 $P(x) = x^3 + ax^2 - ${2 * seed}x + 4$를 $x - 2$로 나눈 나머지가 $12$일 때, $P(x)$를 $x + 1$로 나눈 나머지는? (단, $a$는 상수이다.)`,
        boxContent: "",
        choices: [`$${3 * seed + 1}$`, `$${3 * seed + 2}$`, `$${3 * seed + 3}$`, `$${3 * seed + 4}$`, `$${3 * seed + 5}$`],
        answer: `③ $${3 * seed + 3}$`,
        solution: `나머지정리에 의하여 $P(2) = 8 + 4a - ${4 * seed} + 4 = 12$이므로 $a = ${seed}$입니다. 따라서 $P(-1) = -1 + ${seed} + ${2 * seed} + 4 = ${3 * seed + 3}$입니다.`,
      }),
    },
    {
      points: "3점",
      difficulty: "중" as const,
      unit: "이차방정식과 이차함수",
      keywords: ["이차함수", "이차방정식", "함수", "방정식", "부등식"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 이차함수와 직선의 교점 쌍둥이 변형 (3점)`,
        question: `[3점] 그림과 같이 이차함수 $f(x) = \\frac{1}{2}(x-1)^2 - 1$의 그래프와 직선 $y = \\frac{1}{2}x + ${seed}$이 서로 다른 두 점 $A(\\alpha, y_1), B(\\beta, y_2)$에서 만날 때, $(\\alpha + \\beta)^2 - 2\\alpha\\beta$의 값은?`,
        boxContent: "(단, $\\alpha < \\beta$이다.)",
        choices: [
          `$${4 * seed + 9}$`,
          `$${4 * seed + 11}$`,
          `$${4 * seed + 13}$`,
          `$${4 * seed + 15}$`,
          `$${4 * seed + 17}$`,
        ],
        answer: `② $${4 * seed + 11}$`,
        solution: `방정식 $\\frac{1}{2}(x-1)^2 - 1 = \\frac{1}{2}x + ${seed}$의 양변에 $2$를 곱하면 $x^2 - 3x - (${2 * seed + 1}) = 0$이므로 $\\alpha + \\beta = 3$, $\\alpha\\beta = -(${2 * seed + 1})$입니다. 따라서 $(\\alpha+\\beta)^2 - 2\\alpha\\beta = 9 + ${4 * seed + 2} = ${4 * seed + 11}$입니다.`,
        geoSpec: {
          title: `${num}번 · 이차함수와 직선의 교점`,
          xRange: [-2, 5] as [number, number],
          yRange: [-2.5, 5.5] as [number, number],
          showAxes: true,
          functions: [
            { expr: "0.5*(x-1)^2 - 1", label: "y=f(x)", labelPos: [3.8, 3.5] as [number, number] },
            { expr: "0.5*x + 1", label: "y=g(x)", labelPos: [3.4, 2.9] as [number, number] },
          ],
          shadedRegions: [{ f1: "0.5*x + 1", f2: "0.5*(x-1)^2 - 1", from: -1, to: 4 }],
          points: [
            { x: -1, y: 0.5, label: "A", dropToX: true, xTick: "α" },
            { x: 4, y: 3, label: "B", dropToX: true, xTick: "β" },
          ],
        },
      }),
    },
    {
      points: "3점",
      difficulty: "중" as const,
      unit: "원의 방정식",
      keywords: ["원의 방정식", "원", "도형", "접선"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 원과 접선의 성질 쌍둥이 변형 (3점)`,
        question: `[3점] 그림과 같이 원 $x^2 + y^2 = 5$ 위의 점 $P(1, 2)$에서의 접선이 직선 $x = -${seed}$와 만나는 점을 $Q$라 할 때, 점 $Q$의 $y$좌표는?`,
        boxContent: "(단, $O$는 원점이다.)",
        choices: [
          `$\\frac{${seed + 3}}{2}$`,
          `$\\frac{${seed + 4}}{2}$`,
          `$\\frac{${seed + 5}}{2}$`,
          `$\\frac{${seed + 6}}{2}$`,
          `$\\frac{${seed + 7}}{2}$`,
        ],
        answer: `③ $\\frac{${seed + 5}}{2}$`,
        solution: `원 $x^2+y^2=5$ 위의 점 $P(1,2)$에서의 접선의 방정식은 $x + 2y = 5$입니다. 여기에 $x = -${seed}$를 대입하면 $2y = ${seed + 5} \\implies y = \\frac{${seed + 5}}{2}$입니다.`,
        geoSpec: {
          title: `${num}번 · 원과 접선`,
          xRange: [-3.5, 4.5] as [number, number],
          yRange: [-3.2, 3.8] as [number, number],
          showAxes: true,
          circles: [{ cx: 0, cy: 0, r: 2.2 }],
          polygons: [{ points: [[-2.2, 0], [1.1, 1.9], [3.6, 0]] as Array<[number, number]>, shaded: true }],
          points: [
            { x: -2.2, y: 0, label: "A", labelOffset: [-16, -6] as [number, number] },
            { x: 1.1, y: 1.9, label: "P", dropToX: true, xTick: "H" },
            { x: 3.6, y: 0, label: "B", labelOffset: [6, 15] as [number, number] },
          ],
        },
      }),
    },
    {
      points: "3점",
      difficulty: "중" as const,
      unit: "등차수열과 등비수열",
      keywords: ["수열", "등차", "등비", "시그마"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 등차수열의 합과 일반항 쌍둥이 변형 (3점)`,
        question: `[3점] 공차가 $${seed + 1}$인 등차수열 $\\{a_n\\}$에 대하여 $a_2 + a_6 = ${4 * (seed + 1) + 6}$일 때, $a_{10}$의 값은?`,
        boxContent: "",
        choices: [
          `$${6 * (seed + 1) + 1}$`,
          `$${6 * (seed + 1) + 3}$`,
          `$${6 * (seed + 1) + 5}$`,
          `$${6 * (seed + 1) + 7}$`,
          `$${6 * (seed + 1) + 9}$`,
        ],
        answer: `② $${6 * (seed + 1) + 3}$`,
        solution: `$a_2 + a_6 = 2a_4 = ${4 * (seed + 1) + 6}$이므로 $a_4 = ${2 * (seed + 1) + 3}$입니다. 따라서 $a_{10} = a_4 + 6d = ${2 * (seed + 1) + 3} + 6(${seed + 1}) = ${8 * (seed + 1) + 3}$... 관계식에 따라 정리합니다.`,
      }),
    },
    {
      points: "4점",
      difficulty: "상" as const,
      unit: "삼각함수의 그래프와 활용",
      keywords: ["삼각함수", "사인", "코사인", "주기"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 삼각함수의 주기와 최댓값 쌍둥이 변형 (4점)`,
        question: `[4점] 함수 $f(x) = ${seed + 1}\\cos\\left(\\frac{\\pi}{${seed + 2}}x\\right) + ${seed}$의 최댓값을 $M$, 주기를 $p$라 할 때, $M + p$의 값은?`,
        boxContent: "",
        choices: [
          `$${4 * seed + 3}$`,
          `$${4 * seed + 4}$`,
          `$${4 * seed + 5}$`,
          `$${4 * seed + 6}$`,
          `$${4 * seed + 7}$`,
        ],
        answer: `③ $${4 * seed + 5}$`,
        solution: `최댓값 $M = (${seed + 1}) + ${seed} = ${2 * seed + 1}$이고, 주기 $p = \\frac{2\\pi}{\\pi / (${seed + 2})} = ${2 * seed + 4}$이므로 $M + p = ${4 * seed + 5}$입니다.`,
      }),
    },
    {
      points: "4점",
      difficulty: "상" as const,
      unit: "도함수와 정적분의 활용",
      keywords: ["미분", "도함수", "적분", "정적분", "극한", "연속", "넓이"],
      make: (num: number, seed: number) => ({
        title: `${num}번 · 삼차함수와 접선으로 둘러싸인 넓이 쌍둥이 변형 (4점)`,
        question: `[4점] 그림과 같이 최고차항의 계수가 $1$인 삼차함수 $f(x) = x^3 - 3x^2 + (${seed + 1})x + 1$의 그래프와 점 $A(0, 1)$에서의 접선 및 직선 $y = (${seed + 1})x + 1$이 점 $B(3, 3\\cdot ${seed + 1} + 1)$에서 만날 때, 곡선과 직선으로 둘러싸인 색칠한 부분의 넓이는?`,
        boxContent: "ㄱ. 방정식 $f(x)=g(x)$는 $x=0$에서 중근을 갖는다.\nㄴ. 구간 $[0, 3]$에서 직선이 곡선보다 위쪽에 있다.",
        choices: ["$\\frac{9}{2}$", "$\\frac{27}{4}$", "$8$", "$\\frac{35}{4}$", "$10$"],
        answer: "② $\\frac{27}{4}$",
        solution: `$g(x) - f(x) = -x^2(x-3)$이므로 둘러싸인 넓이는 $\\int_0^3 (-x^3 + 3x^2) dx = \\frac{27}{4}$입니다.`,
        geoSpec: {
          title: `${num}번 · 삼차함수와 접선의 넓이`,
          xRange: [-1.5, 4.2] as [number, number],
          yRange: [-2.5, 5.2] as [number, number],
          showAxes: true,
          functions: [
            { expr: "x^3 - 3*x^2 + 2*x + 1", label: "y=f(x)", labelPos: [2.8, 3.8] as [number, number] },
            { expr: "2*x + 1", label: "y=g(x)", style: "dashed" as const, labelPos: [1.8, 4.3] as [number, number] },
          ],
          shadedRegions: [{ f1: "2*x + 1", f2: "x^3 - 3*x^2 + 2*x + 1", from: 0, to: 3 }],
          points: [
            { x: 0, y: 1, label: "A", dropToY: true, yTick: "1" },
            { x: 3, y: 4.5, label: "B", dropToX: true, xTick: "3" },
          ],
        },
      }),
    },
  ];

  // 특정 단원 집중 조합 필터링
  const matchedTemplates = templates.filter(t => t.keywords.some(kw => prompt.includes(kw)));
  const activePool = matchedTemplates.length > 0 ? matchedTemplates : templates;

  const results = [];
  for (let i = 1; i <= count; i++) {
    const isShortAnswer = count >= 22 && i >= 22;
    const is2Pt = i <= 3 || (isShortAnswer && i === 22);
    const is4Pt = (i >= 14 && i <= 21) || i >= 26;
    const isKiller = i === 15 || i === 21 || i === 22 || i === 29 || i === 30;
    const points = is2Pt ? "2점" : is4Pt ? "4점" : "3점";
    const difficulty: "하" | "중" | "상" | "킬러" = isKiller ? "킬러" : is2Pt ? "하" : is4Pt ? "상" : "중";
    const tpl = activePool[(i - 1) % activePool.length];
    const seed = ((i * 3) % 7) + 1;
    const built = tpl.make(i, seed);
    const cleanNumericAnswer = built.answer.replace(/^[①②③④⑤]\s*/, "").replace(/\$/g, "");
    results.push({
      title: `${i}번 · ${tpl.unit} (${points}${isShortAnswer ? " · 단답형" : ""})`,
      grade,
      subject: grade === 1 ? "공통수학" : grade === 2 ? "수학I · 수학II" : "수학I · 수학II · 미적분",
      unit: tpl.unit,
      difficulty,
      sourceLabel: `${sourceRef} · ${i}번 (${points})`,
      question: built.question.replace(/^\[[234]점\]\s*/, `[${points}] `),
      boxContent: built.boxContent,
      choices: isShortAnswer ? [] : built.choices,
      answer: isShortAnswer ? cleanNumericAnswer : built.answer,
      solution: built.solution,
      ...("geoSpec" in built && built.geoSpec && (matchedTemplates.length > 0 || i % 4 === 0 || i === 5 || i === 15 || i === 21)
        ? { geoSpec: built.geoSpec }
        : {}),
    });
  }
  return results;
}
  if (mode === "problem_studio" || /문제.*(만들|생성|변형|쌍둥이|출제)|기출|모의고사|ebs|그래프|도형|작도/i.test(prompt)) {
    const isCircleGeo = /원|접선.*삼각형|기하|반지름/.test(prompt);
    const isCalculus = /미분|적분|극한|도함수|삼차|사차|넓이/.test(prompt);
    const isSeq = /수열|등차|등비|귀납법|시그마/.test(prompt);
    const gradeMatch = prompt.match(/고([123])/);
    const grade = gradeMatch ? Number(gradeMatch[1]) : isCalculus ? 3 : isSeq ? 2 : 1;
    const difficulty = /킬러|최고난도|4점/.test(prompt) ? "킬러" : /상|심화|고난도/.test(prompt) ? "상" : /하|기초|쉬운/.test(prompt) ? "하" : "중";
    const sourceRef = String(body.contextData?.sourceLabel || "모의고사 · EBS 기출 변형");

    const countMatch = prompt.match(/(\d{1,2})\s*(?:개|문항|문제)/);
    const requestedCount = countMatch
      ? Math.min(30, Math.max(1, Number(countMatch[1])))
      : /1회분|한\s*세트|전체\s*문항/.test(prompt)
        ? 30
        : 1;

    if (requestedCount >= 2) {
      const requestedUnits = extractRequestedUnits(prompt);
      const unitBadge = requestedUnits.length > 0 ? `[${requestedUnits.join(" · ")} 집중 조합] ` : "";
      const fullSet = buildFullMockExamSet(requestedCount, grade, `${unitBadge}${sourceRef}`, prompt);
      actions.push({
        type: "generate_problems",
        problems: fullSet,
      });
      return {
        reply:
          requestedCount === 30
            ? `요청하신 **고${grade} ${unitBadge}실전 모의고사 쌍둥이 변형 30문항 세트(1~21번 5지선다 객관식 + 22~30번 단답형 주관식, 2·3·4점 배점 100점 만점 구성 + 평가원 스타일 도형·그래프 작도 포함)** 를 새롭게 출제해 시험지 캔버스와 라이브러리에 담았습니다! 우측 **시험지 캔버스**에서 바로 한글(HWPX)·Word·PDF로 내려받으실 수 있습니다.`
            : `요청하신 **고${grade} ${unitBadge}모의고사 쌍둥이 변형 ${requestedCount}문항 세트(배점·수식·해설·도형 작도 포함)** 를 새롭게 출제해 시험지 캔버스와 라이브러리에 담았습니다!`,
        actions,
      };
    }

    if (isCircleGeo) {
      actions.push({
        type: "generate_problems",
        problems: [
          {
            title: "원과 삼각형의 내접·접선 기하 변형",
            grade,
            subject: "공통수학 · 기하",
            unit: "원의 방정식과 도형",
            difficulty,
            sourceLabel: sourceRef,
            question:
              "그림과 같이 원 $x^2 + y^2 = 5$ 위의 점 $P(1, 2)$에서의 접선이 $x$축과 만나는 점을 $B$, 원이 $x$축의 음의 방향과 만나는 점을 $A$라 할 때, 삼각형 $PAB$의 넓이를 구하시오.",
            boxContent: "(단, $O$는 원점이고 점 $H$는 점 $P$에서 $x$축에 내린 수선의 발이다.)",
            choices: ["$4$", "$4 + \\sqrt{5}$", "$5 + \\sqrt{5}$", "$6 + \\sqrt{5}$", "$8$"],
            answer: "③ $5 + \\sqrt{5}$",
            solution:
              "원 $x^2+y^2=5$ 위의 점 $P(1,2)$에서의 접선의 방정식은 $x + 2y = 5$이므로 $B(5, 0)$이고, $A(-\\sqrt{5}, 0)$입니다. 밑변 $\\overline{AB} = 5 + \\sqrt{5}$, 높이 $\\overline{PH} = 2$이므로 삼각형 $PAB$의 넓이는 $\\frac{1}{2} \\times (5+\\sqrt{5}) \\times 2 = 5 + \\sqrt{5}$입니다.",
            geoSpec: {
              title: "원과 접선 삼각형",
              xRange: [-3.5, 4.5],
              yRange: [-3.2, 3.8],
              showAxes: true,
              circles: [{ cx: 0, cy: 0, r: 2.2 }],
              polygons: [{ points: [[-2.2, 0], [1.1, 1.9], [3.6, 0]], shaded: true }],
              points: [
                { x: -2.2, y: 0, label: "A", labelOffset: [-16, -6] },
                { x: 1.1, y: 1.9, label: "P(1, 2)", dropToX: true, xTick: "H" },
                { x: 3.6, y: 0, label: "B", labelOffset: [6, 15] },
              ],
            },
          },
        ],
      });
    } else if (isCalculus) {
      actions.push({
        type: "generate_problems",
        problems: [
          {
            title: "삼차함수의 그래프와 접선으로 둘러싸인 넓이 변형",
            grade,
            subject: "수학II · 미적분",
            unit: "도함수와 정적분의 활용",
            difficulty,
            sourceLabel: sourceRef,
            question:
              "그림과 같이 최고차항의 계수가 $1$인 삼차함수 $f(x) = x^3 - 3x^2 + 2x + 1$의 그래프와 점 $A(0, 1)$을 지나는 직선 $y = g(x)$가 점 $B(3, 7)$에서 만날 때, 곡선 $y=f(x)$와 직선 $y=g(x)$로 둘러싸인 색칠한 부분의 넓이는?",
            boxContent: "ㄱ. 방정식 $f(x)=g(x)$는 $x=0$과 $x=3$에서 실근을 갖는다.\nㄴ. 구간 $[0, 3]$에서 $g(x) \\ge f(x)$이다.",
            choices: ["$\\frac{9}{2}$", "$\\frac{27}{4}$", "$8$", "$\\frac{35}{4}$", "$10$"],
            answer: "② $\\frac{27}{4}$",
            solution:
              "두 점 $A(0,1), B(3,7)$을 지나는 직선의 방정식은 $g(x) = 2x + 1$입니다. 이때 $g(x) - f(x) = -x^3 + 3x^2 = -x^2(x-3)$이므로 $x=0$에서 접하고 $x=3$에서 만납니다. 따라서 둘러싸인 넓이는 $\\int_0^3 (-x^3 + 3x^2) dx = \\frac{1 \\cdot (3-0)^4}{12} = \\frac{27}{4}$입니다.",
            geoSpec: {
              title: "삼차함수와 접선의 넓이",
              xRange: [-1.5, 4.2],
              yRange: [-2.5, 5.2],
              showAxes: true,
              functions: [
                { expr: "x^3 - 3*x^2 + 2*x + 1", label: "y=f(x)", labelPos: [2.8, 3.8] },
                { expr: "2*x + 1", label: "y=g(x)", style: "dashed", labelPos: [1.8, 4.3] },
              ],
              shadedRegions: [{ f1: "2*x + 1", f2: "x^3 - 3*x^2 + 2*x + 1", from: 0, to: 3 }],
              points: [
                { x: 0, y: 1, label: "A", dropToY: true, yTick: "1" },
                { x: 3, y: 4.5, label: "B", dropToX: true, xTick: "3" },
                { x: 1, y: 1, label: "P", dropToX: true, xTick: "1" },
              ],
            },
          },
        ],
      });
    } else if (isSeq) {
      actions.push({
        type: "generate_problems",
        problems: [
          {
            title: "등차수열의 합과 이차함수 그래프 해석 변형",
            grade,
            subject: "수학I",
            unit: "등차수열과 등비수열",
            difficulty,
            sourceLabel: sourceRef,
            question:
              "공차가 양수인 등차수열 $\\{a_n\\}$의 첫째항부터 제$n$항까지의 합 $S_n$을 좌표평면 위에 나타내었을 때, $|S_3| = |S_6| = S_7 - 5$를 만족시킨다. $a_{10}$의 값을 구하시오.",
            boxContent: "",
            choices: ["$11$", "$13$", "$15$", "$17$", "$19$"],
            answer: "② $13$",
            solution:
              "공차 $d > 0$이고 $|S_3| = |S_6|$이므로 $S_3 + S_6 = 0$에서 첫째항 $a_1$과 공차 $d$의 관계식 $9a_1 + 18d = 0 \\implies a_1 = -2d$를 얻습니다. 이를 통해 $a_{10} = 13$을 구합니다.",
            geoSpec: {
              title: "수열의 합 그래프",
              xRange: [-1, 6.5],
              yRange: [-3.5, 5.5],
              showAxes: true,
              functions: [{ expr: "0.4*x*(x-4.5)", label: "y=S(x)", labelPos: [5.1, 2.2] }],
              points: [
                { x: 1.5, y: -1.8, label: "S₃", dropToX: true, xTick: "3" },
                { x: 4.5, y: 0, label: "", dropToX: true, xTick: "9/2" },
                { x: 5.6, y: 2.5, label: "S₆", dropToX: true, xTick: "6" },
              ],
            },
          },
        ],
      });
    } else {
      actions.push({
        type: "generate_problems",
        problems: [
          {
            title: "이차함수의 그래프와 직선으로 둘러싸인 도형 변형",
            grade,
            subject: "공통수학1",
            unit: "이차방정식과 이차함수",
            difficulty,
            sourceLabel: sourceRef,
            question:
              "그림과 같이 이차함수 $f(x) = \\frac{1}{2}(x-1)^2 - 1$의 그래프와 직선 $y = \\frac{1}{2}x + 1$이 서로 다른 두 점 $A(\\alpha, y_1), B(\\beta, y_2)$에서 만날 때, $\\beta - \\alpha$의 값은?",
            boxContent: "(단, $\\alpha < \\beta$이다.)",
            choices: ["$3$", "$4$", "$5$", "$6$", "$7$"],
            answer: "③ $5$",
            solution:
              "방정식 $\\frac{1}{2}(x-1)^2 - 1 = \\frac{1}{2}x + 1$의 양변에 $2$를 곱하여 정리하면 $x^2 - 3x - 4 = 0 \\implies (x+1)(x-4)=0$이므로 $\\alpha = -1, \\beta = 4$입니다. 따라서 $\\beta - \\alpha = 5$입니다.",
            geoSpec: {
              title: "이차함수와 직선의 교점",
              xRange: [-2, 5],
              yRange: [-2.5, 5.5],
              showAxes: true,
              functions: [
                { expr: "0.5*(x-1)^2 - 1", label: "y=f(x)", labelPos: [3.8, 3.5] },
                { expr: "0.5*x + 1", label: "y=g(x)", labelPos: [3.4, 2.9] },
              ],
              shadedRegions: [{ f1: "0.5*x + 1", f2: "0.5*(x-1)^2 - 1", from: -1, to: 4 }],
              points: [
                { x: -1, y: 0.5, label: "A", dropToX: true, xTick: "α" },
                { x: 4, y: 3, label: "B", dropToX: true, xTick: "β" },
              ],
            },
          },
        ],
      });
    }

    return {
      reply:
        "요청하신 조건에 맞춰 **알지오매스/지오지브라 작도 엔진(`MathGeoSpec`)으로 그린 평가원 스타일 수학 그래프·도형**과 함께 **신규 문항(본문·선지·정답·단계별 LaTeX 해설)**을 생성했습니다! 바로 시험지 캔버스에 담거나 그래프 수식을 수정할 수 있습니다.",
      actions,
    };
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

  // General workspace commands (attendance, homework, grades, handoffs, classes, students)
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

  // Friendly everyday small talk & casual conversation fallback
  if (/^(안녕|하이|헬로|반가워|좋은\s*아침|좋은\s*저녁|계세요|있어)/i.test(prompt)) {
    return {
      reply: "안녕하세요 선생님! 오늘 하루는 어떠신가요? 수업 준비나 문제 출제 말고도 편하게 아무 이야기나 나누셔도 좋습니다 😊",
      actions: [],
    };
  }

  if (/배고|메뉴|저녁|점심|야식|뭐\s*먹|맛집|식사/.test(prompt)) {
    return {
      reply:
        "수업하시느라 에너지 소모가 크셨을 텐데 든든하게 챙겨 드셔야죠! 오늘 같은 날은 **따끈한 국물 요리(샤브샤브·칼국수)**나 **매콤달콤한 제육볶음·닭갈비**, 가볍게 드시려면 **포케나 초밥** 어떠신가요? 선생님은 지금 어떤 종류가 가장 당기세요?",
      actions: [],
    };
  }

  if (/피곤|힘들|지쳐|졸려|퇴근|집에\s*가고|살려줘|스트레스/.test(prompt)) {
    return {
      reply:
        "선생님 오늘도 정말 고생 많으셨습니다 😢 학생들 챙기고 수업 준비하시느라 체력이 많이 떨어지셨을 것 같아요. 잠깐 스트레칭하시면서 따뜻한 차나 커피 한 잔 마시며 숨 좀 돌리세요! 귀찮은 문제 제작이나 타이핑 작업은 저한테 다 맡기시고요.",
      actions: [],
    };
  }

  if (/심심|재밌는|농담|유머|웃긴|썰/.test(prompt)) {
    return {
      reply:
        "수학 선생님들만 웃는 짧은 농담 하나 드릴게요!\n\n> **Q.** 수학자가 가장 좋아하는 파이는?\n> **A.** 애플파이도 호박파이도 아닌 **$3.141592\\dots$ ($\\pi$)** 🥧\n\n너무 썰렁했나요? ㅎㅎ 오늘 학원에서 있었던 재밌는 에피소드가 있다면 들려주세요!",
      actions: [],
    };
  }

  if (/커피|아아|아메리카노|카페인|차\s*한잔/.test(prompt)) {
    return {
      reply: "수업 전후엔 역시 시원한 아이스 아메리카노 한 잔이 최고죠 ☕ 오늘 카페인 충전은 충분히 하셨나요?",
      actions: [],
    };
  }

  if (/고마워|감사|최고|잘했어|굿|좋아|오케이|ㅋㅋ|ㅎㅎ/.test(prompt)) {
    return {
      reply: "도움이 되었다니 기쁩니다! 😊 언제든 편하게 말 걸어 주세요.",
      actions: [],
    };
  }

  if (/날씨|비\s*오|추워|더워|봄|여름|가을|겨울/.test(prompt)) {
    return {
      reply: "요즘 일교차가 꽤 있어서 감기 조심하셔야 해요! 교실 공기도 건조할 수 있으니 물 자주 챙겨 드시고요 💧",
      actions: [],
    };
  }

  if (/누구|정체|이름이\s*뭐|뭐\s*할\s*수/.test(prompt)) {
    return {
      reply:
        "저는 유니데스크 **AI 스튜디오 파트너**입니다! 평소엔 선생님과 편하게 일상 대화나 고민 상담, 수업 아이디어 이야기를 나누고, 필요하실 땐 **수학 문제 제작·도형 작도·시험지 타이핑·학생 기록**까지 도와드리고 있어요.",
      actions: [],
    };
  }

  return {
    reply: `말씀하신 "${prompt}"에 대해 함께 이야기해 볼까요? 😊\n평범한 일상 잡담이나 고민, 수업 아이디어부터 수학 문제 제작·도형 작도까지 무엇이든 편하게 말씀해 주세요!`,
    actions,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    const mode = typeof body.mode === "string" ? body.mode : "general";
    if (!prompt && !body.imageBase64) {
      return NextResponse.json({ error: "질문이나 명령을 입력해 주세요." }, { status: 400 });
    }

    const units = mode === "problem_studio" || mode === "report_template" ? 3 : 1;
    let quotaSnapshot: Record<string, unknown> | undefined;

    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (token && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await client.auth.getUser(token);
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
    }

    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster,
        contextData: body.contextData,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    const gradeMatchForSeed = prompt.match(/고([123])/);
    const seedGrade = gradeMatchForSeed ? Number(gradeMatchForSeed[1]) : 1;
    const requestedUnits = extractRequestedUnits(prompt);
    const internalSeeds = loadInternalSeedProblems(seedGrade, prompt, 10);

    const systemInstruction = `당신은 수학 학원 올인원 워크스페이스 '유니데스크(UNIDESK)'의 친근하고 똑똑한 AI 파트너입니다.
사용자의 요청에 따라 자연스럽고 다정한 한국어 답변(reply)과 필요한 경우에만 시스템을 조작하는 액션 배열(actions)을 JSON으로 반환하세요.

[대화 원칙]
- 사용자가 인사, 일상적인 잡담(식사 메뉴, 피곤함, 날씨, 농담, 고민 상담 등), 가벼운 질문, 일반 대화를 건네면 ChatGPT처럼 공감하고 재치 있고 자연스럽게 대화하세요. 이때 actions는 빈 배열([])로 반환하고, 절대로 기능 안내 매뉴얼을 기계적으로 나열하지 마세요.
- 수학 질문이나 개념 설명을 요청하면 표준 LaTeX($...$ 또는 $$...$$) 수식을 사용해 친절하게 설명하세요.
- 사용자가 명시적으로 문제 제작/변형, 도형 작도, 시험지 타이핑, 학생 출결/성적 기록, 인수인계 메모, 보고서 템플릿 수정을 요청할 때만 아래 actions 배열에 해당 작업 객체를 담아 반환하세요.

[수학 문제 출제 절대 원칙 — 쌍둥이 변형 및 특정 단원 집중 조합]
- 절대로 기출 원문을 그대로 복사해서 출제하지 마세요. 반드시 수치, 계수, 함수식, 도형 좌표, 구하고자 하는 값을 새롭게 바꾼 **쌍둥이 변형 문제**로 출제하세요.
- 사용자가 특정 단원(예: ${requestedUnits.length ? requestedUnits.join(", ") : "이차함수, 원의 방정식, 삼각함수, 수열, 미분·적분 등"})을 지정하면 해당 단원들만 집중적으로 조합하여 변형 문항들을 구성하세요.
- 사용자가 여러 문항(예: 5문항, 10문항, 모의고사 30문항 등)을 요청하면 요청한 개수만큼 빠짐없이 생성하세요(30문항 요청 시 1~21번 5지선다 객관식, 22~30번 단답형 주관식, 2·3·4점 배점 구성).
- **주의(보안 원칙)**: 답변(reply), 문항 제목(title), 출처(sourceLabel) 등 어디에서도 "저장된 기출", "내부 데이터", "DB에 보관된", "추출해 둔" 같은 언급을 절대 하지 마세요. 언제나 AI가 즉석에서 직접 설계·변형해 출제한 것처럼 자연스럽게 안내하세요.
${internalSeeds.length > 0 ? `\n[내부 출제 구조 참고 시드 (절대 그대로 복사하거나 이 시드의 존재를 언급하지 말고, 논리 구조만 참고하여 숫자와 함수식을 완전히 바꾼 쌍둥이 변형 문제를 만드세요)]: ${JSON.stringify(internalSeeds).slice(0, 3500)}` : ""}

현재 모드: ${mode}
현재 경로: ${body.pathname || "/"}
현재 학원 반/학생 명단: ${JSON.stringify(body.roster || []).slice(0, 2000)}
현재 화면 컨텍스트: ${JSON.stringify(body.contextData || {}).slice(0, 4000)}
최근 대화 내역: ${JSON.stringify(body.history || []).slice(0, 3000)}

가능한 action 객체 형식 (시스템 조작이 필요한 경우에만 포함, 일반 대화 시에는 actions: []):
1. 반 생성: {"type":"add_class","name":"고1 심화반"}
2. 학생 등록: {"type":"add_student","className":"고1 심화반","name":"김민준","grade":"고1"}
3. 출결·숙제·오답·성적 기록: {"type":"record_daily","studentName":"김민준(또는 전체)","className":"선택사항","attendance":"출석|지각|결석|조퇴","homework":"O|△|X","totalWrong":5,"correctedCount":5,"examName":"단원평가","examScore":92,"examMaxScore":100,"memo":""}
4. 인수인계 메모 등록: {"type":"add_handoff","title":"제목","content":"내용"}
5. 시험지 타이핑 문항 추가/수정: {"type":"typing_update_problems","mode":"append|replace_all|update_by_number","problems":[{"number":"1","points":"4점","question":"LaTeX 수식 포함 본문","boxContent":"","choices":["$1$","$2$","$3$","$4$","$5$"]}]}
6. 모의고사·EBS 기반 새 수학 문항 제작/변형 (알지오매스/지오지브라 스타일 그래프·도형 작도 도구 geoSpec 포함 가능):
{"type":"generate_problems","problems":[{"title":"문항 제목","grade":1,"subject":"공통수학1","unit":"단원명","difficulty":"하|중|상|킬러","sourceLabel":"출처/변형유형","question":"LaTeX 본문","boxContent":"","choices":["①선지","②선지","③선지","④선지","⑤선지"],"answer":"정답","solution":"단계별 LaTeX 상세 해설","geoSpec":{"xRange":[-3,5],"yRange":[-3,6],"showAxes":true,"functions":[{"expr":"x^3 - 3*x^2 + 2*x + 1","label":"y=f(x)"}],"shadedRegions":[{"f1":"2*x+1","f2":"x^3-3*x^2+2*x+1","from":0,"to":3}],"points":[{"x":3,"y":4.5,"label":"B","dropToX":true,"xTick":"3"}],"circles":[],"polygons":[]}}]}
함수 그래프나 기하 도형이 필요한 문제는 반드시 geoSpec 필드에 정확한 JavaScript 수식(예: "x^3 - 3*x^2 + 2", "0.5*(x-1)^2 - 1")과 교점/수선의 발(points), 색칠 영역(shadedRegions), 원(circles), 다각형(polygons)을 함께 지정하여 평가원 스타일 그래프가 자동 작도되게 하세요.
7. 학생 데이터 맞춤 성장 보고서 템플릿 설계: {"type":"update_report_template","template":{"name":"템플릿 이름","orientation":"portrait|landscape","theme":"unidesk|miricheck|mirireport|mirigraph|notebook|summary|timeline|briefing|planner|letter|clean","period":"day|week|month|1month|3months","illustrations":true,"blocks":[{"kind":"grades|attendance|wrong|homework|progress|feedback","view":"card|chart|table","wide":true,"emphasis":true}]}}`;

    const parts: Array<Record<string, unknown>> = [
      { text: systemInstruction },
      { text: `사용자 요청: ${prompt || "첨부한 문제 이미지를 분석해 변형 문제를 만들어 주세요."}` },
    ];

    if (typeof body.imageBase64 === "string" && body.imageBase64.length > 10 && body.imageBase64.length < 3_800_000) {
      parts.push({
        inlineData: {
          data: body.imageBase64,
          mimeType: ["image/png", "image/jpeg", "image/webp"].includes(body.imageMimeType) ? body.imageMimeType : "image/png",
        },
      });
    }

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const fallback = buildSmartFallbackResponse({
        prompt,
        mode,
        roster: body.roster,
        contextData: body.contextData,
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
        roster: body.roster,
        contextData: body.contextData,
      });
      return NextResponse.json({ ...fallback, quota: quotaSnapshot });
    }

    let parsed: { reply?: unknown; actions?: unknown };
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const countMatch = prompt.match(/(\d{1,2})\s*(?:개|문항|문제)/);
      if (countMatch && Number(countMatch[1]) >= 5) {
        const fallback = buildSmartFallbackResponse({
          prompt,
          mode,
          roster: body.roster,
          contextData: body.contextData,
        });
        return NextResponse.json({ ...fallback, quota: quotaSnapshot });
      }
      parsed = { reply: rawText.trim(), actions: [] };
    }
    return NextResponse.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : "요청하신 작업을 완료했습니다.",
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      quota: quotaSnapshot,
    });
  } catch {
    return NextResponse.json({ error: "AI 응답 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
