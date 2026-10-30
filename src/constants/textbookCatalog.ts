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

export const TEXTBOOK_CATALOG: TextbookPreset[] = [
  // ==========================================
  // 1. 신사고 쎈 (SSEN) 중등 시리즈
  // ==========================================
  {
    id: 'ssen-m1-1',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 1-1',
    curriculum: '2022 개정',
    course: '중1 1학기',
    total_pages: 208,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,305문항 · 169개 유형',
    units: buildSequentialUnits([
      { group: 'I. 자연수의 성질', name: '01. 소인수분해', pages: [8, 25], problems: 136, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'I. 자연수의 성질', name: '02. 최대공약수와 최소공배수', pages: [26, 43], problems: 132, types: 17, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 정수와 유리수', name: '03. 정수와 유리수', pages: [46, 61], problems: 118, types: 15, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 정수와 유리수', name: '04. 유리수의 덧셈과 뺄셈', pages: [62, 77], problems: 114, types: 14, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 정수와 유리수', name: '05. 유리수의 곱셈과 나눗셈', pages: [78, 97], problems: 142, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 문자와 식', name: '06. 문자의 사용과 식의 계산', pages: [100, 121], problems: 154, types: 20, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 문자와 식', name: '07. 일차방정식의 풀이', pages: [122, 141], problems: 138, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 문자와 식', name: '08. 일차방정식의 활용', pages: [142, 163], problems: 146, types: 21, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'IV. 좌표평면과 그래프', name: '09. 좌표평면과 그래프', pages: [166, 183], problems: 108, types: 13, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'IV. 좌표평면과 그래프', name: '10. 정비례와 반비례', pages: [184, 208], problems: 117, types: 15, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
    ]),
  },
  {
    id: 'ssen-m1-2',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 1-2',
    curriculum: '2022 개정',
    course: '중1 2학기',
    total_pages: 200,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,210문항 · 158개 유형',
    units: buildSequentialUnits([
      { group: 'I. 기본 도형', name: '01. 기본 도형', pages: [8, 27], problems: 140, types: 18, step: 'A·B·C단계' },
      { group: 'I. 기본 도형', name: '02. 위치 관계', pages: [28, 43], problems: 108, types: 14, step: 'A·B·C단계' },
      { group: 'I. 기본 도형', name: '03. 평행선의 성질', pages: [44, 59], problems: 106, types: 13, step: 'A·B·C단계' },
      { group: 'I. 기본 도형', name: '04. 작도와 합동', pages: [60, 77], problems: 118, types: 16, step: 'A·B·C단계' },
      { group: 'II. 평면도형', name: '05. 다각형', pages: [80, 99], problems: 136, types: 18, step: 'A·B·C단계' },
      { group: 'II. 평면도형', name: '06. 원과 부채꼴', pages: [100, 121], problems: 148, types: 19, step: 'A·B·C단계' },
      { group: 'III. 입체도형', name: '07. 다면체와 회전체', pages: [124, 143], problems: 132, types: 17, step: 'A·B·C단계' },
      { group: 'III. 입체도형', name: '08. 입체도형의 겉넓이와 부피', pages: [144, 167], problems: 152, types: 20, step: 'A·B·C단계' },
      { group: 'IV. 통계', name: '09. 자료의 정리와 해석', pages: [170, 200], problems: 170, types: 23, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-m2-1',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 2-1',
    curriculum: '2022 개정',
    course: '중2 1학기',
    total_pages: 216,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,312문항 · 172개 유형',
    units: buildSequentialUnits([
      { group: 'I. 수와 식의 계산', name: '01. 유리수와 순환소수', pages: [8, 25], problems: 132, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'I. 수와 식의 계산', name: '02. 단항식의 계산', pages: [26, 41], problems: 118, types: 15, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'I. 수와 식의 계산', name: '03. 다항식의 계산', pages: [42, 59], problems: 124, types: 16, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 부등식과 연립방정식', name: '04. 일차부등식', pages: [62, 79], problems: 120, types: 15, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 부등식과 연립방정식', name: '05. 일차부등식의 활용', pages: [80, 95], problems: 104, types: 15, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 부등식과 연립방정식', name: '06. 연립일차방정식', pages: [96, 115], problems: 136, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'II. 부등식과 연립방정식', name: '07. 연립일차방정식의 활용', pages: [116, 135], problems: 128, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 일차함수', name: '08. 일차함수와 그래프 (1)', pages: [138, 159], problems: 140, types: 18, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 일차함수', name: '09. 일차함수와 그래프 (2)', pages: [160, 179], problems: 126, types: 16, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
      { group: 'III. 일차함수', name: '10. 일차함수와 일차방정식의 관계', pages: [180, 216], problems: 184, types: 23, step: 'A단계 기본 · B단계 유형 · C단계 만점' },
    ]),
  },
  {
    id: 'ssen-m2-2',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 2-2',
    curriculum: '2022 개정',
    course: '중2 2학기',
    total_pages: 212,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,248문항 · 164개 유형',
    units: buildSequentialUnits([
      { group: 'I. 삼각형의 성질', name: '01. 이등변삼각형과 직각삼각형', pages: [8, 27], problems: 132, types: 17, step: 'A·B·C단계' },
      { group: 'I. 삼각형의 성질', name: '02. 삼각형의 외심과 내심', pages: [28, 47], problems: 134, types: 18, step: 'A·B·C단계' },
      { group: 'II. 사각형의 성질', name: '03. 평행사변형', pages: [50, 69], problems: 130, types: 17, step: 'A·B·C단계' },
      { group: 'II. 사각형의 성질', name: '04. 여러 가지 사각형', pages: [70, 93], problems: 152, types: 20, step: 'A·B·C단계' },
      { group: 'III. 도형의 닮음과 피타고라스 정리', name: '05. 도형의 닮음', pages: [96, 115], problems: 128, types: 17, step: 'A·B·C단계' },
      { group: 'III. 도형의 닮음과 피타고라스 정리', name: '06. 평행선과 선분의 길이의 비', pages: [116, 137], problems: 142, types: 19, step: 'A·B·C단계' },
      { group: 'III. 도형의 닮음과 피타고라스 정리', name: '07. 삼각형의 무게중심과 닮음의 활용', pages: [138, 155], problems: 116, types: 15, step: 'A·B·C단계' },
      { group: 'III. 도형의 닮음과 피타고라스 정리', name: '08. 피타고라스 정리', pages: [156, 175], problems: 130, types: 17, step: 'A·B·C단계' },
      { group: 'IV. 확률', name: '09. 경우의 수', pages: [178, 195], problems: 112, types: 14, step: 'A·B·C단계' },
      { group: 'IV. 확률', name: '10. 확률', pages: [196, 212], problems: 72, types: 10, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-m3-1',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 3-1',
    curriculum: '2022 개정',
    course: '중3 1학기',
    total_pages: 224,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,354문항 · 178개 유형',
    units: buildSequentialUnits([
      { group: 'I. 실수와 그 연산', name: '01. 제곱근의 뜻과 성질', pages: [8, 27], problems: 144, types: 19, step: 'A·B·C단계' },
      { group: 'I. 실수와 그 연산', name: '02. 무리수와 실수', pages: [28, 41], problems: 96, types: 13, step: 'A·B·C단계' },
      { group: 'I. 실수와 그 연산', name: '03. 근호를 포함한 식의 곱셈과 나눗셈', pages: [42, 57], problems: 112, types: 15, step: 'A·B·C단계' },
      { group: 'I. 실수와 그 연산', name: '04. 근호를 포함한 식의 덧셈과 뺄셈', pages: [58, 75], problems: 118, types: 15, step: 'A·B·C단계' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '05. 다항식의 곱셈', pages: [78, 97], problems: 138, types: 18, step: 'A·B·C단계' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '06. 다항식의 인수분해', pages: [98, 115], problems: 122, types: 16, step: 'A·B·C단계' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '07. 인수분해 공식의 활용', pages: [116, 131], problems: 104, types: 14, step: 'A·B·C단계' },
      { group: 'III. 이차방정식', name: '08. 이차방정식의 풀이', pages: [134, 155], problems: 142, types: 18, step: 'A·B·C단계' },
      { group: 'III. 이차방정식', name: '09. 이차방정식의 활용', pages: [156, 177], problems: 136, types: 19, step: 'A·B·C단계' },
      { group: 'IV. 이차함수', name: '10. 이차함수의 그래프 (1)', pages: [180, 201], problems: 124, types: 16, step: 'A·B·C단계' },
      { group: 'IV. 이차함수', name: '11. 이차함수의 그래프 (2)', pages: [202, 224], problems: 118, types: 15, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-m3-2',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '쎈 중등 수학 3-2',
    curriculum: '2022 개정',
    course: '중3 2학기',
    total_pages: 176,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,020문항 · 136개 유형',
    units: buildSequentialUnits([
      { group: 'I. 삼각비', name: '01. 삼각비', pages: [8, 29], problems: 148, types: 19, step: 'A·B·C단계' },
      { group: 'I. 삼각비', name: '02. 삼각비의 활용', pages: [30, 53], problems: 156, types: 21, step: 'A·B·C단계' },
      { group: 'II. 원의 성질', name: '03. 원과 직선', pages: [56, 81], problems: 168, types: 22, step: 'A·B·C단계' },
      { group: 'II. 원의 성질', name: '04. 원주각', pages: [82, 107], problems: 172, types: 23, step: 'A·B·C단계' },
      { group: 'II. 원의 성질', name: '05. 원주각의 활용', pages: [108, 129], problems: 136, types: 18, step: 'A·B·C단계' },
      { group: 'III. 통계', name: '06. 대푯값과 산포도', pages: [132, 155], problems: 138, types: 19, step: 'A·B·C단계' },
      { group: 'III. 통계', name: '07. 상관관계', pages: [156, 176], problems: 102, types: 14, step: 'A·B·C단계' },
    ]),
  },

  // ==========================================
  // 2. 신사고 쎈 (SSEN) 고등 시리즈
  // ==========================================
  {
    id: 'ssen-h-common1',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '고등',
    title: '쎈 고등 공통수학1',
    curriculum: '2022 개정',
    course: '공통수학1',
    total_pages: 232,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,338문항 · 184개 유형 (행렬 포함)',
    units: buildSequentialUnits([
      { group: 'I. 다항식', name: '01. 다항식의 연산', pages: [8, 25], problems: 120, types: 16, step: 'A·B·C단계' },
      { group: 'I. 다항식', name: '02. 나머지정리와 인수분해', pages: [26, 51], problems: 168, types: 22, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '03. 복소수', pages: [54, 73], problems: 132, types: 17, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '04. 이차방정식', pages: [74, 95], problems: 140, types: 19, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '05. 이차방정식과 이차함수', pages: [96, 117], problems: 142, types: 19, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '06. 여러 가지 방정식', pages: [118, 139], problems: 136, types: 19, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '07. 일차부등식', pages: [140, 155], problems: 98, types: 14, step: 'A·B·C단계' },
      { group: 'II. 방정식과 부등식', name: '08. 이차부등식', pages: [156, 181], problems: 158, types: 22, step: 'A·B·C단계' },
      { group: 'III. 경우의 수', name: '09. 순열과 조합', pages: [184, 209], problems: 146, types: 21, step: 'A·B·C단계' },
      { group: 'IV. 행렬', name: '10. 행렬과 그 연산', pages: [212, 232], problems: 98, types: 15, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-h-common2',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '고등',
    title: '쎈 고등 공통수학2',
    curriculum: '2022 개정',
    course: '공통수학2',
    total_pages: 224,
    description: 'A·B·C 3단계 수준별 학습 · 총 1,290문항 · 176개 유형',
    units: buildSequentialUnits([
      { group: 'I. 도형의 방정식', name: '01. 평면좌표', pages: [8, 25], problems: 116, types: 16, step: 'A·B·C단계' },
      { group: 'I. 도형의 방정식', name: '02. 직선의 방정식', pages: [26, 47], problems: 138, types: 19, step: 'A·B·C단계' },
      { group: 'I. 도형의 방정식', name: '03. 원의 방정식', pages: [48, 73], problems: 164, types: 22, step: 'A·B·C단계' },
      { group: 'I. 도형의 방정식', name: '04. 도형의 이동', pages: [74, 95], problems: 132, types: 18, step: 'A·B·C단계' },
      { group: 'II. 집합과 명제', name: '05. 집합의 뜻과 표현', pages: [98, 115], problems: 112, types: 15, step: 'A·B·C단계' },
      { group: 'II. 집합과 명제', name: '06. 집합의 연산', pages: [116, 139], problems: 146, types: 20, step: 'A·B·C단계' },
      { group: 'II. 집합과 명제', name: '07. 명제', pages: [140, 167], problems: 168, types: 23, step: 'A·B·C단계' },
      { group: 'III. 함수와 그래프', name: '08. 함수', pages: [170, 193], problems: 148, types: 20, step: 'A·B·C단계' },
      { group: 'III. 함수와 그래프', name: '09. 유리함수와 무리함수', pages: [194, 224], problems: 166, types: 23, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-h-algebra',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '고등',
    title: '쎈 고등 대수 (구 수학I)',
    curriculum: '2022 개정',
    course: '대수',
    total_pages: 216,
    description: '지수·로그·삼각함수·수열 · 총 1,246문항 · 171개 유형',
    units: buildSequentialUnits([
      { group: 'I. 지수함수와 로그함수', name: '01. 지수', pages: [8, 27], problems: 132, types: 18, step: 'A·B·C단계' },
      { group: 'I. 지수함수와 로그함수', name: '02. 로그', pages: [28, 49], problems: 144, types: 19, step: 'A·B·C단계' },
      { group: 'I. 지수함수와 로그함수', name: '03. 지수함수', pages: [50, 73], problems: 148, types: 20, step: 'A·B·C단계' },
      { group: 'I. 지수함수와 로그함수', name: '04. 로그함수', pages: [74, 99], problems: 156, types: 22, step: 'A·B·C단계' },
      { group: 'II. 삼각함수', name: '05. 삼각함수', pages: [102, 123], problems: 136, types: 19, step: 'A·B·C단계' },
      { group: 'II. 삼각함수', name: '06. 삼각함수의 그래프', pages: [124, 149], problems: 152, types: 21, step: 'A·B·C단계' },
      { group: 'II. 삼각함수', name: '07. 삼각함수의 활용', pages: [150, 169], problems: 120, types: 17, step: 'A·B·C단계' },
      { group: 'III. 수열', name: '08. 등차수열과 등비수열', pages: [172, 195], problems: 146, types: 20, step: 'A·B·C단계' },
      { group: 'III. 수열', name: '09. 수열의 합과 수학적 귀납법', pages: [196, 216], problems: 112, types: 15, step: 'A·B·C단계' },
    ]),
  },
  {
    id: 'ssen-h-calc1',
    series: '쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '고등',
    title: '쎈 고등 미적분I (구 수학II)',
    curriculum: '2022 개정',
    course: '미적분I',
    total_pages: 208,
    description: '함수의 극한·다항함수 미적분 · 총 1,180문항 · 162개 유형',
    units: buildSequentialUnits([
      { group: 'I. 함수의 극한과 연속', name: '01. 함수의 극한', pages: [8, 31], problems: 146, types: 20, step: 'A·B·C단계' },
      { group: 'I. 함수의 극한과 연속', name: '02. 함수의 연속', pages: [32, 53], problems: 124, types: 17, step: 'A·B·C단계' },
      { group: 'II. 미분', name: '03. 미분계수와 도함수', pages: [56, 79], problems: 142, types: 19, step: 'A·B·C단계' },
      { group: 'II. 미분', name: '04. 도함수의 활용 (1)', pages: [80, 103], problems: 138, types: 19, step: 'A·B·C단계' },
      { group: 'II. 미분', name: '05. 도함수의 활용 (2)', pages: [104, 129], problems: 154, types: 21, step: 'A·B·C단계' },
      { group: 'II. 미분', name: '06. 도함수의 활용 (3)', pages: [130, 151], problems: 128, types: 18, step: 'A·B·C단계' },
      { group: 'III. 적분', name: '07. 부정적분과 정적분', pages: [154, 181], problems: 176, types: 24, step: 'A·B·C단계' },
      { group: 'III. 적분', name: '08. 정적분의 활용', pages: [182, 208], problems: 172, types: 24, step: 'A·B·C단계' },
    ]),
  },

  // ==========================================
  // 3. 개념원리 (개념서) 시리즈
  // ==========================================
  {
    id: 'concept-m1-1',
    series: '개념원리',
    publisher: '개념원리',
    category: '개념서',
    gradeGroup: '중등',
    title: '개념원리 중학 수학 1-1',
    curriculum: '2022 개정',
    course: '중1 1학기',
    total_pages: 248,
    description: '개념원리 이해 · 필수예제 · 확인체크 · 단원 연습문제 · 총 640문항',
    units: buildSequentialUnits([
      { group: 'I. 소인수분해', name: '01. 소인수분해', pages: [8, 29], problems: 68, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'I. 소인수분해', name: '02. 최대공약수와 최소공배수', pages: [30, 55], problems: 74, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'II. 정수와 유리수', name: '01. 정수와 유리수', pages: [58, 85], problems: 78, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'II. 정수와 유리수', name: '02. 정수와 유리수의 계산', pages: [86, 125], problems: 108, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'III. 문자와 식', name: '01. 문자의 사용과 식의 계산', pages: [128, 157], problems: 86, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'III. 문자와 식', name: '02. 일차방정식의 풀이', pages: [158, 183], problems: 76, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'III. 문자와 식', name: '03. 일차방정식의 활용', pages: [184, 207], problems: 66, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'IV. 좌표평면과 그래프', name: '01. 좌표평면과 그래프', pages: [210, 227], problems: 42, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
      { group: 'IV. 좌표평면과 그래프', name: '02. 정비례와 반비례', pages: [228, 248], problems: 42, step: '개념원리 확인하기 · 핵심문제 · 연습문제' },
    ], false),
  },
  {
    id: 'concept-m2-1',
    series: '개념원리',
    publisher: '개념원리',
    category: '개념서',
    gradeGroup: '중등',
    title: '개념원리 중학 수학 2-1',
    curriculum: '2022 개정',
    course: '중2 1학기',
    total_pages: 240,
    description: '개념원리 이해 · 핵심문제 · 확인체크 · 연습문제 · 총 662문항',
    units: buildSequentialUnits([
      { group: 'I. 유리수와 순환소수', name: '01. 유리수와 순환소수', pages: [8, 33], problems: 76, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'II. 식의 계산', name: '01. 단항식의 계산', pages: [36, 59], problems: 72, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'II. 식의 계산', name: '02. 다항식의 계산', pages: [60, 87], problems: 84, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'III. 일차부등식과 연립일차방정식', name: '01. 일차부등식', pages: [90, 121], problems: 92, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'III. 일차부등식과 연립일차방정식', name: '02. 연립일차방정식', pages: [122, 165], problems: 124, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'IV. 일차함수', name: '01. 일차함수와 그 그래프', pages: [168, 209], problems: 118, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'IV. 일차함수', name: '02. 일차함수와 일차방정식의 관계', pages: [210, 240], problems: 96, step: '개념확인 · 핵심문제 · 연습문제' },
    ], false),
  },
  {
    id: 'concept-m3-1',
    series: '개념원리',
    publisher: '개념원리',
    category: '개념서',
    gradeGroup: '중등',
    title: '개념원리 중학 수학 3-1',
    curriculum: '2022 개정',
    course: '중3 1학기',
    total_pages: 256,
    description: '개념원리 이해 · 핵심문제 · 확인체크 · 연습문제 · 총 694문항',
    units: buildSequentialUnits([
      { group: 'I. 실수와 그 연산', name: '01. 제곱근과 실수', pages: [8, 39], problems: 94, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'I. 실수와 그 연산', name: '02. 근호를 포함한 식의 계산', pages: [40, 73], problems: 96, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '01. 다항식의 곱셈', pages: [76, 103], problems: 82, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '02. 다항식의 인수분해', pages: [104, 137], problems: 98, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'III. 이차방정식', name: '01. 이차방정식의 풀이', pages: [140, 171], problems: 92, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'III. 이차방정식', name: '02. 이차방정식의 활용', pages: [172, 197], problems: 78, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'IV. 이차함수', name: '01. 이차함수와 그 그래프', pages: [200, 231], problems: 84, step: '개념확인 · 핵심문제 · 연습문제' },
      { group: 'IV. 이차함수', name: '02. 이차함수 y=ax²+bx+c의 그래프', pages: [232, 256], problems: 70, step: '개념확인 · 핵심문제 · 연습문제' },
    ], false),
  },
  {
    id: 'concept-h-common1',
    series: '개념원리',
    publisher: '개념원리',
    category: '개념서',
    gradeGroup: '고등',
    title: '개념원리 고등 공통수학1',
    curriculum: '2022 개정',
    course: '공통수학1',
    total_pages: 336,
    description: '필수예제 + 확인체크 + 연습문제(A·B·실력Up) · 총 780문항',
    units: buildSequentialUnits([
      { group: 'I. 다항식', name: '01. 다항식의 연산', pages: [10, 35], problems: 62, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'I. 다항식', name: '02. 항등식과 나머지정리', pages: [36, 59], problems: 58, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'I. 다항식', name: '03. 인수분해', pages: [60, 85], problems: 64, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 방정식과 부등식', name: '01. 복소수', pages: [88, 113], problems: 60, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 방정식과 부등식', name: '02. 이차방정식', pages: [114, 141], problems: 68, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 방정식과 부등식', name: '03. 이차방정식과 이차함수', pages: [142, 169], problems: 66, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 방정식과 부등식', name: '04. 여러 가지 방정식', pages: [170, 201], problems: 74, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 방정식과 부등식', name: '05. 여러 가지 부등식', pages: [202, 249], problems: 112, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'III. 경우의 수', name: '01. 경우의 수와 순열', pages: [252, 281], problems: 72, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'III. 경우의 수', name: '02. 조합', pages: [282, 305], problems: 60, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'IV. 행렬', name: '01. 행렬과 그 연산', pages: [308, 336], problems: 84, step: '필수예제 · 확인체크 · 연습문제' },
    ], false),
  },
  {
    id: 'concept-h-common2',
    series: '개념원리',
    publisher: '개념원리',
    category: '개념서',
    gradeGroup: '고등',
    title: '개념원리 고등 공통수학2',
    curriculum: '2022 개정',
    course: '공통수학2',
    total_pages: 312,
    description: '필수예제 + 확인체크 + 연습문제(A·B·실력Up) · 총 732문항',
    units: buildSequentialUnits([
      { group: 'I. 도형의 방정식', name: '01. 평면좌표', pages: [10, 35], problems: 60, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'I. 도형의 방정식', name: '02. 직선의 방정식', pages: [36, 65], problems: 72, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'I. 도형의 방정식', name: '03. 원의 방정식', pages: [66, 101], problems: 86, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'I. 도형의 방정식', name: '04. 도형의 이동', pages: [102, 129], problems: 68, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 집합과 명제', name: '01. 집합의 뜻과 포함 관계', pages: [132, 155], problems: 58, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 집합과 명제', name: '02. 집합의 연산', pages: [156, 185], problems: 74, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'II. 집합과 명제', name: '03. 명제', pages: [186, 227], problems: 96, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'III. 함수', name: '01. 함수', pages: [230, 267], problems: 92, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'III. 함수', name: '02. 유리함수', pages: [268, 291], problems: 66, step: '필수예제 · 확인체크 · 연습문제' },
      { group: 'III. 함수', name: '03. 무리함수', pages: [292, 312], problems: 60, step: '필수예제 · 확인체크 · 연습문제' },
    ], false),
  },

  // ==========================================
  // 4. 개념원리 RPM (유형서) 시리즈
  // ==========================================
  {
    id: 'rpm-m2-1',
    series: 'RPM',
    publisher: '개념원리',
    category: '유형서',
    gradeGroup: '중등',
    title: '개념원리 RPM 중학 수학 2-1',
    curriculum: '2022 개정',
    course: '중2 1학기',
    total_pages: 184,
    description: '교과서 문제 정복 · 유형 익히기 · 시험에 꼭 나오는 문제 · 총 1,092문항',
    units: buildSequentialUnits([
      { group: 'I. 유리수와 순환소수', name: '01. 유리수와 순환소수', pages: [8, 25], problems: 128, types: 17, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'II. 식의 계산', name: '02. 단항식의 계산', pages: [26, 41], problems: 112, types: 15, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'II. 식의 계산', name: '03. 다항식의 계산', pages: [42, 59], problems: 120, types: 16, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 일차부등식과 연립방정식', name: '04. 일차부등식', pages: [62, 77], problems: 108, types: 14, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 일차부등식과 연립방정식', name: '05. 일차부등식의 활용', pages: [78, 93], problems: 96, types: 14, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 일차부등식과 연립방정식', name: '06. 연립일차방정식', pages: [94, 111], problems: 124, types: 17, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 일차부등식과 연립방정식', name: '07. 연립일차방정식의 활용', pages: [112, 129], problems: 112, types: 16, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'IV. 일차함수', name: '08. 일차함수와 그 그래프', pages: [132, 159], problems: 164, types: 22, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'IV. 일차함수', name: '09. 일차함수와 일차방정식의 관계', pages: [160, 184], problems: 128, types: 18, step: '교과서정복 · 유형익히기 · 시험필수' },
    ]),
  },
  {
    id: 'rpm-m3-1',
    series: 'RPM',
    publisher: '개념원리',
    category: '유형서',
    gradeGroup: '중등',
    title: '개념원리 RPM 중학 수학 3-1',
    curriculum: '2022 개정',
    course: '중3 1학기',
    total_pages: 192,
    description: '교과서 문제 정복 · 유형 익히기 · 시험에 꼭 나오는 문제 · 총 1,148문항',
    units: buildSequentialUnits([
      { group: 'I. 실수와 그 연산', name: '01. 제곱근과 실수', pages: [8, 29], problems: 152, types: 20, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'I. 실수와 그 연산', name: '02. 근호를 포함한 식의 계산', pages: [30, 53], problems: 164, types: 22, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '03. 다항식의 곱셈', pages: [56, 75], problems: 136, types: 18, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '04. 인수분해', pages: [76, 99], problems: 158, types: 21, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 이차방정식', name: '05. 이차방정식의 풀이', pages: [102, 123], problems: 146, types: 19, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'III. 이차방정식', name: '06. 이차방정식의 활용', pages: [124, 143], problems: 126, types: 18, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'IV. 이차함수', name: '07. 이차함수와 그 그래프', pages: [146, 169], problems: 142, types: 19, step: '교과서정복 · 유형익히기 · 시험필수' },
      { group: 'IV. 이차함수', name: '08. 이차함수 y=ax²+bx+c의 그래프', pages: [170, 192], problems: 124, types: 17, step: '교과서정복 · 유형익히기 · 시험필수' },
    ]),
  },
  {
    id: 'rpm-h-common1',
    series: 'RPM',
    publisher: '개념원리',
    category: '유형서',
    gradeGroup: '고등',
    title: '개념원리 RPM 고등 공통수학1',
    curriculum: '2022 개정',
    course: '공통수학1',
    total_pages: 196,
    description: '핵심 유형 익히기 · 시험에 꼭 나오는 문제 · 총 1,164문항 · 162개 유형',
    units: buildSequentialUnits([
      { group: 'I. 다항식', name: '01. 다항식의 연산', pages: [8, 21], problems: 96, types: 13, step: '유형익히기 · 시험필수' },
      { group: 'I. 다항식', name: '02. 항등식과 나머지정리', pages: [22, 37], problems: 108, types: 15, step: '유형익히기 · 시험필수' },
      { group: 'I. 다항식', name: '03. 인수분해', pages: [38, 53], problems: 106, types: 15, step: '유형익히기 · 시험필수' },
      { group: 'II. 방정식과 부등식', name: '04. 복소수', pages: [56, 71], problems: 104, types: 14, step: '유형익히기 · 시험필수' },
      { group: 'II. 방정식과 부등식', name: '05. 이차방정식', pages: [72, 89], problems: 116, types: 16, step: '유형익히기 · 시험필수' },
      { group: 'II. 방정식과 부등식', name: '06. 이차방정식과 이차함수', pages: [90, 107], problems: 114, types: 16, step: '유형익히기 · 시험필수' },
      { group: 'II. 방정식과 부등식', name: '07. 여러 가지 방정식', pages: [108, 125], problems: 112, types: 16, step: '유형익히기 · 유형Up · 시험필수' },
      { group: 'II. 방정식과 부등식', name: '08. 여러 가지 부등식', pages: [126, 151], problems: 158, types: 22, step: '유형익히기 · 유형Up · 시험필수' },
      { group: 'III. 경우의 수', name: '09. 경우의 수와 순열', pages: [154, 169], problems: 96, types: 13, step: '유형익히기 · 시험필수' },
      { group: 'III. 경우의 수', name: '10. 조합', pages: [170, 181], problems: 74, types: 11, step: '유형익히기 · 시험필수' },
      { group: 'IV. 행렬', name: '11. 행렬', pages: [184, 196], problems: 80, types: 11, step: '유형익히기 · 시험필수' },
    ]),
  },

  // ==========================================
  // 5. 라이트쎈 (Light SSEN) 시리즈
  // ==========================================
  {
    id: 'light-ssen-m2-1',
    series: '라이트쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '중등',
    title: '라이트쎈 중등 수학 2-1',
    curriculum: '2022 개정',
    course: '중2 1학기',
    total_pages: 192,
    description: '수학이 쉬워지는 기본 유형서 · A·B단계 집중 구성 · 총 1,140문항 · 146개 유형',
    units: buildSequentialUnits([
      { group: 'I. 수와 식의 계산', name: '01. 유리수와 순환소수', pages: [8, 23], problems: 114, types: 15, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'I. 수와 식의 계산', name: '02. 단항식의 계산', pages: [24, 37], problems: 102, types: 13, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'I. 수와 식의 계산', name: '03. 다항식의 계산', pages: [38, 53], problems: 108, types: 14, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'II. 부등식과 연립방정식', name: '04. 일차부등식', pages: [56, 71], problems: 106, types: 13, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'II. 부등식과 연립방정식', name: '05. 일차부등식의 활용', pages: [72, 85], problems: 92, types: 13, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'II. 부등식과 연립방정식', name: '06. 연립일차방정식', pages: [86, 103], problems: 118, types: 15, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'II. 부등식과 연립방정식', name: '07. 연립일차방정식의 활용', pages: [104, 121], problems: 110, types: 15, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'III. 일차함수', name: '08. 일차함수와 그래프 (1)', pages: [124, 143], problems: 124, types: 15, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'III. 일차함수', name: '09. 일차함수와 그래프 (2)', pages: [144, 161], problems: 112, types: 14, step: 'A단계 기본 · B단계 유형 · 마무리' },
      { group: 'III. 일차함수', name: '10. 일차함수와 일차방정식의 관계', pages: [162, 192], problems: 154, types: 19, step: 'A단계 기본 · B단계 유형 · 마무리' },
    ]),
  },
  {
    id: 'light-ssen-h-common1',
    series: '라이트쎈',
    publisher: '좋은책신사고',
    category: '유형서',
    gradeGroup: '고등',
    title: '라이트쎈 고등 공통수학1',
    curriculum: '2022 개정',
    course: '공통수학1',
    total_pages: 208,
    description: '기본~중상 난이도 집중 유형서 · 총 1,196문항 · 154개 유형',
    units: buildSequentialUnits([
      { group: 'I. 다항식', name: '01. 다항식의 연산', pages: [8, 23], problems: 108, types: 14, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'I. 다항식', name: '02. 나머지정리와 인수분해', pages: [24, 47], problems: 150, types: 19, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '03. 복소수', pages: [50, 67], problems: 118, types: 15, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '04. 이차방정식', pages: [68, 87], problems: 126, types: 16, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '05. 이차방정식과 이차함수', pages: [88, 107], problems: 128, types: 16, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '06. 여러 가지 방정식', pages: [108, 127], problems: 120, types: 16, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '07. 일차부등식', pages: [128, 141], problems: 88, types: 12, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'II. 방정식과 부등식', name: '08. 이차부등식', pages: [142, 165], problems: 142, types: 18, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'III. 경우의 수', name: '09. 순열과 조합', pages: [168, 191], problems: 130, types: 17, step: 'A단계 · B단계 · 대단원 마무리' },
      { group: 'IV. 행렬', name: '10. 행렬과 그 연산', pages: [194, 208], problems: 86, types: 11, step: 'A단계 · B단계 · 대단원 마무리' },
    ]),
  },

  // ==========================================
  // 6. 마플시너지 & 일품 (내신 다문항 / 심화서)
  // ==========================================
  {
    id: 'mapl-h-common1',
    series: '마플시너지',
    publisher: '희망에듀',
    category: '유형서',
    gradeGroup: '고등',
    title: '마플시너지 공통수학1',
    curriculum: '2022 개정',
    course: '공통수학1',
    total_pages: 392,
    description: '내신 대비 고밀도 기출 유형서 · 총 1,920문항 · 232개 유형 (서술형·1등급 포함)',
    units: buildSequentialUnits([
      { group: 'I. 다항식', name: '01. 다항식의 연산', pages: [10, 43], problems: 182, types: 22, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'I. 다항식', name: '02. 항등식과 나머지정리', pages: [44, 83], problems: 210, types: 25, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'I. 다항식', name: '03. 인수분해', pages: [84, 119], problems: 186, types: 22, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'II. 방정식과 부등식', name: '04. 복소수', pages: [122, 157], problems: 188, types: 22, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'II. 방정식과 부등식', name: '05. 이차방정식', pages: [158, 195], problems: 196, types: 24, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'II. 방정식과 부등식', name: '06. 이차방정식과 이차함수', pages: [196, 235], problems: 204, types: 25, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'II. 방정식과 부등식', name: '07. 여러 가지 방정식', pages: [236, 273], problems: 192, types: 23, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'II. 방정식과 부등식', name: '08. 여러 가지 부등식', pages: [274, 323], problems: 248, types: 30, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'III. 경우의 수', name: '09. 순열과 조합', pages: [326, 365], problems: 194, types: 24, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
      { group: 'IV. 행렬', name: '10. 행렬과 그 연산', pages: [368, 392], problems: 120, types: 15, step: '베이직 · 노멀 · 터프 · 서술형 · 1등급' },
    ]),
  },
  {
    id: 'ilpum-m2-1',
    series: '일품',
    publisher: '좋은책신사고',
    category: '심화서',
    gradeGroup: '중등',
    title: '일품 중등 수학 2-1',
    curriculum: '2022 개정',
    course: '중2 1학기',
    total_pages: 128,
    description: '내신 만점 대비 고난도 문제집 · 핵심 기출 + 최고수준 문제 · 총 584문항',
    units: buildSequentialUnits([
      { group: 'I. 수와 식의 계산', name: '01. 유리수와 순환소수', pages: [8, 23], problems: 76, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'I. 수와 식의 계산', name: '02. 단항식과 다항식의 계산', pages: [24, 45], problems: 102, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'II. 부등식과 연립방정식', name: '03. 일차부등식', pages: [48, 69], problems: 98, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'II. 부등식과 연립방정식', name: '04. 연립일차방정식', pages: [70, 95], problems: 118, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'III. 일차함수', name: '05. 일차함수와 그 그래프', pages: [98, 115], problems: 104, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'III. 일차함수', name: '06. 일차함수와 일차방정식의 관계', pages: [116, 128], problems: 86, step: '개념&핵심기출 · 만점도전 · 최고수준' },
    ], false),
  },
  {
    id: 'ilpum-m3-1',
    series: '일품',
    publisher: '좋은책신사고',
    category: '심화서',
    gradeGroup: '중등',
    title: '일품 중등 수학 3-1',
    curriculum: '2022 개정',
    course: '중3 1학기',
    total_pages: 136,
    description: '내신 만점 대비 고난도 문제집 · 핵심 기출 + 최고수준 문제 · 총 620문항',
    units: buildSequentialUnits([
      { group: 'I. 실수와 그 연산', name: '01. 제곱근과 실수', pages: [8, 25], problems: 84, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'I. 실수와 그 연산', name: '02. 근호를 포함한 식의 계산', pages: [26, 43], problems: 86, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'II. 다항식의 곱셈과 인수분해', name: '03. 다항식의 곱셈과 인수분해', pages: [46, 69], problems: 112, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'III. 이차방정식', name: '04. 이차방정식', pages: [72, 99], problems: 124, step: '개념&핵심기출 · 만점도전 · 최고수준' },
      { group: 'IV. 이차함수', name: '05. 이차함수와 그 그래프', pages: [102, 136], problems: 214, step: '개념&핵심기출 · 만점도전 · 최고수준' },
    ], false),
  },
];

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
