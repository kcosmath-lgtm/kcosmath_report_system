import type { MathGeoSpec } from "../lib/math-geometry-engine";

export type ExamResource = {
  kind: string;
  url: string;
  localPath?: string;
  bytes?: number;
  sha256?: string;
  error?: string;
};

export type MockExam = {
  id: string;
  grade: number;
  year: number;
  month: number;
  title: string;
  subject: string;
  source: string;
  resources: ExamResource[];
};

export type MockExamCatalog = {
  checkedAt: string;
  requestedYears: { from: number; to: number };
  coverage: { grade: number; expected: number; collected: number }[];
  exams: MockExam[];
};

export type MockExamProblemToken = {
  id: string;
  tokenId?: string;
  examId: string;
  grade: number;
  year: number;
  month: number;
  examTitle: string;
  subject: string;
  unit: string;
  intent?: string;
  difficulty: "하" | "중" | "상" | "킬러";
  number: string;
  points: string;
  sourceLabel: string;
  title: string;
  question: string;
  boxLayout?: "box" | "inline" | "none";
  boxContent: string;
  choices: string[];
  figureUrl?: string;
  geoSpec?: MathGeoSpec;
  answer: string;
  solution: string;
  problemPdfUrl?: string;
  explanationPdfUrl?: string;
  createdAt?: string;
};

export type MockExamProblemStore = {
  updatedAt: string;
  extractedExams: Record<
    string,
    {
      id: string;
      grade: number;
      year: number;
      month: number;
      title: string;
      subject: string;
      problemCount: number;
      extractedAt: string;
    }
  >;
  problems: MockExamProblemToken[];
};
