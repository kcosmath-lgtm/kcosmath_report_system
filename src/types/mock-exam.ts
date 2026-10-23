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
