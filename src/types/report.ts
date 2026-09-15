export interface ReportData {
  date: string;
  type: "정규" | "보충" | "";
  teacher: string;
  name: string;
  subject: string;
  grade: string;
  book: string;
  attendance: string;
  time: string;
  status: string;
  reason: string;
  progress: string;
  hwLast: string;
  hwCurrent: string;
  notes: string;
}

export interface ReportStudent {
  id: string;
  name: string;
  grade: string;
  group: string;
  classId: string;
}

export interface LessonRecord {
  id: string;
  class_id: string;
  report_date: string;
  common_data: Partial<ReportData>;
  version: number;
}

export interface ReportRecord {
  id: string;
  lesson_id: string;
  student_id: string;
  snapshot: ReportData & { group: string; classId: string };
  version: number;
}
