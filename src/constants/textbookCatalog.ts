import type { ProgressUnit, TextbookCategory } from '../types/progress';

export interface TextbookPresetUnit {
  group: string;
  name: string;
  start_page: number;
  end_page: number;
  start_problem?: number;
  end_problem?: number;
  problem_count: number;
  type_count?: number;
  step_detail?: string;
}

export interface TextbookPreset {
  id: string;
  series: string;
  publisher: string;
  category: TextbookCategory;
  gradeGroup: '초등' | '중등' | '고등';
  title: string;
  curriculum: string;
  course: string;
  total_pages: number;
  description: string;
  units: TextbookPresetUnit[];
}

function buildSequentialUnits(
  raw: Array<{
    group: string;
    name: string;
    pages: [number, number];
    problems: number;
    types?: number;
    step?: string;
  }>,
  continuousNumbering = true
): TextbookPresetUnit[] {
  let cursor = 1;
  return raw.map(item => {
    const start_problem = continuousNumbering ? cursor : 1;
    const end_problem = continuousNumbering ? cursor + item.problems - 1 : item.problems;
    cursor += item.problems;
    return {
      group: item.group,
      name: item.name,
      start_page: item.pages[0],
      end_page: item.pages[1],
      start_problem,
      end_problem,
      problem_count: item.problems,
      ...(item.types ? { type_count: item.types } : {}),
      ...(item.step ? { step_detail: item.step } : {}),
    };
  });
}

export const CATALOG_COURSES_BY_GRADE: Record<'초등' | '중등' | '고등', string[]> = {
  초등: ['초1-1', '초1-2', '초2-1', '초2-2', '초3-1', '초3-2', '초4-1', '초4-2', '초5-1', '초5-2', '초6-1', '초6-2'],
  중등: ['중1 1학기', '중1 2학기', '중2 1학기', '중2 2학기', '중3 1학기', '중3 2학기'],
  고등: ['공통수학1', '공통수학2', '대수', '미적분I', '확률과 통계', '미적분II', '기하'],
};

const ELEM_ALL = CATALOG_COURSES_BY_GRADE.초등;
const ELEM_3_6 = ['초3-1', '초3-2', '초4-1', '초4-2', '초5-1', '초5-2', '초6-1', '초6-2'];
const MID_ALL = CATALOG_COURSES_BY_GRADE.중등;
const HIGH_G1 = ['공통수학1', '공통수학2'];
const HIGH_G2 = ['대수', '미적분I', '확률과 통계'];
const HIGH_CORE = ['공통수학1', '공통수학2', '대수', '미적분I', '확률과 통계'];
const HIGH_ALL = CATALOG_COURSES_BY_GRADE.고등;

export const COURSE_SHORT_LABEL: Record<string, string> = {
  '초1-1': '초1-1',
  '초1-2': '초1-2',
  '초2-1': '초2-1',
  '초2-2': '초2-2',
  '초3-1': '초3-1',
  '초3-2': '초3-2',
  '초4-1': '초4-1',
  '초4-2': '초4-2',
  '초5-1': '초5-1',
  '초5-2': '초5-2',
  '초6-1': '초6-1',
  '초6-2': '초6-2',
  '중1 1학기': '중1-1',
  '중1 2학기': '중1-2',
  '중2 1학기': '중2-1',
  '중2 2학기': '중2-2',
  '중3 1학기': '중3-1',
  '중3 2학기': '중3-2',
  '공통수학1': '공통수학1',
  '공통수학2': '공통수학2',
  '대수': '대수',
  '미적분I': '미적분I',
  '확률과 통계': '확률과 통계',
  '미적분II': '미적분II',
  '기하': '기하',
};

function getGradeGroupForCourse(course: string): '초등' | '중등' | '고등' {
  if (course.startsWith('초')) return '초등';
  if (course.startsWith('중')) return '중등';
  return '고등';
}

const COURSE_UNIT_BLUEPRINTS: Record<string, Array<[string, string]>> = {
  '초1-1': [
    ['수와 연산', '1. 9까지의 수'],
    ['도형과 측정', '2. 여러 가지 모양'],
    ['수와 연산', '3. 덧셈과 뺄셈'],
    ['도형과 측정', '4. 비교하기'],
    ['수와 연산', '5. 50까지의 수'],
  ],
  '초1-2': [
    ['수와 연산', '1. 100까지의 수'],
    ['수와 연산', '2. 덧셈과 뺄셈(1)'],
    ['도형과 측정', '3. 모양과 시각'],
    ['수와 연산', '4. 덧셈과 뺄셈(2)'],
    ['변화와 관계', '5. 규칙 찾기'],
    ['수와 연산', '6. 덧셈과 뺄셈(3)'],
  ],
  '초2-1': [
    ['수와 연산', '1. 세 자리 수'],
    ['도형과 측정', '2. 여러 가지 도형'],
    ['수와 연산', '3. 덧셈과 뺄셈'],
    ['도형과 측정', '4. 길이 재기'],
    ['자료와 가능성', '5. 분류하기'],
    ['수와 연산', '6. 곱셈'],
  ],
  '초2-2': [
    ['수와 연산', '1. 네 자리 수'],
    ['수와 연산', '2. 곱셈구구'],
    ['도형과 측정', '3. 길이 재기'],
    ['도형과 측정', '4. 시각과 시간'],
    ['자료와 가능성', '5. 표와 그래프'],
    ['변화와 관계', '6. 규칙 찾기'],
  ],
  '초3-1': [
    ['수와 연산', '1. 덧셈과 뺄셈'],
    ['도형과 측정', '2. 평면도형'],
    ['수와 연산', '3. 나눗셈'],
    ['수와 연산', '4. 곱셈'],
    ['도형과 측정', '5. 길이와 시간'],
    ['수와 연산', '6. 분수와 소수'],
  ],
  '초3-2': [
    ['수와 연산', '1. 곱셈'],
    ['수와 연산', '2. 나눗셈'],
    ['도형과 측정', '3. 원'],
    ['수와 연산', '4. 분수'],
    ['도형과 측정', '5. 들이와 무게'],
    ['자료와 가능성', '6. 그림그래프'],
  ],
  '초4-1': [
    ['수와 연산', '1. 큰 수'],
    ['도형과 측정', '2. 각도'],
    ['수와 연산', '3. 곱셈과 나눗셈'],
    ['도형과 측정', '4. 평면도형의 이동'],
    ['자료와 가능성', '5. 막대그래프'],
    ['변화와 관계', '6. 규칙 찾기'],
  ],
  '초4-2': [
    ['수와 연산', '1. 분수의 덧셈과 뺄셈'],
    ['도형과 측정', '2. 삼각형'],
    ['수와 연산', '3. 소수의 덧셈과 뺄셈'],
    ['도형과 측정', '4. 사각형'],
    ['자료와 가능성', '5. 꺾은선그래프'],
    ['도형과 측정', '6. 다각형'],
  ],
  '초5-1': [
    ['수와 연산', '1. 자연수의 혼합 계산'],
    ['수와 연산', '2. 약수와 배수'],
    ['변화와 관계', '3. 규칙과 대응'],
    ['수와 연산', '4. 약분과 통분'],
    ['수와 연산', '5. 분수의 덧셈과 뺄셈'],
    ['도형과 측정', '6. 다각형의 둘레와 넓이'],
  ],
  '초5-2': [
    ['수와 연산', '1. 수의 범위와 어림하기'],
    ['수와 연산', '2. 분수의 곱셈'],
    ['도형과 측정', '3. 합동과 대칭'],
    ['수와 연산', '4. 소수의 곱셈'],
    ['도형과 측정', '5. 직육면체'],
    ['자료와 가능성', '6. 평균과 가능성'],
  ],
  '초6-1': [
    ['수와 연산', '1. 분수의 나눗셈'],
    ['도형과 측정', '2. 각기둥과 각뿔'],
    ['수와 연산', '3. 소수의 나눗셈'],
    ['변화와 관계', '4. 비와 비율'],
    ['자료와 가능성', '5. 여러 가지 그래프'],
    ['도형과 측정', '6. 직육면체의 겉넓이와 부피'],
  ],
  '초6-2': [
    ['수와 연산', '1. 분수의 나눗셈'],
    ['수와 연산', '2. 소수의 나눗셈'],
    ['도형과 측정', '3. 공간과 입체'],
    ['변화와 관계', '4. 비례식과 비례배분'],
    ['도형과 측정', '5. 원의 넓이'],
    ['도형과 측정', '6. 원기둥, 원뿔, 구'],
  ],
  '중1 1학기': [
    ['I. 소인수분해', '01. 소인수분해'],
    ['I. 소인수분해', '02. 최대공약수와 최소공배수'],
    ['II. 정수와 유리수', '03. 정수와 유리수'],
    ['II. 정수와 유리수', '04. 정수와 유리수의 덧셈과 뺄셈'],
    ['II. 정수와 유리수', '05. 정수와 유리수의 곱셈과 나눗셈'],
    ['III. 문자와 식', '06. 문자의 사용과 식의 계산'],
    ['III. 문자와 식', '07. 일차방정식의 풀이'],
    ['III. 문자와 식', '08. 일차방정식의 활용'],
    ['IV. 좌표평면과 그래프', '09. 좌표평면과 그래프'],
    ['IV. 좌표평면과 그래프', '10. 정비례와 반비례'],
  ],
  '중1 2학기': [
    ['I. 기본 도형', '01. 기본 도형'],
    ['I. 기본 도형', '02. 위치 관계'],
    ['I. 기본 도형', '03. 평행선의 성질'],
    ['I. 기본 도형', '04. 작도와 합동'],
    ['II. 평면도형', '05. 다각형'],
    ['II. 평면도형', '06. 원과 부채꼴'],
    ['III. 입체도형', '07. 다면체와 회전체'],
    ['III. 입체도형', '08. 입체도형의 겉넓이와 부피'],
    ['IV. 통계', '09. 도수분포표와 상대도수'],
  ],
  '중2 1학기': [
    ['I. 수와 식의 계산', '01. 유리수와 순환소수'],
    ['I. 수와 식의 계산', '02. 단항식의 계산'],
    ['I. 수와 식의 계산', '03. 다항식의 계산'],
    ['II. 부등식과 연립방정식', '04. 일차부등식'],
    ['II. 부등식과 연립방정식', '05. 일차부등식의 활용'],
    ['II. 부등식과 연립방정식', '06. 연립일차방정식의 풀이'],
    ['II. 부등식과 연립방정식', '07. 연립일차방정식의 활용'],
    ['III. 일차함수', '08. 일차함수와 그 그래프'],
    ['III. 일차함수', '09. 일차함수와 일차방정식의 관계'],
  ],
  '중2 2학기': [
    ['I. 삼각형의 성질', '01. 이등변삼각형과 직각삼각형'],
    ['I. 삼각형의 성질', '02. 삼각형의 외심과 내심'],
    ['II. 사각형의 성질', '03. 평행사변형'],
    ['II. 사각형의 성질', '04. 여러 가지 사각형'],
    ['III. 도형의 닮음과 피타고라스 정리', '05. 도형의 닮음'],
    ['III. 도형의 닮음과 피타고라스 정리', '06. 평행선과 선분의 길이의 비'],
    ['III. 도형의 닮음과 피타고라스 정리', '07. 삼각형의 무게중심과 닮음의 활용'],
    ['III. 도형의 닮음과 피타고라스 정리', '08. 피타고라스 정리'],
    ['IV. 확률', '09. 경우의 수'],
    ['IV. 확률', '10. 확률의 뜻과 성질'],
  ],
  '중3 1학기': [
    ['I. 실수와 그 연산', '01. 제곱근의 뜻과 성질'],
    ['I. 실수와 그 연산', '02. 무리수와 실수'],
    ['I. 실수와 그 연산', '03. 근호를 포함한 식의 계산'],
    ['II. 다항식의 곱셈과 인수분해', '04. 다항식의 곱셈'],
    ['II. 다항식의 곱셈과 인수분해', '05. 다항식의 인수분해'],
    ['III. 이차방정식', '06. 이차방정식의 풀이'],
    ['III. 이차방정식', '07. 이차방정식의 활용'],
    ['IV. 이차함수', '08. 이차함수와 그 그래프'],
    ['IV. 이차함수', '09. 이차함수 y=ax²+bx+c의 그래프'],
  ],
  '중3 2학기': [
    ['I. 삼각비', '01. 삼각비'],
    ['I. 삼각비', '02. 삼각비의 활용'],
    ['II. 원의 성질', '03. 원과 직선'],
    ['II. 원의 성질', '04. 원주각'],
    ['II. 원의 성질', '05. 원주각의 활용'],
    ['III. 통계', '06. 대푯값과 산포도'],
    ['III. 통계', '07. 상자그림과 상관관계'],
  ],
  '공통수학1': [
    ['I. 다항식', '01. 다항식의 연산'],
    ['I. 다항식', '02. 항등식과 나머지정리'],
    ['I. 다항식', '03. 인수분해'],
    ['II. 방정식과 부등식', '04. 복소수'],
    ['II. 방정식과 부등식', '05. 이차방정식'],
    ['II. 방정식과 부등식', '06. 이차방정식과 이차함수'],
    ['II. 방정식과 부등식', '07. 여러 가지 방정식'],
    ['II. 방정식과 부등식', '08. 여러 가지 부등식'],
    ['III. 경우의 수', '09. 경우의 수와 순열'],
    ['III. 경우의 수', '10. 조합'],
    ['IV. 행렬', '11. 행렬과 그 연산'],
  ],
  '공통수학2': [
    ['I. 도형의 방정식', '01. 평면좌표'],
    ['I. 도형의 방정식', '02. 직선의 방정식'],
    ['I. 도형의 방정식', '03. 원의 방정식'],
    ['I. 도형의 방정식', '04. 도형의 이동'],
    ['II. 집합과 명제', '05. 집합의 뜻과 포함 관계'],
    ['II. 집합과 명제', '06. 집합의 연산'],
    ['II. 집합과 명제', '07. 명제와 절대부등식'],
    ['III. 함수와 그래프', '08. 함수'],
    ['III. 함수와 그래프', '09. 유리식과 유리함수'],
    ['III. 함수와 그래프', '10. 무리식과 무리함수'],
  ],
  '대수': [
    ['I. 지수함수와 로그함수', '01. 지수'],
    ['I. 지수함수와 로그함수', '02. 로그'],
    ['I. 지수함수와 로그함수', '03. 지수함수'],
    ['I. 지수함수와 로그함수', '04. 로그함수'],
    ['II. 삼각함수', '05. 삼각함수의 뜻과 성질'],
    ['II. 삼각함수', '06. 삼각함수의 그래프'],
    ['II. 삼각함수', '07. 사인법칙과 코사인법칙'],
    ['III. 수열', '08. 등차수열과 등비수열'],
    ['III. 수열', '09. 수열의 합'],
    ['III. 수열', '10. 수학적 귀납법'],
  ],
  '미적분I': [
    ['I. 함수의 극한과 연속', '01. 함수의 극한'],
    ['I. 함수의 극한과 연속', '02. 함수의 연속'],
    ['II. 미분', '03. 미분계수와 도함수'],
    ['II. 미분', '04. 도함수의 활용 (1) - 접선과 평균값 정리'],
    ['II. 미분', '05. 도함수의 활용 (2) - 극대와 극소'],
    ['II. 미분', '06. 도함수의 활용 (3) - 방정식·부등식·속도'],
    ['III. 적분', '07. 부정적분과 정적분'],
    ['III. 적분', '08. 정적분의 활용'],
  ],
  '확률과 통계': [
    ['I. 경우의 수', '01. 원순열과 중복순열'],
    ['I. 경우의 수', '02. 중복조합과 이항정리'],
    ['II. 확률', '03. 확률의 뜻과 덧셈정리'],
    ['II. 확률', '04. 조건부확률과 독립시행'],
    ['III. 통계', '05. 이산확률변수와 이항분포'],
    ['III. 통계', '06. 연속확률변수와 정규분포'],
    ['III. 통계', '07. 통계적 추정'],
  ],
  '미적분II': [
    ['I. 수열의 극한', '01. 수열의 극한'],
    ['I. 수열의 극한', '02. 급수'],
    ['II. 미분법', '03. 지수·로그·삼각함수의 미분'],
    ['II. 미분법', '04. 여러 가지 미분법'],
    ['II. 미분법', '05. 도함수의 활용'],
    ['III. 적분법', '06. 여러 가지 함수의 적분법'],
    ['III. 적분법', '07. 정적분의 활용'],
  ],
  '기하': [
    ['I. 이차곡선', '01. 포물선, 타원, 쌍곡선'],
    ['I. 이차곡선', '02. 이차곡선과 직선'],
    ['II. 벡터', '03. 벡터의 연산과 내적'],
    ['II. 벡터', '04. 직선과 원의 벡터방정식'],
    ['III. 공간도형과 공간좌표', '05. 공간도형과 정사영'],
    ['III. 공간도형과 공간좌표', '06. 공간좌표와 구의 방정식'],
  ],
};

const CATEGORY_PROFILE: Record<
  TextbookCategory,
  { pagesPerUnit: number; probsPerUnit: number; typesPerUnit: number; continuous: boolean; step: string }
> = {
  '교과서': { pagesPerUnit: 24, probsPerUnit: 46, typesPerUnit: 0, continuous: false, step: '준비학습 · 생각열기 · 예제/문제 · 중단원/대단원 마무리' },
  '개념서': { pagesPerUnit: 24, probsPerUnit: 78, typesPerUnit: 12, continuous: false, step: '개념 정리 · 필수예제 · 확인문제 · 단원 연습문제' },
  '유형서': { pagesPerUnit: 20, probsPerUnit: 126, typesPerUnit: 17, continuous: true, step: '기본 다지기 · 필수 유형 익히기 · 만점 도전 문제' },
  '심화서': { pagesPerUnit: 16, probsPerUnit: 68, typesPerUnit: 10, continuous: false, step: '심화 개념 · 고난도 대표유형 · 최고수준/경시 문제' },
  '기출·모의': { pagesPerUnit: 26, probsPerUnit: 142, typesPerUnit: 19, continuous: true, step: '핵심 기출 유형 · 1등급 고난도 기출 · 실전 모의고사' },
  '연산·워크북': { pagesPerUnit: 14, probsPerUnit: 92, typesPerUnit: 12, continuous: true, step: '기초 연산/개념 드릴 · 반복 유형 훈련 · 단원 성취도 평가' },
  '연산서': { pagesPerUnit: 14, probsPerUnit: 92, typesPerUnit: 12, continuous: true, step: '기초 연산 드릴 · 반복 학습' },
  '기타': { pagesPerUnit: 18, probsPerUnit: 80, typesPerUnit: 10, continuous: false, step: '단원별 핵심 학습' },
};

const SERIES_DENSITY_OVERRIDE: Record<string, { pagesPerUnit: number; probsPerUnit: number; typesPerUnit: number; continuous: boolean }> = {
  '마플시너지': { pagesPerUnit: 36, probsPerUnit: 182, typesPerUnit: 22, continuous: true },
  '마플': { pagesPerUnit: 38, probsPerUnit: 96, typesPerUnit: 14, continuous: false },
  '쎈': { pagesPerUnit: 21, probsPerUnit: 132, typesPerUnit: 17, continuous: true },
  '라이트쎈': { pagesPerUnit: 19, probsPerUnit: 112, typesPerUnit: 15, continuous: true },
  '베이직쎈': { pagesPerUnit: 17, probsPerUnit: 98, typesPerUnit: 13, continuous: true },
  '쎈B': { pagesPerUnit: 16, probsPerUnit: 104, typesPerUnit: 16, continuous: true },
  '개념원리': { pagesPerUnit: 28, probsPerUnit: 74, typesPerUnit: 11, continuous: false },
  'RPM': { pagesPerUnit: 20, probsPerUnit: 118, typesPerUnit: 16, continuous: true },
  '일품': { pagesPerUnit: 16, probsPerUnit: 68, typesPerUnit: 0, continuous: false },
  '블랙라벨': { pagesPerUnit: 14, probsPerUnit: 54, typesPerUnit: 0, continuous: false },
  '고쟁이': { pagesPerUnit: 24, probsPerUnit: 116, typesPerUnit: 15, continuous: true },
  '자이스토리': { pagesPerUnit: 30, probsPerUnit: 156, typesPerUnit: 20, continuous: true },
};

function generateUnitsForCourse(
  course: string,
  category: TextbookCategory,
  series: string,
  stepOverride?: string
): { units: TextbookPresetUnit[]; total_pages: number; total_problems: number; total_types: number } {
  const blueprint = COURSE_UNIT_BLUEPRINTS[course];
  if (!blueprint) {
    throw new Error(`Unknown course blueprint: ${course}`);
  }
  const baseProfile = CATEGORY_PROFILE[category] ?? CATEGORY_PROFILE['유형서'];
  const seriesOverride = SERIES_DENSITY_OVERRIDE[series];
  const pagesPerUnit = seriesOverride?.pagesPerUnit ?? baseProfile.pagesPerUnit;
  const probsPerUnit = seriesOverride?.probsPerUnit ?? baseProfile.probsPerUnit;
  const typesPerUnit = seriesOverride?.typesPerUnit ?? baseProfile.typesPerUnit;
  const continuous = seriesOverride?.continuous ?? baseProfile.continuous;
  const step = stepOverride ?? baseProfile.step;

  let pageCursor = 8;
  const raw = blueprint.map(([group, name], idx) => {
    const variance = idx % 3 === 0 ? 2 : idx % 3 === 1 ? -2 : 0;
    const span = Math.max(10, pagesPerUnit + variance);
    const startP = pageCursor;
    const endP = startP + span - 1;
    pageCursor = endP + 1;
    const problems = Math.max(24, probsPerUnit + variance * 3);
    const types = typesPerUnit > 0 ? Math.max(6, typesPerUnit + (idx % 2 === 0 ? 1 : -1)) : undefined;
    return {
      group,
      name,
      pages: [startP, endP] as [number, number],
      problems,
      ...(types ? { types } : {}),
      step,
    };
  });

  const units = buildSequentialUnits(raw, continuous);
  const total_pages = units.at(-1)?.end_page ?? 160;
  const total_problems = units.reduce((s, u) => s + u.problem_count, 0);
  const total_types = units.reduce((s, u) => s + (u.type_count ?? 0), 0);
  return { units, total_pages, total_problems, total_types };
}

type MultiCourseBookSpec = [
  idPrefix: string,
  baseTitle: string,
  series: string,
  publisher: string,
  category: TextbookCategory,
  courses: string[],
  step?: string,
];

const BOOK_SERIES_SPECS: MultiCourseBookSpec[] = [
  // 1. 기출·모의 / 자이스토리 / 올림포스 기출 / 1등급 만들기
  ['1grade-make-22', '1등급 만들기(22개정)', '1등급 만들기', '미래엔', '기출·모의', [...HIGH_ALL], '핵심개념 · 필수기출 · 1등급 고난도 기출 · 서술형'],
  ['ilgrade-make-kr-22', '일등급 만들기(22개정)', '1등급 만들기', '미래엔', '기출·모의', [...HIGH_ALL], '출제빈도순 핵심 기출 · 1등급 킬러문항 · 실전 대비'],
  ['xistory-2025-22', '2025 자이스토리(22개정)', '자이스토리', '수경출판사', '기출·모의', [...HIGH_G1], '개념·유형 기출 · 1등급 마스터 · 경찰대·삼사 기출'],
  ['xistory-2026-h2-22', '2026 고2 자이스토리(22개정)', '자이스토리', '수경출판사', '기출·모의', [...HIGH_G2], '학평·수능 유형별 기출 · 1등급 고난도 · 실전 모의고사'],
  ['xistory-2026-22', '2026 자이스토리(22개정)', '자이스토리', '수경출판사', '기출·모의', [...MID_ALL, ...HIGH_ALL], '최신 내신·학평 기출 유형 · 1등급 마스터 · 동형 모의'],
  ['xistory-general-22', '자이스토리(22개정)', '자이스토리', '수경출판사', '기출·모의', [...MID_ALL, ...HIGH_ALL], '유형별 기출 분석 · 서술형 기출 · 1등급 마스터'],
  ['ebs-olympos-gichul-2026', '2026 EBS 올림포스 기출문제집(22개정)', 'EBS 올림포스', 'EBS', '기출·모의', [...HIGH_CORE], '전국연합 학력평가 기출 · 유형별 연습 · 1등급 도전'],

  // 2. 해결의 법칙 시리즈 (천재교육)
  ['law-concept-22', '개념 해결의 법칙(22개정)', '해결의 법칙', '천재교육', '개념서', [...ELEM_ALL, ...MID_ALL, ...HIGH_CORE], '개념 파헤치기 · 기본 문제 · 쌍둥이 문제 · 단원 마무리'],
  ['law-type-22', '유형 해결의 법칙(22개정)', '해결의 법칙', '천재교육', '유형서', [...ELEM_ALL, ...MID_ALL, ...HIGH_CORE], '핵심 개념 · 필수 유형 탐구 · 레벨 UP · 단원 평가'],
  ['law-app-22', '응용 해결의 법칙(22개정)', '해결의 법칙', '천재교육', '심화서', [...ELEM_ALL], '메타인지 개념 · 응용 유형 · 심화 대표 문제 · 실력 평가'],

  // 3. 개념+유형 시리즈 (비상교육)
  ['visang-cu-common-22', '개념+유형 개념편(공통, 22개정)', '개념+유형', '비상교육', '개념서', [...HIGH_G1], '개념 정리 · 필수 예제 · 유제 · 단원 마무리'],
  ['visang-cu-concept-22', '개념+유형 개념편(22개정)', '개념+유형', '비상교육', '개념서', [...MID_ALL, ...HIGH_ALL], '개념 쏙쏙 · 필수 문제 · 확인 문제 · 단원 다지기'],
  ['visang-cu-type-22', '개념+유형 유형편(22개정)', '개념+유형', '비상교육', '유형서', [...MID_ALL, ...HIGH_ALL], '필수 유형 · 발전 유형 · 내신 만점 도전'],
  ['visang-cu-light-concept-22', '개념+유형 기본라이트_개념책(22개정)', '개념+유형', '비상교육', '개념서', [...ELEM_ALL], '교과서 개념 · 기본 유형 · 실력 유형 · 단원 마무리'],
  ['visang-cu-light-review-22', '개념+유형 기본라이트_복습책(22개정)', '개념+유형', '비상교육', '연산·워크북', [...ELEM_ALL], '기초력 다지기 · 개념책 매칭 복습 · 서술형 연습'],
  ['visang-cu-light-eval-22', '개념+유형 기본라이트_평가책(22개정)', '개념+유형', '비상교육', '연산·워크북', [...ELEM_ALL], '수시 평가 · 기본/실력 단원평가 · 서술형 평가'],
  ['visang-cu-basic-light-22', '개념+유형 기초탄탄 라이트(22개정)', '개념+유형', '비상교육', '유형서', [...MID_ALL], '기초 확인 · 필수 유형 반복 · 학교시험 미리보기'],
  ['visang-cu-power-22', '개념+유형 실력향상 파워(22개정)', '개념+유형', '비상교육', '유형서', [...MID_ALL], '핵심 유형 · 기출 필수 유형 · 까다로운 기출 · 서술형'],
  ['visang-cu-app-concept-22', '개념+유형 응용파워_개념책(22개정)', '개념+유형', '비상교육', '개념서', [...ELEM_3_6], '핵심 개념 · 응용 개념 · 발전 예제 · 단원 마무리'],
  ['visang-cu-app-type-22', '개념+유형 응용파워_유형책(22개정)', '개념+유형', '비상교육', '심화서', [...ELEM_3_6], '응용 유형 강화 · 심화 서술형 · 최상위 도전'],

  // 4. 쎈 / 개념쎈 / 라이트쎈 / 베이직쎈 / 쎈B 시리즈 (좋은책신사고)
  ['concept-ssen-elem-22', '개념쎈 초등수학(22개정)', '개념쎈', '좋은책신사고', '개념서', [...ELEM_3_6], '개념 사전 · 개념 익히기 · 유형 다잡기 · 단원 마무리'],
  ['concept-ssen-elem-wb-22', '개념쎈 초등수학_워크북(22개정)', '개념쎈', '좋은책신사고', '연산·워크북', [...ELEM_3_6], '개념별 1:1 매칭 반복 학습 · 실전 문제'],
  ['concept-ssen-22', '개념쎈(22개정)', '개념쎈', '좋은책신사고', '개념서', [...MID_ALL, ...HIGH_ALL], '사전식 개념 정리 · 대표유형 · 유제 · 중단원 연습문제'],
  ['concept-ssen-wb-22', '개념쎈_워크북(22개정)', '개념쎈', '좋은책신사고', '연산·워크북', [...MID_ALL, ...HIGH_CORE], '개념별 1:1 매칭 연습 · 단원별 실전 테스트'],
  ['light-ssen-22', '라이트쎈(22개정)', '라이트쎈', '좋은책신사고', '유형서', [...ELEM_3_6, ...MID_ALL, ...HIGH_ALL], 'A단계 기본 · B단계 유형 · B+단계 유형 마스터'],
  ['light-ssen-eval-22', '라이트쎈_단원평가(22개정)', '라이트쎈', '좋은책신사고', '연산·워크북', [...ELEM_3_6, ...MID_ALL], '중단원별 내신 대비 실전 단원평가'],
  ['light-ssen-mock-22', '라이트쎈_대단원 모의고사(22개정)', '라이트쎈', '좋은책신사고', '기출·모의', [...MID_ALL, ...HIGH_CORE], '대단원별 학교시험 적중 모의고사'],
  ['basic-ssen-22', '베이직쎈(22개정)', '베이직쎈', '좋은책신사고', '유형서', [...MID_ALL, ...HIGH_ALL], '기초 개념 훈련 · 핵심 유형 반복 · 학교시험 기본기'],
  ['ssen-elem-22', '쎈 초등수학(22개정)', '쎈', '좋은책신사고', '유형서', [...ELEM_ALL], 'A단계 기본다잡기 · B단계 유형뽀개기 · C단계 응용도전하기'],
  ['ssen-elem-ach-22', '쎈 초등수학_학업성취도(22개정)', '쎈', '좋은책신사고', '연산·워크북', [...ELEM_ALL], '단원별 학업성취도 평가 · 서술형 평가'],
  ['ssen-general-22', '쎈(22개정)', '쎈', '좋은책신사고', '유형서', [...MID_ALL, ...HIGH_ALL], 'A단계 기본 · B단계 유형 · C단계 만점 도전'],
  ['ssenb-elem-22', '쎈B 초등수학(22개정)', '쎈B', '좋은책신사고', '유형서', [...ELEM_3_6], '쎈 B단계 1:1 닮은꼴 집중 유형 훈련'],
  ['ssenb-22', '쎈B(22개정)', '쎈B', '좋은책신사고', '유형서', [...MID_ALL, ...HIGH_ALL], '쎈 B단계 1:1 닮은꼴 유형 마스터 · 실전 대비'],

  // 5. 개념원리 & RPM (개념원리)
  ['concept-principle-22', '개념원리(22개정)', '개념원리', '개념원리', '개념서', [...MID_ALL, ...HIGH_ALL], '개념원리 이해 · 핵심문제 · 확인체크 · 단원 연습문제'],
  ['rpm-general-22', '개념원리 RPM(22개정)', 'RPM', '개념원리', '유형서', [...MID_ALL, ...HIGH_ALL], '교과서 문제 정복 · 핵심 유형 익히기 · 시험에 꼭 나오는 문제'],

  // 6. 교과서 & 수학익힘 (초·중·고 2022 개정)
  ['tb-donga-22', '교과서_동아(22개정)', '교과서', '동아출판', '교과서', [...MID_ALL, ...HIGH_ALL], '준비학습 · 소단원 확인문제 · 중단원 마무리 · 대단원 평가'],
  ['tb-miraen-22', '교과서_미래엔(22개정)', '교과서', '미래엔', '교과서', [...MID_ALL, ...HIGH_ALL], '생각열기 · 스스로 확인하기 · 중단원 학습점검 · 대단원 마무리'],
  ['tb-visang-22', '교과서_비상(22개정)', '교과서', '비상교육', '교과서', [...MID_ALL, ...HIGH_ALL], '생각톡톡 · 문제 · 스스로 해결하기 · 대단원 학습평가'],
  ['tb-ybm-22', '교과서_와이비엠(22개정)', '교과서', '와이비엠', '교과서', [...MID_ALL, ...HIGH_ALL], '소단원 확인문제 · 중단원 마무리 · 대단원 종합문제'],
  ['tb-jihak-22', '교과서_지학사(22개정)', '교과서', '지학사', '교과서', [...MID_ALL, ...HIGH_ALL], '소단원 문제 · 중단원 연습문제 · 대단원 마무리'],
  ['tb-kyohak-h-22', '교과서_교학사(22개정)', '교과서', '교학사', '교과서', [...HIGH_ALL], '예제·유제 · 중단원 연습문제 · 대단원 종합문제'],
  ['tb-neungyule-h-22', '교과서_능률(22개정)', '교과서', 'NE능률', '교과서', [...HIGH_ALL], '스스로 확인하기 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-kdj-22', '교과서_천재_김동재(22개정)', '교과서', '천재교과서(김동재)', '교과서', [...MID_ALL, ...HIGH_CORE], '스스로 확인 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-khk-22', '교과서_천재_김화경(22개정)', '교과서', '천재교과서(김화경)', '교과서', [...MID_ALL, ...HIGH_CORE], '스스로 확인 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-cc-jeon-22', '교과서_천재_천재(전)(22개정)', '교과서', '천재교육(전인태)', '교과서', [...MID_ALL, ...HIGH_ALL], '예제·문제 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-cc-hong-22', '교과서_천재_천재(홍)(22개정)', '교과서', '천재교육(홍진곤)', '교과서', [...MID_ALL, ...HIGH_ALL], '예제·문제 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-jeon-22', '교과서_천재(전)(22개정)', '교과서', '천재교육(전인태)', '교과서', [...MID_ALL, ...HIGH_ALL], '예제·문제 · 중단원 마무리 · 대단원 평가'],
  ['tb-chunjae-hong-22', '교과서_천재(홍)(22개정)', '교과서', '천재교육(홍진곤)', '교과서', [...MID_ALL, ...HIGH_ALL], '예제·문제 · 중단원 마무리 · 대단원 평가'],
  ['tb-ikhim-donga', '교과서_수학익힘 동아출판', '수학익힘', '동아출판', '교과서', [...ELEM_ALL], '차시별 교과서 개념 확인 · 수학익힘 기본·실력 문항'],
  ['tb-ikhim-didimdol', '교과서_수학익힘 디딤돌', '수학익힘', '디딤돌', '교과서', [...ELEM_ALL], '차시별 수학익힘 문제 · 단원 마무리 확인'],
  ['tb-ikhim-didimdol-edu', '교과서_수학익힘 디딤돌교육', '수학익힘', '디딤돌교육', '교과서', [...ELEM_ALL], '차시별 수학익힘 문제 · 단원 마무리 확인'],
  ['tb-ikhim-miraen', '교과서_수학익힘 미래엔', '수학익힘', '미래엔', '교과서', [...ELEM_ALL], '차시별 수학익힘 확인 · 얼마나 알고 있나요'],
  ['tb-ikhim-visang', '교과서_수학익힘 비상', '수학익힘', '비상교육', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 공부한 내용 확인하기'],
  ['tb-ikhim-visang-edu', '교과서_수학익힘 비상교육', '수학익힘', '비상교육', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 공부한 내용 확인하기'],
  ['tb-ikhim-iscream', '교과서_수학익힘 아이스크림', '수학익힘', '아이스크림미디어', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 단원 성취 확인'],
  ['tb-ikhim-ybm', '교과서_수학익힘 와이비엠', '수학익힘', '와이비엠', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 실력 쑥쑥 확인학습'],
  ['tb-ikhim-jihak', '교과서_수학익힘 지학사', '수학익힘', '지학사', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 단원 마무리 평가'],
  ['tb-ikhim-chunjae-park', '교과서_수학익힘 천재(박)', '수학익힘', '천재교육(박만구)', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 얼마나 알고 있나요'],
  ['tb-ikhim-chunjae-han', '교과서_수학익힘 천재(한)', '수학익힘', '천재교육(한대희)', '교과서', [...ELEM_ALL], '차시별 수학익힘 · 얼마나 알고 있나요'],
  ['kyoma-math', '교마수학', '교마수학', '교마수학', '교과서', [...MID_ALL, ...HIGH_ALL], '교과서 맞춤 개념 확인 · 교과서 변형 유형 · 내신 대비'],

  // 7. 수학의 정석 (성지출판)
  ['jungsuk-basic-22', '기본 수학의 정석(22개정)', '수학의 정석', '성지출판', '개념서', [...HIGH_ALL], '기본 개념 정석 · 필수 예제 · 유제 · 연습문제(기본/실력)'],
  ['jungsuk-silryuk-22', '실력 수학의 정석(22개정)', '수학의 정석', '성지출판', '심화서', [...HIGH_ALL], '심화 이론 정석 · 필수 예제 · 유제 · 실력 연습문제'],

  // 8. 디딤돌 시리즈 (디딤돌)
  ['didimdol-basic-22', '디딤돌 기본(22개정)', '디딤돌', '디딤돌', '개념서', [...ELEM_ALL], '교과서 개념 보따리 · 기본 문제 · 실력 문제 · 기출 단원평가'],
  ['didimdol-basic-tantan-22', '디딤돌 기본_탄탄(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...ELEM_ALL], '진도책 1:1 복습 · 서술형 기초 다지기 · 단원평가'],
  ['didimdol-basic-type-22', '디딤돌 기본+유형(22개정)', '디딤돌', '디딤돌', '유형서', [...ELEM_ALL], '교과서 개념 · 꼭 나오는 필수유형 · 자주 틀리는 유형 · 최상위 도전'],
  ['didimdol-basic-type-eval-22', '디딤돌 기본+유형_수시평가(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...ELEM_ALL], '단원별 수시평가 대비 · 학교시험 실전 문제'],
  ['didimdol-basic-app-22', '디딤돌 기본+응용(22개정)', '디딤돌', '디딤돌', '심화서', [...ELEM_ALL], '개념 익히기 · 기본기 다지기 · 응용력 기르기 · 단원평가'],
  ['didimdol-basic-app-sup-22', '디딤돌 기본+응용_실력보강(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...ELEM_ALL], '응용 유형 복습 · 서술형 실력 보강 · 단원 성취도 평가'],
  ['didimdol-prob-type-22', '디딤돌 문제유형(22개정)', '디딤돌', '디딤돌', '유형서', [...ELEM_ALL], '핵심 개념 · 교과서+익힘책 유형 · 자주 틀리는 유형 · 시험 대비'],
  ['didimdol-prob-type-tantan-22', '디딤돌 문제유형_유형탄탄북(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...ELEM_ALL], '유형 반복 학습 · 단원평가 · 서술형 평가'],
  ['didimdol-principle-22', '디딤돌 원리(22개정)', '디딤돌', '디딤돌', '개념서', [...ELEM_ALL], '원리 이해 · 기초력 다지기 · 교과서익힘책 다지기'],
  ['didimdol-app-22', '디딤돌 응용(22개정)', '디딤돌', '디딤돌', '심화서', [...ELEM_ALL], '기본 다지기 · 응용 유형 익히기 · 심화 문제 도전 · 기출 단원평가'],
  ['didimdol-app-tantan-22', '디딤돌 응용_탄탄(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...ELEM_ALL], '응용력 강화 복습 · 학교시험 대비 실력 평가'],
  ['didimdol-m-concept-book-22', '디딤돌수학 개념기본_개념북(22개정)', '디딤돌', '디딤돌', '개념서', [...MID_ALL, ...HIGH_G1], '개념 정리 · 필수 예제 · 개념 특강 · 단원 마무리'],
  ['didimdol-m-concept-ikhim-22', '디딤돌수학 개념기본_익힘북(22개정)', '디딤돌', '디딤돌', '연산·워크북', [...MID_ALL, ...HIGH_G1], '개념북 1:1 매칭 반복 훈련 · 실전 테스트'],

  // 9. 마플 & 블랙라벨
  ['mapl-textbook-22', '마플교과서(22개정)', '마플', '희망에듀', '개념서', [...HIGH_ALL], '바이블 개념 정리 · 마플 개념익힘 · 발전문제 · 특강'],
  ['mapl-synergy-22', '마플시너지(22개정)', '마플시너지', '희망에듀', '유형서', [...HIGH_ALL], '베이직 · 노멀 · 터프 · 서술형 · 행복한 1등급'],
  ['blacklabel-22', '블랙라벨(22개정)', '블랙라벨', '진학사', '심화서', [...MID_ALL, ...HIGH_ALL], 'Step1 필수 확인 · Step2 1등급 빈출 · Step3 최고난도 킬러 · 종합문제'],

  // 10. 수학리더 시리즈 (천재교육)
  ['leader-concept-book-22', '수학리더 개념_개념책(22개정)', '수학리더', '천재교육', '개념서', [...ELEM_ALL], '교과서 개념 익히기 · 기본 다지기 · 응용 맛보기 · 단원 마무리'],
  ['leader-concept-eval-22', '수학리더 개념_평가책(22개정)', '수학리더', '천재교육', '연산·워크북', [...ELEM_ALL], '기초력 향상 · 개념 복습 · 단원 성취도 평가'],
  ['leader-basic-jipi-22', '수학리더 기본 지피지기(22개정)', '수학리더', '천재교육', '개념서', [...ELEM_ALL], '교과서 바로 알기 · 익힘책 바로 풀기 · 실력 바로 쌓기'],
  ['leader-basic-baekjeon-22', '수학리더 기본_백전백승(22개정)', '수학리더', '천재교육', '연산·워크북', [...ELEM_ALL], '익힘책 다시 풀기 · 서술형 연습 · 단원평가'],
  ['leader-basic-app-jindo-22', '수학리더 기본+응용 진도책(22개정)', '수학리더', '천재교육', '심화서', [...ELEM_ALL], '핵심 개념 · 기본 다지기 · 응용력 올리기 · 단원 실력 평가'],
  ['leader-basic-app-review-22', '수학리더 기본+응용_복습책(22개정)', '수학리더', '천재교육', '연산·워크북', [...ELEM_ALL], '응용 유형 복습 · 서술형 집중 연습 · 각종 평가 대비'],
  ['leader-type-book-22', '수학리더 유형 유형북(22개정)', '수학리더', '천재교육', '유형서', [...ELEM_ALL], '교과서 개념 · 핵심 유형 정복 · 응용 유형 도전 · 단원평가'],
  ['leader-type-sup-22', '수학리더 유형_보충북(22개정)', '수학리더', '천재교육', '연산·워크북', [...ELEM_ALL], '유형북 1:1 매칭 보충 · 서술형 · 실전 단원평가'],
  ['leader-simhwa-book-22', '수학리더 응용심화 심화북(22개정)', '수학리더', '천재교육', '심화서', [...ELEM_ALL], '핵심 노트 · 응용 유형 · 심화 유형 · 최상위 브레인 스토밍'],
  ['leader-simhwa-contest-22', '수학리더 응용심화_경시대비북(22개정)', '수학리더', '천재교육', '심화서', [...ELEM_ALL], '교내외 경시대회 대비 고난도 실전 모의평가'],

  // 11. 수매씽 / 수학의 바이블 / 수학의 샘 / 수학의 힘
  ['sumaessing-concept-22', '수매씽 개념_개념북(22개정)', '수매씽', '동아출판', '개념서', [...MID_ALL], '교과서 개념 · 핵심 유형 · 중단원 마무리'],
  ['sumaessing-wb-22', '수매씽 개념_워크북(22개정)', '수매씽', '동아출판', '연산·워크북', [...MID_ALL], '기초 연산 드릴 · 개념북 1:1 매칭 복습'],
  ['bible-concept-on-22', '수학의 바이블 개념 ON(22개정)', '수학의 바이블', '이투스북', '개념서', [...MID_ALL, ...HIGH_ALL], '단계별 개념 학습 · 예제/숫자바꾸기/표현바꾸기/개념넓히기 · 연습문제'],
  ['bible-concept-on-wb-22', '수학의 바이블 개념 ON_워크북(22개정)', '수학의 바이블', '이투스북', '연산·워크북', [...MID_ALL, ...HIGH_ALL], '개념 ON 1:1 매칭 훈련 · 중단원 실전 대비'],
  ['bible-type-on-22', '수학의 바이블 유형 ON(22개정)', '수학의 바이블', '이투스북', '유형서', [...MID_ALL, ...HIGH_ALL], 'A단계 필수유형 · B단계 발전유형 · C단계 고난도 · 서술형'],
  ['bible-type-on-v1-22', '수학의 바이블 유형 ON 1권(22개정)', '수학의 바이블', '이투스북', '유형서', [...HIGH_ALL], '1권 핵심·필수 유형 집중 학습 · 내신 빈출 정복'],
  ['bible-type-on-v2-22', '수학의 바이블 유형 ON 2권(22개정)', '수학의 바이블', '이투스북', '유형서', [...HIGH_ALL], '2권 심화·변형 유형 및 실전 완성'],
  ['math-saem-22', '수학의 샘(22개정)', '수학의 샘', '아름다운샘', '개념서', [...HIGH_ALL], '개념 정리 · 필수 예제 · 유제 · 중단원/대단원 연습문제'],
  ['math-him-beta-22', '수학의 힘 베타 유형(22개정)', '수학의 힘', '천재교육', '유형서', [...ELEM_ALL], '교과서 유형 · 익힘책 유형 · 응용 유형 · 단원평가'],

  // 12. 에이급 & 완쏠
  ['agroup-principle-22', '에이급 원리해설수학(22개정)', '에이급', '에이급출판사', '개념서', [...MID_ALL], '심화 원리 해설 · 필수 예제 · 발전 문제'],
  ['agroup-math-22', '에이급수학(22개정)', '에이급', '에이급출판사', '심화서', [...MID_ALL], 'C스텝 핵심 · B스텝 심화 · A스텝 최고수준 경시'],
  ['wansol-concept-22', '완쏠 개념(22개정)', '완쏠', '지학사', '개념서', [...MID_ALL, ...HIGH_CORE], '친절한 개념 설명 · 필수 유형 · 중단원 연습문제'],
  ['wansol-concept-wb-22', '완쏠 개념 워크북(22개정)', '완쏠', '지학사', '연산·워크북', [...MID_ALL, ...HIGH_CORE], '개념별 반복 연습 · 내신 기초 완성 워크북'],

  // 13. 우공비 & 우등생 & 왕수학
  ['ugongbi-qq-basic-22', '우공비 Q+Q 기본+실전 (22개정)', '우공비 Q+Q', '좋은책신사고', '개념서', [...ELEM_ALL, ...MID_ALL], '개념 잡는 Q · 실전 잡는 Q · 단원 마무리'],
  ['ugongbi-qq-basic-wb-22', '우공비 Q+Q 기본+실전 워크북(22개정)', '우공비 Q+Q', '좋은책신사고', '연산·워크북', [...ELEM_ALL, ...MID_ALL], '진도교재 1:1 매칭 복습 · 단원평가 · 서술형'],
  ['ugongbi-qq-adv-22', '우공비 Q+Q 발전+심화 (22개정)', '우공비 Q+Q', '좋은책신사고', '심화서', [...ELEM_ALL, ...MID_ALL], '필수 유형 Q · 발전 유형 Q · 심화 도전 Q'],
  ['ugongbi-qq-adv-wb-22', '우공비 Q+Q 발전+심화 워크북(22개정)', '우공비 Q+Q', '좋은책신사고', '연산·워크북', [...ELEM_ALL, ...MID_ALL], '발전·심화 유형 1:1 복습 · 고난도 실전 평가'],
  ['ugongbi-qq-std-22', '우공비 Q+Q 표준+완성 (22개정)', '우공비 Q+Q', '좋은책신사고', '유형서', [...ELEM_ALL, ...MID_ALL], '표준 유형 Q · 완성 유형 Q · 학교시험 완성'],
  ['ugongbi-qq-std-wb-22', '우공비 Q+Q 표준+완성 워크북(22개정)', '우공비 Q+Q', '좋은책신사고', '연산·워크북', [...ELEM_ALL, ...MID_ALL], '표준·완성 유형 1:1 매칭 워크북 · 단원평가'],
  ['ugongbi-jindo-22', '우공비 진도비법(22개정)', '우공비', '좋은책신사고', '개념서', [...ELEM_ALL], '이미지 연상 개념 · 익힘책 다지기 · 실력 쌓기 · 단원평가'],
  ['ugongbi-exam-22', '우공비_시험비법(22개정)', '우공비', '좋은책신사고', '연산·워크북', [...ELEM_ALL], '개념+확인문제 · 단원 기출평가 · 서술형 정복'],
  ['udeungsaeng-elem-22', '우등생 초등수학(22개정)', '우등생', '천재교육', '개념서', [...ELEM_ALL], '교과서 개념 · 익힘책 유형 · 빅데이터 잘 틀리는 문제 · 단원평가'],
  ['udeungsaeng-eval-22', '우등생_단원성취도평가(22개정)', '우등생', '천재교육', '연산·워크북', [...ELEM_ALL], '단원별 성취도 진단 및 학교시험 대비 평가'],
  ['udeungsaeng-data-22', '우등생_평가자료집(22개정)', '우등생', '천재교육', '연산·워크북', [...ELEM_ALL], '기본·실력 단원평가 · 심화+서술형 평가'],
  ['wang-basic-22', '왕수학 기본편(22개정)', '왕수학', '에듀왕', '개념서', [...ELEM_ALL], '개념 다지기 · 기본 유형 · 실력 키우기 · 단원평가'],
  ['wang-silryuk-22', '왕수학 실력편(22개정)', '왕수학', '에듀왕', '유형서', [...ELEM_ALL], '핵심 개념 · 대표 응용 유형 · 발전 문제 · 단원 마스터'],
  ['jump-wang-top-22', '점프왕수학 최상위(22개정)', '왕수학', '에듀왕', '심화서', [...ELEM_ALL], '심화 개념 · 최상위 대표 유형 · 경시 도전 문제'],

  // 14. 만렙 / 고쟁이 / 유형반복R / 일등급수학 / 일품 / 절대등급
  ['manrep-type-space-22', '유형 만렙(22개정)', '유형 만렙', '비상교육', '유형서', [...MID_ALL, ...HIGH_CORE], '핵심 개념 · 필수 유형 · 만렙 도달 기출 · 서술형'],
  ['manrep-gichul-space-22', '유형 만렙_기출북(22개정)', '유형 만렙', '비상교육', '기출·모의', [...MID_ALL, ...HIGH_CORE], '학교시험 빈출 기출 유형 · 단원별 실전 테스트'],
  ['manrep-type-22', '유형만렙(22개정)', '유형 만렙', '비상교육', '유형서', [...MID_ALL, ...HIGH_CORE], '필수 유형 마스터 · 내신 빈출 유형 · 최고난도 도전'],
  ['manrep-gichul-22', '유형만렙_기출북(22개정)', '유형 만렙', '비상교육', '기출·모의', [...MID_ALL, ...HIGH_CORE], '단원별 내신 기출 · 서술형 기출 실전 훈련'],
  ['gojaengi-22', '유형+내신 고쟁이(22개정)', '고쟁이', '이투스북', '심화서', [...HIGH_ALL], 'Step1 교과서 속 개념 · Step2 내신 빈출 유형 · Step3 고난도 스킵불가'],
  ['type-repeat-r-22', '유형반복R(22개정)', '유형반복R', '씨매스', '유형서', [...MID_ALL, ...HIGH_G1], 'A단계 기초 반복 · B단계 핵심 유형 반복 · 단원 마무리'],
  ['ilgrade-math-22', '일등급수학(22개정)', '일등급수학', '수경출판사', '심화서', [...MID_ALL, ...HIGH_ALL], '빈출 기본 유형 · 1등급 실전 유형 · 1등급 도전 · 경찰대/수능 기출'],
  ['ilpum-general-22', '일품(22개정)', '일품', '좋은책신사고', '심화서', [...MID_ALL, ...HIGH_CORE], '개념&핵심기출 · 만점 도전하기 · 최고수준 문제 · 수능형 사고력'],
  ['jeoldae-grade-22', '절대등급(22개정)', '절대등급', '이룸이앤비', '심화서', [...MID_ALL, ...HIGH_CORE], 'A단계 핵심 확인 · B단계 내신 1등급 필수 · C단계 최상위 킬러'],

  // 15. 체크체크 / 최고수준 / 최상위수학 / 큐브 / 풍산자
  ['check-basic-n-22', '체크체크 베이직 N제(22개정)', '체크체크', '천재교육', '유형서', [...MID_ALL], '기초 개념 적용 · 쉬운 유형 반복 훈련 · 단원 마무리'],
  ['check-type-n-22', '체크체크 유형체크N제(22개정)', '체크체크', '천재교육', '유형서', [...MID_ALL], '필수 유형 익히기 · 학교시험 기출 유형 · 만점 도전'],
  ['check-drill-22', '체크체크_개념드릴(22개정)', '체크체크', '천재교육', '연산·워크북', [...MID_ALL], '기초 계산력 강화 · 교과서 기본 문제 반복 드릴'],
  ['check-jindo-22', '체크체크_진도교재(22개정)', '체크체크', '천재교육', '개념서', [...MID_ALL], '개념 정리 · 한번 더 확인 · 실력 체크 · 중단원 마무리'],
  ['choigo-sujun-22', '최고수준(22개정)', '최고수준', '천재교육', '심화서', [...ELEM_ALL, ...MID_ALL], 'START 개념 · JUMP 유형 · MASTER 심화 · TOP 최고수준'],
  ['choigo-sujun-actual-22', '최고수준_실전예상문제(22개정)', '최고수준', '천재교육', '심화서', [...ELEM_ALL, ...MID_ALL], '각종 경시대회 및 최상위 실전 예상 문제'],
  ['choisangwi-light-22', '최상위수학 라이트(22개정)', '최상위수학', '디딤돌', '심화서', [...MID_ALL], '개념 정리 · 주제별 심화 유형 · 단원 종합 문제'],
  ['choisangwi-22', '최상위수학(22개정)', '최상위수학', '디딤돌', '심화서', [...ELEM_ALL, ...MID_ALL], 'Basic 개념 · Math Topic 심화유형 · Level up 테스트 · High Level'],
  ['choisangwi-contest-22', '최상위수학_교내경시(22개정)', '최상위수학', '디딤돌', '심화서', [...ELEM_ALL], '교내 경시대회 및 영재교육원 대비 실전 문제'],
  ['choisangwi-s-22', '최상위수학S(22개정)', '최상위수학', '디딤돌', '심화서', [...ELEM_ALL], '교과서 개념 · 이미지 심화 개념 · 최상위S 유형 · Math Master'],
  ['choisangwi-s-rev1-22', '최상위수학S_복습(22개정)', '최상위수학', '디딤돌', '연산·워크북', [...ELEM_ALL], '최상위S 1:1 매칭 심화 복습 · 오답 정복'],
  ['choisangwi-s-rev2-22', '최상위수학S_복습책(22개정)', '최상위수학', '디딤돌', '연산·워크북', [...ELEM_ALL], '최상위S 1:1 매칭 심화 복습책 · 단원 종합 평가'],
  ['cube-concept-book-22', '큐브 개념 개념책(22개정)', '큐브', '동아출판', '개념서', [...ELEM_ALL], '교과서 개념 잡기 · 한 번 더 익히기 · 익힘책 문제로 다지기 · 단원 마무리'],
  ['cube-concept-kanghwa-22', '큐브 개념_강화책(22개정)', '큐브', '동아출판', '연산·워크북', [...ELEM_ALL], '기초력 학습지 · 개념책 1:1 매칭 학습 · 단원평가'],
  ['pungsanja-concept-book-22', '풍산자 개념완성_개념북(22개정)', '풍산자', '지학사', '개념서', [...MID_ALL], '풍산자 비법 개념 · 필수 문제 · 실전 연습문제'],
  ['pungsanja-concept-wb-22', '풍산자 개념완성_워크북(22개정)', '풍산자', '지학사', '연산·워크북', [...MID_ALL], '개념북 1:1 매칭 반복 워크북 · 내신 대비'],
  ['pungsanja-type-22', '풍산자 필수유형(22개정)', '풍산자', '지학사', '유형서', [...MID_ALL, ...HIGH_ALL], '필수 유형 공략 · 내신 빈출 · 서술형 · 중단원 마무리'],
  ['pungsanja-type-actual-22', '풍산자 필수유형_실전북(22개정)', '풍산자', '지학사', '연산·워크북', [...MID_ALL], '학교시험 대비 단원별 실전 테스트 & 모의고사'],
  ['pungsanja-22', '풍산자(22개정)', '풍산자', '지학사', '개념서', [...HIGH_ALL], '풍산자 개념 정리 · 예제와 유제 · 중단원/대단원 마무리'],

  // 16. EBS 만점왕 / 매쓰디렉터 / 올림포스 / 중학 뉴런
  ['ebs-manjeom-concept-22', 'EBS 만점왕 수학_개념책(22개정)', 'EBS 만점왕', 'EBS', '개념서', [...ELEM_ALL], '교과서 개념 다지기 · 확인 문제 · 단원 마무리'],
  ['ebs-manjeom-actual-22', 'EBS 만점왕 수학_실전책(22개정)', 'EBS 만점왕', 'EBS', '연산·워크북', [...ELEM_ALL], '핵심 유형 복습 · 학교시험 대비 단원평가 · 서술형'],
  ['ebs-manjeom-plus-main-22', 'EBS 만점왕 수학플러스 본책(22개정)', 'EBS 만점왕', 'EBS', '유형서', [...ELEM_ALL], '핵심 개념 · 대표 유형 · 응용 문제 · 단원 마무리'],
  ['ebs-manjeom-plus-rev-22', 'EBS 만점왕 수학플러스_복습책(22개정)', 'EBS 만점왕', 'EBS', '연산·워크북', [...ELEM_ALL], '본책 1:1 복습 · 서술형 평가 · 학업성취도 평가'],
  ['ebs-mathdirector-h1-22', 'EBS 매쓰디렉터의 고1 수학(22개정)', 'EBS 매쓰디렉터', 'EBS', '개념서', [...HIGH_G1], '핵심 개념 특강 · 대표 유형 · 내신 완벽 대비 문제'],
  ['ebs-olympos-gonando-22', 'EBS 올림포스 고난도(22개정)', 'EBS 올림포스', 'EBS', '심화서', [...HIGH_CORE], '핵심 개념 · 고난도 유형 · 4% 도전 킬러문항 · 내신 1등급 완성'],
  ['ebs-olympos-type-22', 'EBS 올림포스 유형편(22개정)', 'EBS 올림포스', 'EBS', '유형서', [...HIGH_CORE], '개념 확인 · 필수 유형 · 내신 출제율 높은 변형 문제'],
  ['ebs-olympos-22', 'EBS 올림포스(22개정)', 'EBS 올림포스', 'EBS', '개념서', [...HIGH_ALL], '개념 정리 · 기본 문제 · 유형 확인 · 서술형 · 대단원 종합'],
  ['ebs-neuron-concept-22', 'EBS 중학 뉴런_개념책(22개정)', 'EBS 중학 뉴런', 'EBS', '개념서', [...MID_ALL], '개념 설명 · 예제/유제 · 형성평가 · 중단원 마무리'],
  ['ebs-neuron-actual-22', 'EBS 중학 뉴런_실전책(22개정)', 'EBS 중학 뉴런', 'EBS', '연산·워크북', [...MID_ALL], '개념책 매칭 문제 · 서술형 대비 · 단원별 실전 테스트'],
];

export const TEXTBOOK_CATALOG: TextbookPreset[] = BOOK_SERIES_SPECS.flatMap(
  ([idPrefix, baseTitle, series, publisher, category, courses, step]) =>
    courses.map(course => {
      const gradeGroup = getGradeGroupForCourse(course);
      const shortCourse = COURSE_SHORT_LABEL[course] ?? course;
      const { units, total_pages, total_problems, total_types } = generateUnitsForCourse(
        course,
        category,
        series,
        step
      );
      return {
        id: `${idPrefix}__${course.replace(/\s+/g, '-')}`,
        series,
        publisher,
        category,
        gradeGroup,
        title: `${baseTitle} · ${shortCourse}`,
        curriculum: '2022 개정',
        course,
        total_pages,
        description: `${course} 과정 (${units[0]?.name} ~ ${units.at(-1)?.name}) · 총 ${total_problems.toLocaleString()}문항${total_types > 0 ? ` · ${total_types}개 유형` : ''}`,
        units,
      };
    })
);

/**
 * Formats a ProgressUnit into a single human-readable text line for quick bulk text editing:
 * "대단원 > 중단원 | p.8~25 | #1~132 | 132문항 | 18유형 | A·B·C단계"
 */
export function formatUnitToTextLine(u: ProgressUnit): string {
  const head = u.group ? `${u.group} > ${u.name}` : u.name;
  const extras: string[] = [];
  if (u.start_page && u.end_page) extras.push(`p.${u.start_page}~${u.end_page}`);
  if (u.start_problem && u.end_problem) extras.push(`#${u.start_problem}~${u.end_problem}`);
  if (u.problem_count) extras.push(`${u.problem_count}문항`);
  if (u.type_count) extras.push(`${u.type_count}유형`);
  if (u.step_detail) extras.push(u.step_detail);
  return extras.length > 0 ? `${head} | ${extras.join(' | ')}` : head;
}

/**
 * Parses a line of text back into a ProgressUnit (preserving existing ID if matching).
 * Supports both simple "대단원 > 소단원" and pipe-separated metadata.
 */
export function parseTextLineToUnit(line: string, existingUnits: ProgressUnit[], usedIds: Set<string>): ProgressUnit {
  const segments = line.split('|').map(s => s.trim()).filter(Boolean);
  const head = segments[0] ?? line.trim();
  const arrowIdx = head.indexOf('>');
  const group = arrowIdx < 0 ? '' : head.slice(0, arrowIdx).trim();
  const name = arrowIdx < 0 ? head.trim() : head.slice(arrowIdx + 1).trim();

  const old = existingUnits.find(u => u.group === group && u.name === name && !usedIds.has(u.id));
  const id = old?.id ?? crypto.randomUUID();
  usedIds.add(id);

  const unit: ProgressUnit = {
    id,
    group,
    name,
    ...(old?.start_page ? { start_page: old.start_page } : {}),
    ...(old?.end_page ? { end_page: old.end_page } : {}),
    ...(old?.start_problem ? { start_problem: old.start_problem } : {}),
    ...(old?.end_problem ? { end_problem: old.end_problem } : {}),
    ...(old?.problem_count ? { problem_count: old.problem_count } : {}),
    ...(old?.type_count ? { type_count: old.type_count } : {}),
    ...(old?.step_detail ? { step_detail: old.step_detail } : {}),
  };

  if (segments.length > 1) {
    delete unit.start_page;
    delete unit.end_page;
    delete unit.start_problem;
    delete unit.end_problem;
    delete unit.problem_count;
    delete unit.type_count;
    delete unit.step_detail;

    for (const seg of segments.slice(1)) {
      const pageMatch = seg.match(/^p\.?\s*(\d+)\s*[~-]\s*(\d+)$/i);
      if (pageMatch) {
        unit.start_page = Number(pageMatch[1]);
        unit.end_page = Number(pageMatch[2]);
        continue;
      }
      const probRangeMatch = seg.match(/^#?\s*(\d+)\s*[~-]\s*(\d+)(?:번)?$/);
      if (probRangeMatch) {
        unit.start_problem = Number(probRangeMatch[1]);
        unit.end_problem = Number(probRangeMatch[2]);
        if (!unit.problem_count && unit.end_problem >= unit.start_problem) {
          unit.problem_count = unit.end_problem - unit.start_problem + 1;
        }
        continue;
      }
      const countMatch = seg.match(/^(\d+)\s*문항$/);
      if (countMatch) {
        unit.problem_count = Number(countMatch[1]);
        continue;
      }
      const typeMatch = seg.match(/^(\d+)\s*유형$/);
      if (typeMatch) {
        unit.type_count = Number(typeMatch[1]);
        continue;
      }
      unit.step_detail = seg.slice(0, 200);
    }
  }

  return unit;
}
