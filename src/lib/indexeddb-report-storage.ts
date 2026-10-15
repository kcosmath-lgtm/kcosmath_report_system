import type { Student, StudentGroup } from "../types/student";
import { validateProgress, type ProgressBook, type ProgressEntry, type ClassBook } from '../types/progress';

export async function loadClassBooks(classId: string): Promise<ClassBook[]> {
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('classBooks');
    const students = (await result<StudentRow[]>(tx.objectStore('students').getAll())).filter(s => s.class_id === classId);
    const ids = new Set(students.map(s => s.id));
    const catalog = await result<ClassBook[]>(store.getAll());
    for (const book of await result<ProgressBook[]>(tx.objectStore('progressBooks').getAll())) {
      if (!ids.has(book.student_id) || book.library_id || book.archived) continue;
      let template = catalog.find(c => c.class_id === classId && c.title === book.title && JSON.stringify(c.units) === JSON.stringify(book.units));
      if (!template) {
        template = { id: crypto.randomUUID(), class_id: classId, title: book.title, curriculum: book.curriculum, course: book.course, units: book.units, total_pages: book.total_pages ?? 0, version: 1 };
        await result(store.add(template)); catalog.push(template);
      }
      await result(tx.objectStore('progressBooks').put({ ...book, library_id: template.id }));
    }
    return catalog.filter(c => c.class_id === classId);
  });
}
export async function manageClassBook(action: 'save' | 'delete' | 'assign', book: ClassBook, studentIds: string[] = []): Promise<ClassBook | ProgressBook[]> {
  if (action === 'save') validateProgress({ ...book, student_id: '', states: {}, completed_page: 0 });
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('classBooks');
    const old = await result<ClassBook | undefined>(store.get(book.id));
    if (!await result(tx.objectStore('classes').get(book.class_id)) || (old?.version ?? 0) !== book.version || (old && old.class_id !== book.class_id)) throw conflict();
    const books = await result<ProgressBook[]>(tx.objectStore('progressBooks').getAll());
    if (action === 'save') {
      const saved = { ...book, version: book.version + 1 };
      await result(old ? store.put(saved) : store.add(saved));
      for (const b of books.filter(b => b.library_id === book.id && !b.archived)) {
        // Fill legacy snapshots before changing a textbook outline.
        for (const e of await result<ProgressEntry[]>(tx.objectStore('progressEntries').getAll())) if (e.book_id === b.id && !e.units_snapshot) await result(tx.objectStore('progressEntries').put({ ...e, units_snapshot: b.units, total_pages_snapshot: b.total_pages ?? 0, completed_page: b.completed_page ?? 0 }));
        await result(tx.objectStore('progressBooks').put({ ...b, title: saved.title, curriculum: saved.curriculum, course: saved.course, units: saved.units, total_pages: saved.total_pages, completed_page: Math.min(b.completed_page ?? 0, saved.total_pages), states: Object.fromEntries(Object.entries(b.states).filter(([id]) => saved.units.some(u => u.id === id))), version: b.version + 1 }));
      }
      return saved;
    }
    if (!old) throw conflict();
    if (action === 'delete') {
      await result(store.delete(book.id));
      for (const b of books.filter(b => b.library_id === book.id)) await result(tx.objectStore('progressBooks').put({ ...b, archived: true, version: b.version + 1 }));
      return old;
    }
    const output: ProgressBook[] = [];
    if (!studentIds.length || studentIds.length > 500) throw conflict();
    for (const id of new Set(studentIds)) {
      const student = await result<StudentRow | undefined>(tx.objectStore('students').get(id));
      if (!student?.active || student.class_id !== old.class_id) throw conflict();
      const assigned = books.find(b => b.student_id === id && b.library_id === old.id && !b.archived);
      const saved: ProgressBook = assigned ?? { id: crypto.randomUUID(), student_id: id, title: old.title, curriculum: old.curriculum, course: old.course, units: old.units, total_pages: old.total_pages, completed_page: 0, library_id: old.id, states: {}, version: 1 };
      if (!assigned) await result(tx.objectStore('progressBooks').add(saved));
      output.push(saved);
    }
    return output;
  });
}

export async function loadProgress(studentId: string) {
  return transaction('readonly', async tx => {
    const books = (await result<ProgressBook[]>(tx.objectStore('progressBooks').getAll())).filter(b => b.student_id === studentId && !b.archived);
    const ids = new Set(books.map(b => b.id));
    const entries = (await result<ProgressEntry[]>(tx.objectStore('progressEntries').getAll())).filter(e => ids.has(e.book_id)).sort((a,b) => b.record_date.localeCompare(a.record_date) || b.created_at.localeCompare(a.created_at));
    return { books, entries };
  });
}
export async function saveProgress(book: ProgressBook, entry?: ProgressEntry) {
  validateProgress(book, entry);
  return transaction('readwrite', tx => saveProgressInTransaction(tx, book, entry));
}
export async function saveProgressBooks(books: ProgressBook[]) {
  books.forEach(book => validateProgress(book));
  if (!books.length || books.length > 500 || books.some(b => b.version !== 0)) throw new Error('Invalid batch');
  return transaction('readwrite', async tx => {
    const output = [];
    for (const book of books) output.push(await saveProgressInTransaction(tx, book));
    return output;
  });
}
async function saveProgressInTransaction(tx: IDBTransaction, book: ProgressBook, entry?: ProgressEntry) {
    const bs = tx.objectStore('progressBooks');
    const old = await result<ProgressBook | undefined>(bs.get(book.id));
    const student = await result<StudentRow | undefined>(tx.objectStore('students').get(book.student_id));
    if (!student?.active || old?.archived || (old?.version ?? 0) !== book.version || (old && ((old.total_pages ?? 0) !== (book.total_pages ?? 0) || old.student_id !== book.student_id || old.title !== book.title || old.curriculum !== book.curriculum || old.course !== book.course || JSON.stringify(old.units) !== JSON.stringify(book.units)))) throw conflict();
    const saved = { ...book, version: book.version + 1 };
    const created_at = new Date().toISOString();
    const record_date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const log: ProgressEntry = { ...(entry ?? { id: crypto.randomUUID(), book_id: book.id, record_date, unit_ids: [], scope: '', homework: '', due_date: null, memo: '단원 상태 변경' }), states: { ...saved.states }, created_at };
    await result(old ? bs.put(saved) : bs.add(saved));
    const snapshot = { ...log, units_snapshot: saved.units, total_pages_snapshot: saved.total_pages ?? 0, completed_page: saved.completed_page ?? 0 };
    await result(tx.objectStore('progressEntries').add(snapshot));
    return { book: saved, entry: snapshot };
}
export async function saveProgressBatch(items: { book: ProgressBook; entry: ProgressEntry }[]) {
  items.forEach(item => validateProgress(item.book, item.entry));
  if (!items.length || items.length > 500) throw new Error('Invalid batch');
  return transaction('readwrite', async tx => {
    const output = [];
    for (const item of items) output.push(await saveProgressInTransaction(tx, item.book, item.entry));
    return output;
  });
}
async function deleteProgress(tx: IDBTransaction, ids: Set<string>) {
  const books = await result<ProgressBook[]>(tx.objectStore('progressBooks').getAll());
  const bookIds = new Set(books.filter(b => ids.has(b.student_id)).map(b => b.id));
  for (const e of await result<ProgressEntry[]>(tx.objectStore('progressEntries').getAll())) if (bookIds.has(e.book_id)) await result(tx.objectStore('progressEntries').delete(e.id));
  for (const id of bookIds) await result(tx.objectStore('progressBooks').delete(id));
}
import type { LessonRecord, ReportRecord } from "../types/report";
import type { ReportSaveBatch } from "./report-storage";
import type { WrongAnswerRecord } from "../types/wrong-answer";
import type { HandoffRecord } from "../types/handoff";
import { validateDailySave, type StudentDailyRecord, type StudentDailySave } from '../types/student-daily';

export async function loadStudentDaily(month: string): Promise<StudentDailyRecord[]> {
  return transaction('readonly', async tx => (await result<StudentDailyRecord[]>(tx.objectStore('studentDaily').getAll())).filter(r => r.record_date.startsWith(month)));
}
export async function saveStudentDaily(items: StudentDailySave[]): Promise<StudentDailySave[]> {
  items.forEach(validateDailySave);
  return transaction('readwrite', async tx => {
    const output: StudentDailySave[] = [];
    for (const { daily, wrong } of items) {
      const ds = tx.objectStore('studentDaily'), ws = tx.objectStore('wrongAnswers');
      const old = await result<StudentDailyRecord | undefined>(ds.get(daily.id));
      const ow = await result<WrongAnswerRecord | undefined>(ws.get(wrong.id));
      const student = await result<StudentRow | undefined>(tx.objectStore('students').get(daily.student_id));
      if (!student?.active || (old?.version ?? 0) !== daily.version || (ow?.version ?? 0) !== wrong.version ||
        (old && (old.student_id !== daily.student_id || old.record_date !== daily.record_date)) ||
        (ow && (ow.student_id !== wrong.student_id || ow.record_date !== wrong.record_date))) throw conflict();
      const saved = { daily: { ...daily, version: daily.version + 1 }, wrong: { ...wrong, version: wrong.version + 1 } };
      await result(old ? ds.put(saved.daily) : ds.add(saved.daily));
      await result(ow ? ws.put(saved.wrong) : ws.add(saved.wrong));
      output.push(saved);
    }
    return output;
  });
}

const DB_NAME = "cosmath-local-v1";
const STORES = ["classes", "students", "lessons", "reports", "wrongAnswers", "handoffs", "studentDaily", "progressBooks", "progressEntries", "classBooks"];
interface ClassRow { id: string; name: string }
interface StudentRow extends Student { class_id: string; active: boolean }
const conflict = () => new Error("다른 창에서 데이터가 변경되었거나 이미 등록되어 있습니다. 작성 내용을 보관한 뒤 다시 불러와 주세요.");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("이 브라우저에서 IndexedDB를 사용할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.")); return; }
    const request = indexedDB.open(DB_NAME, 6);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('classBooks')) db.createObjectStore('classBooks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progressBooks')) db.createObjectStore('progressBooks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progressEntries')) db.createObjectStore('progressEntries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains("studentDaily")) db.createObjectStore("studentDaily", { keyPath: "id" }).createIndex("student_date", ["student_id", "record_date"], { unique: true });
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

export async function updateStudent(id: string, name: string, grade: string, version: number) {
  if (!name.trim() || name.trim().length > 100 || !grade.trim() || grade.trim().length > 30) throw new Error('학생 이름과 학년을 확인해 주세요.');
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('students');
    const old = await result<StudentRow | undefined>(store.get(id));
    if (!old?.active || old.version !== version) throw conflict();
    const saved = { ...old, name: name.trim(), grade: grade.trim(), version: version + 1 };
    await result(store.put(saved)); return saved;
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
    await deleteProgress(tx, new Set([id]));
    const reports = await result<ReportRecord[]>(tx.objectStore("reports").getAll());
    const wrongAnswers = await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll());
    for (const report of reports.filter(item => item.student_id === id)) await result(tx.objectStore("reports").delete(report.id));
    for (const record of wrongAnswers.filter(item => item.student_id === id)) await result(tx.objectStore("wrongAnswers").delete(record.id));
    for (const record of await result<StudentDailyRecord[]>(tx.objectStore('studentDaily').getAll())) if (record.student_id === id) await result(tx.objectStore('studentDaily').delete(record.id));
    await result(students.delete(id));
  });
}

export async function deleteClass(id: string) {
  await transaction("readwrite", async tx => {
    const classes = tx.objectStore("classes");
    if (!await result(classes.get(id))) throw conflict();
    for (const b of await result<ClassBook[]>(tx.objectStore('classBooks').getAll())) if (b.class_id === id) await result(tx.objectStore('classBooks').delete(b.id));
    const students = (await result<StudentRow[]>(tx.objectStore("students").getAll())).filter(item => item.class_id === id);
    const studentIds = new Set(students.map(item => item.id));
    await deleteProgress(tx, studentIds);
    const lessons = (await result<LessonRecord[]>(tx.objectStore("lessons").getAll())).filter(item => item.class_id === id);
    const lessonIds = new Set(lessons.map(item => item.id));
    const reports = await result<ReportRecord[]>(tx.objectStore("reports").getAll());
    const wrongAnswers = await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll());
    for (const report of reports.filter(item => lessonIds.has(item.lesson_id) || studentIds.has(item.student_id))) await result(tx.objectStore("reports").delete(report.id));
    for (const record of wrongAnswers.filter(item => studentIds.has(item.student_id))) await result(tx.objectStore("wrongAnswers").delete(record.id));
    for (const lesson of lessons) await result(tx.objectStore("lessons").delete(lesson.id));
    for (const student of students) await result(tx.objectStore("students").delete(student.id));
    for (const record of await result<StudentDailyRecord[]>(tx.objectStore('studentDaily').getAll())) if (studentIds.has(record.student_id)) await result(tx.objectStore('studentDaily').delete(record.id));
    await result(classes.delete(id));
  });
}

export async function loadReportDay(date: string) {
  return transaction("readonly", async tx => {
    // Reports are rolling records. Keep the date argument for adapter/API
    // compatibility, but resume the newest saved row for each class/student.
    void date;
    const allLessons = await result<LessonRecord[]>(tx.objectStore("lessons").getAll());
    const lessonById = new Map(allLessons.map(lesson => [lesson.id, lesson]));
    const lessons = [...allLessons]
      .sort((a, b) => b.report_date.localeCompare(a.report_date) || b.version - a.version)
      .filter((lesson, index, rows) => rows.findIndex(item => item.class_id === lesson.class_id) === index);
    const reports = (await result<ReportRecord[]>(tx.objectStore("reports").getAll()))
      .sort((a, b) => {
        const dateOrder = (lessonById.get(b.lesson_id)?.report_date ?? "").localeCompare(lessonById.get(a.lesson_id)?.report_date ?? "");
        return dateOrder || b.version - a.version;
      })
      .filter((report, index, rows) => rows.findIndex(item => item.student_id === report.student_id) === index);
    return { lessons, reports };
  });
}

export async function saveReportBatch(batch: ReportSaveBatch) {
  return transaction("readwrite", async tx => {
    const saved = { lessons: [] as LessonRecord[], reports: [] as ReportRecord[] };
    const mapping = new Map<string,string>();
    for (const { expected_version, patch, ...item } of batch.lessons) {
      void expected_version;
      const store = tx.objectStore("lessons");
      const byId = await result<LessonRecord | undefined>(store.get(item.id));
      if (byId && byId.class_id !== item.class_id) throw conflict();
      const old = byId ?? await result<LessonRecord | undefined>(store.index("class_date").get([item.class_id,item.report_date]));
      if (!await result(tx.objectStore("classes").get(item.class_id))) throw conflict();
      const row = { ...item, id: old?.id ?? item.id, report_date: old?.report_date ?? item.report_date,
        common_data: old ? { ...old.common_data, ...(patch ?? item.common_data) } : item.common_data, version: (old?.version ?? 0)+1 };
      await result(store.put(row)); saved.lessons.push(row); mapping.set(item.id,row.id);
    }
    for (const { expected_version, patch, ...item } of batch.reports) {
      void expected_version;
      const store = tx.objectStore("reports");
      const lessonId = mapping.get(item.lesson_id) ?? item.lesson_id;
      const byId = await result<ReportRecord | undefined>(store.get(item.id));
      if (byId && byId.student_id !== item.student_id) throw conflict();
      const old = byId ?? await result<ReportRecord | undefined>(store.index("lesson_student").get([lessonId,item.student_id]));
      const student = await result<StudentRow | undefined>(tx.objectStore("students").get(item.student_id));
      const lesson = await result<LessonRecord | undefined>(tx.objectStore("lessons").get(lessonId));
      if (!student || !lesson || !student.active || student.class_id !== lesson.class_id) throw conflict();
      const row = { ...item, id: old?.id ?? item.id, lesson_id: old?.lesson_id ?? lessonId,
        snapshot: old ? { ...old.snapshot, ...(patch ?? item.snapshot) } : item.snapshot, version: (old?.version ?? 0)+1 };
      await result(store.put(row)); saved.reports.push(row);
    }
    return saved;
  });
}

export async function loadWrongAnswers(month: string): Promise<WrongAnswerRecord[]> {
  return transaction("readonly", async tx => (await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll())).filter(record => record.record_date.startsWith(month)));
}

export async function loadWrongAnswerRange(start: string, end: string, studentIds: string[]): Promise<WrongAnswerRecord[]> {
  return transaction("readonly", async tx => (await result<WrongAnswerRecord[]>(tx.objectStore("wrongAnswers").getAll()))
    .filter(r => studentIds.includes(r.student_id) && r.record_date >= start && r.record_date <= end)
    .sort((a, b) => a.record_date.localeCompare(b.record_date)));
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
