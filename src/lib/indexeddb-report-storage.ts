import type { Student, StudentGroup } from "../types/student";
import type { LessonRecord, ReportRecord } from "../types/report";
import type { ReportSaveBatch } from "./report-storage";

const DB_NAME = "cosmath-local-v1";
const STORES = ["classes", "students", "lessons", "reports"];
interface ClassRow { id: string; name: string }
interface StudentRow extends Student { class_id: string; active: boolean }
const conflict = () => new Error("다른 창에서 데이터가 변경되었거나 이미 등록되어 있습니다. 작성 내용을 보관한 뒤 다시 불러와 주세요.");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저에서 IndexedDB를 사용할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("classes", { keyPath: "id" }).createIndex("name", "name", { unique: true });
      db.createObjectStore("students", { keyPath: "id" });
      db.createObjectStore("lessons", { keyPath: "id" }).createIndex("class_date", ["class_id", "report_date"], { unique: true });
      db.createObjectStore("reports", { keyPath: "id" }).createIndex("lesson_student", ["lesson_id", "student_id"], { unique: true });
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
