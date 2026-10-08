export const OCR_MODEL = "gemini-3.1-flash-lite";
export type ExamProblem = {
  id: string; number: string; points: string; question: string;
  boxContent: string; choices: string[]; sourcePage?: number;
  figure?: string; review?: string;
};
export type ExamDocument = { title: string; problems: ExamProblem[]; perPage: number };
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
export function normalizeProblems(value: unknown, sourcePage?: number): ExamProblem[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("문항 목록 형식을 확인해 주세요.");
  return value.map((item, i) => {
    if (!item || typeof item !== "object" || typeof item.question !== "string" || !item.question.trim()) throw new Error(`${i + 1}번 문항 본문을 확인해 주세요.`);
    const text = (v: unknown, max = 20000) => typeof v === "string" ? v.slice(0, max) : "";
    return { id: crypto.randomUUID(), number: text(item.number, 30) || String(i + 1), points: text(item.points, 30),
      question: text(item.question), boxContent: text(item.boxContent), choices: Array.isArray(item.choices) ? item.choices.slice(0, 5).map((v: unknown) => text(v)) : [],
      sourcePage, review: text(item.review, 1000) };
  });
}
export function examPages(problems: ExamProblem[], perPage: number) {
  const size = [2, 4, 6].includes(perPage) ? perPage : 4;
  return Array.from({ length: Math.ceil(problems.length / size) }, (_, i) => {
    const page = problems.slice(i * size, (i + 1) * size);
    // Keep the same column capacity on a partly filled final page.
    return { left: page.slice(0, size / 2), right: page.slice(size / 2) };
  });
}
export const sampleProblems: Omit<ExamProblem, "id">[] = [
  { number: "1", points: "2점", question: "$\\sqrt[3]{5} \\times 25^{\\frac{1}{3}}$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "2", points: "2점", question: "함수 $f(x)=x^3-5x+7$에 대하여 $\\lim_{h \\to 0} \\frac{f(2+h)-f(2)}{h}$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "3", points: "3점", question: "첫째항과 공비가 모두 양수 $k$인 등비수열 $\\{a_n\\}$이\n$$\\frac{a_4}{a_2}+\\frac{a_3}{a_1}=30$$\n을 만족시킬 때, $k$의 값은?", boxContent: "", choices: ["1", "2", "3", "4", "5"] },
  { number: "4", points: "3점", question: "함수\n$$f(x)=\\begin{cases}5x+a & (x<-2) \\\\ x^2-a & (x\\ge -2)\\end{cases}$$\n가 실수 전체의 집합에서 연속일 때, 상수 $a$의 값은?", boxContent: "", choices: ["6", "7", "8", "9", "10"] },
];
