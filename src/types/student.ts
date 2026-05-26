export interface Student {
  id: string;
  name: string;
  grade: string;
}

export interface StudentGroup {
  group: string;
  students: Student[];
}