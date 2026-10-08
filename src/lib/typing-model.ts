export const OCR_MODEL = "gemini-3.1-flash-lite";
export type FigureBox = [number, number, number, number];
export type ExamTable = { caption: string; rows: string[][] };
export type ChoiceFigure = { figure?: string; figureBox?: FigureBox; figureSourceId?: string };
export type ExamProblem = {
  id: string; number: string; points: string; question: string;
  boxContent: string; choices: string[]; sourcePage?: number;
  figure?: string; figureBox?: FigureBox; figureSourceId?: string; review?: string; tables?: ExamTable[];
  choiceLayout?: "auto" | "rows" | "grid";
  choiceFigures?: ChoiceFigure[];
};
export type ExamDocument = { title: string; problems: ExamProblem[]; perPage: number; choiceColumns?: Record<string, number>; brandImage?: string; problemHeights?: Record<string, number> };
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
export function hasProseChoices(choices: string[]): boolean {
  return choices.some(choice => {
    const prose = choice.replace(/\\[a-zA-Z]+/g, " ");
    return /[가-힣]{2,}|\b[A-Za-z]{3,}\b/.test(prose);
  });
}
export function choiceRowsEnabled(problem: Pick<ExamProblem, "choices" | "choiceLayout">): boolean {
  return problem.choiceLayout === "rows" || (problem.choiceLayout !== "grid" && hasProseChoices(problem.choices));
}
export function hasStatementChoices(choices: string[]): boolean {
  const values = choices.map(choice => choice.replace(/\$/g, "").trim()).filter(Boolean);
  return values.length > 0 && values.every(choice => /^[ㄱㄴㄷㄹㅁ\s,·ㆍ、.]+$/.test(choice));
}
export function repairMath(text: string): string {
  const repaired = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => '$' + math + '$').replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => '$$' + math + '$$');
  return !repaired.includes('$') && /\\[a-zA-Z]+/.test(repaired) && !/[가-힣]/.test(repaired) ? '$' + repaired.trim() + '$' : repaired;
}
export function formatTableCell(text: string): string {
  const value = repairMath(text).trim();
  if (!value || value.includes("$")) return value;
  if (/^[+-]?\d+(?:\.\d+)?\s*\/\s*[+-]?\d+(?:\.\d+)?$/.test(value)) {
    const [a, b] = value.split("/").map(s => s.trim());
    return `$\\frac{${a}}{${b}}$`;
  }
  return /^(?:[+-]?\d+(?:\.\d+)?|[A-Za-z]|[\dA-Za-z\s+−×÷=<>^_{}().-]*\d[\dA-Za-z\s+−×÷=<>^_{}().-]*)$/.test(value) && !/[A-Za-z]{2}/.test(value)
    ? `$${value.replace(/×/g, "\\times ").replace(/÷/g, "\\div ").replace(/−/g, "-")}$` : value;
}
export function formatChoiceContent(text: string): string {
  const whole = formatTableCell(text);
  if (whole.startsWith("$") && whole.endsWith("$")) return whole;
  return splitMath(repairMath(text)).map(part => part.math
    ? (part.display ? "$$" : "$") + part.value + (part.display ? "$$" : "$")
    : part.value.replace(/[+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+(?:\.\d+)?)?(?:°|%)?/g, value => value.endsWith("°") || value.endsWith("%")
      ? `$${value.replace(/°/g, "^{\\circ}").replace(/%/g, "\\%")}$` : formatTableCell(value))
  ).join("");
}
// OCR may promote a variable inside Korean prose to a display equation.
export function formatBoxContent(text: string): string {
  const inline = repairMath(text).replace(/\s*\$\$\s*([a-zA-Z](?:_[a-zA-Z0-9]+)?|\\[a-zA-Z]+)\s*\$\$\s*/g, (_, math) => " $" + math + "$ ");
  return inline.replace(/\r\n?/g, "\n").replace(/([^\n])\s+([ㄱㄴㄷㄹㅁ])[.)]\s*/g, "$1\n$2. ").split("\n").reduce<string[]>((lines, line) => {
    const value = line.trim();
    if (!value) return lines;
    if (!lines.length || /^(?:[ㄱㄴㄷㄹㅁ][.)]|[①-⑳]|\d+[.)]|조건\s*\d+[.:])/.test(value) || value.includes("$$") || lines[lines.length - 1].includes("$$")) lines.push(value);
    else lines[lines.length - 1] += " " + value;
    return lines;
  }, []).join("\n");
}
export function normalizeFigureBox(value: unknown): FigureBox | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)) return undefined;
  const box = value.map(Math.round) as FigureBox;
  return box[2] > box[0] && box[3] > box[1] ? box : undefined;
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
    const figureBox = normalizeFigureBox(item.figureBox);
    const choiceFigures: ChoiceFigure[] = Array.from({ length: Math.min(5, Math.max(item.choices?.length ?? 0, item.choiceFigures?.length ?? 0, item.choiceFigureBoxes?.length ?? 0)) }, (_, index) => {
      const existing = item.choiceFigures?.[index];
      return { figure: typeof existing?.figure === "string" && /^data:image\/(png|jpeg);base64,/.test(existing.figure) ? existing.figure : undefined,
        figureBox: normalizeFigureBox(existing?.figureBox ?? item.choiceFigureBoxes?.[index]), figureSourceId: text(existing?.figureSourceId, 100) || undefined };
    });
    const figureWarning = Array.isArray(item.figureBox) && item.figureBox.length && !figureBox ? "그림 위치를 확인하지 못했습니다. 원본에서 영역을 직접 선택해 주세요." : "";
    const warning = '본문이 매우 짧습니다. 문장 조각을 문항으로 인식했는지 원본과 확인해 주세요.';
    const review = [text(item.review, 1000), figureWarning, question.trim().length < 12 && !item.choices?.length && !item.tables?.length && !text(item.review).includes(warning) ? warning : ''].filter(Boolean).join(' / ');
    return { id: crypto.randomUUID(), number, points: text(item.points, 30), question,
      boxContent: repairMath(text(item.boxContent).replace(/^\s*(?:[〈<＜]\s*)?보기(?:\s*[〉>＞])?\s*\n?/, '')),
      choices: Array.from({ length: choiceFigures.length }, (_, index) => repairMath(text(item.choices?.[index]).replace(/^\s*[①②③④⑤]\s*/, ''))), choiceFigures, choiceLayout: item.choiceLayout === "rows" || item.choiceLayout === "grid" ? item.choiceLayout : "auto", sourcePage, review, figureBox, figureSourceId: text(item.figureSourceId, 100) || undefined, tables: normalizeTables(item.tables) };
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
