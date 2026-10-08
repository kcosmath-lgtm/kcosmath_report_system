export const OCR_MODEL = "gemini-3.1-flash-lite";
export type ExamTable = { caption: string; rows: string[][] };
export type ExamProblem = {
  id: string; number: string; points: string; question: string;
  boxContent: string; choices: string[]; sourcePage?: number;
  figure?: string; review?: string; tables?: ExamTable[];
};
export type ExamDocument = { title: string; problems: ExamProblem[]; perPage: number; brandImage?: string; problemHeights?: Record<string, number> };
export const choiceLabels = ["①", "②", "③", "④", "⑤"];
export type TextPart = { math: boolean; display: boolean; value: string };

// The same tokenizer feeds the screen and both editable document exporters.
export function splitMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  let end = 0;
  for (const match of text.matchAll(re)) {
    if (match.index! > end) parts.push({ math: false, display: false, value: text.slice(end, match.index) });
    parts.push({ math: true, display: match[1] !== undefined, value: match[1] ?? match[2] });
    end = match.index! + match[0].length;
  }
  if (end < text.length) parts.push({ math: false, display: false, value: text.slice(end) });
  return parts;
}
export function repairMath(text: string): string {
  const repaired = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => '$' + math + '$').replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => '$$' + math + '$$');
  return !repaired.includes('$') && /\\[a-zA-Z]+/.test(repaired) && !/[가-힣]/.test(repaired) ? '$' + repaired.trim() + '$' : repaired;
}
export function normalizeTables(value: unknown): ExamTable[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6) throw new Error("문항의 표는 최대 6개까지 지원합니다.");
  return value.map(table => {
    if (!table || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 20) throw new Error("표는 1~20행으로 입력해 주세요.");
    const width = table.rows[0]?.length;
    if (!width || width > 10 || table.rows.some((row: unknown) => !Array.isArray(row) || row.length !== width || row.some(cell => typeof cell !== "string" || cell.length > 2000))) throw new Error("표는 같은 열 수를 가진 1~10열의 문자열 셀로 입력해 주세요.");
    return { caption: typeof table.caption === "string" ? table.caption.slice(0, 150) : "", rows: table.rows.map((row: string[]) => row.map(repairMath)) };
  });
}
export function normalizeProblems(value: unknown, sourcePage?: number): ExamProblem[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('문항 목록 형식을 확인해 주세요.');
  return value.map((item, i) => {
    if (!item || typeof item !== 'object' || typeof item.question !== 'string' || !item.question.trim()) throw new Error('문항 본문을 확인해 주세요.');
    const text = (v: unknown, max = 20000) => typeof v === 'string' ? v.slice(0, max) : '';
    const number = text(item.number, 30) || String(i + 1);
    const question = repairMath(text(item.question).replace(/^\s*(\d+)[.)]\s*/, (prefix, n) => n === number ? '' : prefix));
    const warning = '본문이 매우 짧습니다. 문장 조각을 문항으로 인식했는지 원본과 확인해 주세요.';
    const review = [text(item.review, 1000), question.trim().length < 12 && !item.choices?.length && !item.tables?.length && !text(item.review).includes(warning) ? warning : ''].filter(Boolean).join(' / ');
    return { id: crypto.randomUUID(), number, points: text(item.points, 30), question,
      boxContent: repairMath(text(item.boxContent).replace(/^\s*(?:[〈<＜]\s*)?보기(?:\s*[〉>＞])?\s*\n?/, '')),
      choices: Array.isArray(item.choices) ? item.choices.slice(0, 5).map((v: unknown) => repairMath(text(v).replace(/^\s*[①②③④⑤]\s*/, ''))) : [], sourcePage, review, tables: normalizeTables(item.tables) };
  });
}
export const COLUMN_HEIGHT = 970;
export function examPages(problems: ExamProblem[], perPage: number, heights: Record<string, number> = {}) {
  const size = [2, 4, 6].includes(perPage) ? perPage : 4;
  const pages: { left: ExamProblem[]; right: ExamProblem[]; capacity: number }[] = [];
  for (let offset = 0; offset < problems.length;) {
    let capacity = size;
    while (capacity > 2 && problems.slice(offset, offset + capacity).some(p => (heights[p.id] ?? 0) > COLUMN_HEIGHT / (capacity / 2))) capacity -= 2;
    const page = problems.slice(offset, offset + capacity);
    pages.push({ left: page.slice(0, capacity / 2), right: page.slice(capacity / 2), capacity });
    offset += capacity;
  }
  return pages;
}
export const sampleProblems: Omit<ExamProblem, "id">[] = [
  { number: "1", points: "2점", question: "$\\sqrt[3]{5} \\times 25^{\\frac{1}{3}}$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "2", points: "2점", question: "함수 $f(x)=x^3-5x+7$에 대하여 $\\lim_{h \\to 0} \\frac{f(2+h)-f(2)}{h}$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "3", points: "3점", question: "첫째항과 공비가 모두 양수 $k$인 등비수열 $\\{a_n\\}$이\n$$\\frac{a_4}{a_2}+\\frac{a_3}{a_1}=30$$\n을 만족시킬 때, $k$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "4", points: "3점", question: "함수\n$$f(x)=\\begin{cases}5x+a & (x<-2) \\\\ x^2-a & (x\\ge -2)\\end{cases}$$\n가 실수 전체의 집합에서 연속일 때, 상수 $a$의 값은?", boxContent: "", choices: ["6", "7", "8", "9", "10"] },
];
