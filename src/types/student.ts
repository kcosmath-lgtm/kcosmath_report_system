export interface Student {
  id: string;
  name: string;
  grade: string;
  version: number;
}

export interface StudentGroup {
  id: string;
  group: string;
  students: Student[];
}
