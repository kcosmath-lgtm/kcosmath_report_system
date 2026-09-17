import type { Student, StudentGroup } from "../types/student";
import type { LessonRecord, ReportRecord } from "../types/report";
import type { ReportSaveBatch } from "./report-storage";
import type { WrongAnswerRecord } from "../types/wrong-answer";
import type { HandoffRecord } from "../types/handoff";

const DB_NAME = "cosmath-local-v1";
const STORES = ["classes", "students", "lessons", "reports", "wrongAnswers", "handoffs"];
interface ClassRow { id: string; name: string }
interface StudentRow extends Student { class_id: string; active: boolean }
const conflict = () => new Error("다른 창에서 데이터가 변경되었거나 이미 등록되어 있습니다. 작성 내용을 보관한 뒤 다시 불러와 주세요.");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저에서 IndexedDB를 사용할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.")); return; }
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("classes")) db.createObjectStore("classes", { keyPath: "id" }).createIndex("name", "name", { unique: true });
      if (!db.objectStoreNames.contains("students")) db.createObjectStore("students", { keyPath: "id" });
      if (!db.objectStoreNames.contains("lessons")) db.createObjectStore("lessons", { keyPath: "id" }).createIndex("class_date", ["class_id", "report_date"], { unique: true });
      if (!db.objectStoreNames.contains("reports")) db.createObjectStore("reports", { keyPath: "id" }).createIndex("lesson_student", ["lesson_id", "student_id"], { unique: true });
      if (!db.objectStoreNames.contains("wrongAnswers")) db.createObjectStore("wrongAnswers", { keyPath: "id" }).createIndex("student_date", ["student_id", "record_date"], { unique: true });
      if (!db.objectStoreNames.contains("handoffs")) db.createObjectStore("handoffs", { keyPath: "id" }).createIndex("handoff_date", "handoff_date");
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("다른 로컬 탭을 닫고 다시 시도해 주세요."));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORES, mode);
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("로컬 저장이 취소되었습니다."));
      tx.onerror = () => { /* onabort handles failed transactions. */ };
    });
    // Attach immediately so an aborted transaction never creates an unhandled rejection.
    const completion = completed.catch(error => error as Error);
    try {
      const value = await work(tx);
      const error = await completion;
      if (error) throw error;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted or completed. */ }
      await completion;
      if (error instanceof DOMException && error.name === "ConstraintError") throw conflict();
      throw error;
    }
  } finally { db.close(); }
}

export async function loadStudents(): Promise<StudentGroup[]> {
  return transaction("readonly", async tx => {
    const classes = await result<ClassRow[]>(tx.objectStore("classes").getAll());
    const students = await result<StudentRow[]>(tx.objectStore("students").getAll());
    return classes.sort((a, b) => a.name.localeCompare(b.name, "ko")).map(group => ({
      id: group.id, group: group.name,
      students: students.filter(student => student.active && student.class_id === group.id)
        .map(({ id, name, grade, version }) => ({ id, name, grade, version }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    }));
  });
}

export async function addClass(name: string): Promise<StudentGroup> {
  if (!name.trim()) throw new Error("반 이름을 입력해 주세요.");
  const row = { id: crypto.randomUUID(), name: name.trim() };
  await transaction("readwrite", async tx => { await result(tx.objectStore("classes").add(row)); });
  return { id: row.id, group: row.name, students: [] };
}

export async function addStudent(classId: string, name: string, grade: string): Promise<Student> {
  if (!name.trim()) throw new Error("학생 이름을 입력해 주세요.");
  const row: StudentRow = { id: crypto.randomUUID(), class_id: classId, name: name.trim(), grade, active: true, version: 1 };
  await transaction("readwrite", async tx => {
    if (!await result(tx.objectStore("classes").get(classId))) throw new Error("반을 먼저 등록해 주세요.");
    await result(tx.objectStore("students").add(row));
  });
  return { id: row.id, name: row.name, grade: row.grade, version: row.version };
}

export async function archiveStudent(id: string, version: number) {
  await transaction("readwrite", async tx => {
    const store = tx.objectStore("students");
    const row = await result<StudentRow | undefined>(store.get(id));
    if (!row?.active || row.version !== version) throw conflict();
    await result(store.put({ ...row, active: false, version: version + 1 }));
  });
}

export async function deleteStudent(id: string) {
  await transaction("readwrite", async tx => {
    const students = tx.objectStore("students");
    if (!await result(students.get(id))) throw conflict();
    const reports = await result<ReportRecord[]>(tx.objectStore("reports").getAll());
    const wrongAnswers = await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll());
    for (const report of reports.filter(item => item.student_id === id)) await result(tx.objectStore("reports").delete(report.id));
    for (const record of wrongAnswers.filter(item => item.student_id === id)) await result(tx.objectStore("wrongAnswers").delete(record.id));
    await result(students.delete(id));
  });
}

export async function deleteClass(id: string) {
  await transaction("readwrite", async tx => {
    const classes = tx.objectStore("classes");
    if (!await result(classes.get(id))) throw conflict();
    const students = (await result<StudentRow[]>(tx.objectStore("students").getAll())).filter(item => item.class_id === id);
    const studentIds = new Set(students.map(item => item.id));
    const lessons = (await result<LessonRecord[]>(tx.objectStore("lessons").getAll())).filter(item => item.class_id === id);
    const lessonIds = new Set(lessons.map(item => item.id));
    const reports = await result<ReportRecord[]>(tx.objectStore("reports").getAll());
    const wrongAnswers = await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll());
    for (const report of reports.filter(item => lessonIds.has(item.lesson_id) || studentIds.has(item.student_id))) await result(tx.objectStore("reports").delete(report.id));
    for (const record of wrongAnswers.filter(item => studentIds.has(item.student_id))) await result(tx.objectStore("wrongAnswers").delete(record.id));
    for (const lesson of lessons) await result(tx.objectStore("lessons").delete(lesson.id));
    for (const student of students) await result(tx.objectStore("students").delete(student.id));
    await result(classes.delete(id));
  });
}

export async function loadReportDay(date: string) {
  return transaction("readonly", async tx => {
    const lessons = (await result<LessonRecord[]>(tx.objectStore("lessons").getAll())).filter(lesson => lesson.report_date === date);
    const ids = new Set(lessons.map(lesson => lesson.id));
    const reports = (await result<ReportRecord[]>(tx.objectStore("reports").getAll())).filter(report => ids.has(report.lesson_id));
    return { lessons, reports };
  });
}

export async function saveReportBatch(batch: ReportSaveBatch) {
  return transaction("readwrite", async tx => {
    const saved = { lessons: [] as LessonRecord[], reports: [] as ReportRecord[] };
    for (const { expected_version, ...item } of batch.lessons) {
      const store = tx.objectStore("lessons");
      const old = await result<LessonRecord | undefined>(store.get(item.id));
      if ((old?.version ?? 0) !== expected_version || (old && (old.class_id !== item.class_id || old.report_date !== item.report_date))) throw conflict();
      if (!await result(tx.objectStore("classes").get(item.class_id))) throw conflict();
      const row = { ...item, version: expected_version + 1 };
      await result(old ? store.put(row) : store.add(row)); saved.lessons.push(row);
    }
    for (const { expected_version, ...item } of batch.reports) {
      const store = tx.objectStore("reports");
      const old = await result<ReportRecord | undefined>(store.get(item.id));
      if ((old?.version ?? 0) !== expected_version || (old && (old.student_id !== item.student_id || old.lesson_id !== item.lesson_id))) throw conflict();
      const student = await result<StudentRow | undefined>(tx.objectStore("students").get(item.student_id));
      const lesson = await result<LessonRecord | undefined>(tx.objectStore("lessons").get(item.lesson_id));
      if (!student || !lesson || (!old && (!student.active || student.class_id !== lesson.class_id))) throw conflict();
      const row = { ...item, version: expected_version + 1 };
      await result(old ? store.put(row) : store.add(row)); saved.reports.push(row);
    }
    return saved;
  });
}

export async function loadWrongAnswers(month: string): Promise<WrongAnswerRecord[]> {
  return transaction("readonly", async tx => (await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll())).filter(record => record.record_date.startsWith(month)));
}

export async function saveWrongAnswer(record: WrongAnswerRecord): Promise<WrongAnswerRecord> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore("wrongAnswers");
    const old = await result<WrongAnswerRecord | undefined>(store.get(record.id));
    if ((old?.version ?? 0) !== record.version || record.corrected_count < 0 || record.total_wrong < record.corrected_count) throw conflict();
    const student = await result<StudentRow | undefined>(tx.objectStore("students").get(record.student_id));
    if (!student?.active) throw conflict();
    const saved = { ...record, version: record.version + 1 };
    await result(old ? store.put(saved) : store.add(saved));
    return saved;
  });
}

export async function loadHandoffs(month: string): Promise<HandoffRecord[]> {
  return transaction("readonly", async tx => (await result<HandoffRecord[]>(tx.objectStore("handoffs").getAll())).filter(record => record.handoff_date.startsWith(month)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
}
export async function addHandoff(record: HandoffRecord): Promise<HandoffRecord> {
  return transaction("readwrite", async tx => { await result(tx.objectStore("handoffs").add(record)); return record; });
}
export async function deleteHandoff(id: string): Promise<void> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore("handoffs");
    if (!await result(store.get(id))) throw conflict();
    await result(store.delete(id));
  });
}
