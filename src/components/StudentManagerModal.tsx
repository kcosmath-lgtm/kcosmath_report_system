"use client";
import { useRosterRefresh } from "../lib/use-roster-refresh";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Pencil, Loader2, Plus, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { addClass, addStudent, updateStudent, deleteClass, deleteStudent, loadStudents } from "../lib/report-storage";
import type { StudentGroup } from "../types/student";
import StudentDailyRecords from "./StudentDailyRecords";
import styles from "./student-manager.module.css";

type Props = { open: boolean; onClose: () => void; onChanged: () => void; mode?: "modal" | "page" };

export default function StudentManagerModal({ open, onClose, onChanged, mode = "modal" }: Props) {
  const [editing, setEditing] = useState<{ id: string; name: string; grade: string; version: number } | null>(null);
  const [recordsDirty, setRecordsDirty] = useState(false);
  const [recordRevision, setRecordRevision] = useState(0);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [className, setClassName] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addingOpen, setAddingOpen] = useState(false);
  const [addingMode, setAddingMode] = useState<"class" | "student">("class");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true); setError("");
    try {
      const rows = await loadStudents();
      if (sequence !== refreshSequence.current) return;
      setGroups(rows);
      setClassId(current => rows.some(group => group.id === current) ? current : rows[0]?.id ?? "");
      const ids = rows.flatMap(group => group.students.map(student => student.id));
      setSelectedIds(current => current.filter(id => ids.includes(id)));
      setSelectedId(current => ids.includes(current) ? current : "");
      setExpandedGroups(current => current.filter(id => rows.some(group => group.id === id)));
    } catch (e) { setError(e instanceof Error ? e.message : "학생 목록을 불러오지 못했습니다."); }
    finally { if (sequence === refreshSequence.current) setLoading(false); }
  }, []);
  useRosterRefresh(refresh, busy || recordsDirty || !open);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  useEffect(() => {
    if (!open || mode !== "modal") return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", escape);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", escape);
  }, [open, busy, onClose, mode]);


  async function mutate(action: () => Promise<void>, message: string) {
    if (busy || loading) return;
    if (recordsDirty) { setError("입력 중인 수업 기록을 먼저 저장해 주세요."); return; }
    setBusy(true); setError(""); setStatus("");
    try { await action(); await refresh(); setRecordRevision(v => v + 1); onChanged(); setStatus(message); }
    catch (e) { setError(e instanceof Error ? e.message : "변경사항을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  const content = <div className={mode === "page" ? styles.pageContainer : styles.backdrop} role="presentation" onMouseDown={event => { if (mode === "modal" && event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="student-manager-title" tabIndex={-1}>
      <header className={styles.header}>
        <div><span><Users size={18} /></span><div><h2 id="student-manager-title">학생 관리</h2><p>반과 재원생을 등록하고 관리합니다.</p></div></div>
        {mode === "modal" && <button onClick={onClose} disabled={busy} aria-label="학생 관리 닫기"><X size={20} /></button>}
      </header>

      <div className={styles.body}>
        {editing && <form className={styles.editForm} onSubmit={event => { event.preventDefault(); void mutate(async () => { await updateStudent(editing.id, editing.name, editing.grade, editing.version); setEditing(null); }, '학생 정보를 수정했습니다.'); }}>
          <h3>학생 정보 편집</h3><label>이름<input value={editing.name} maxLength={100} required onChange={e => setEditing({ ...editing, name: e.target.value })} /></label><label>학년<input value={editing.grade} maxLength={30} required onChange={e => setEditing({ ...editing, grade: e.target.value })} /></label><button disabled={busy}>저장</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button>
        </form>}
        {(error || status) && <p className={error ? styles.error : styles.status} role={error ? "alert" : "status"}>{error || status}</p>}
        {(mode === "modal" || addingOpen) && <div className={mode === "page" ? styles.addBackdrop : ""} onMouseDown={event => { if (mode === "page" && event.target === event.currentTarget && !busy) setAddingOpen(false); }}><section className={`${styles.forms} ${mode === "page" ? styles.singleForm : ""}`}>
          {mode === "page" && <div className={styles.addHeader}><div><strong>{addingMode === "class" ? "새 반 추가" : "학생 추가"}</strong><span>{addingMode === "class" ? "학생들을 배정할 새로운 반을 만드세요." : `${groups.find(group => group.id === classId)?.group ?? "선택한 반"}에 학생을 등록합니다.`}</span></div><button onClick={() => setAddingOpen(false)} aria-label="추가 창 닫기"><X size={18} /></button></div>}
          {(mode === "modal" || addingMode === "class") && <form onSubmit={event => { event.preventDefault(); if (!className.trim()) return; void mutate(async () => { await addClass(className.trim()); setClassName(""); }, "새 반을 등록했습니다."); }}>
            <h3><Plus size={16} /> 반 추가</h3>
            <div><input value={className} onChange={event => setClassName(event.target.value)} maxLength={100} required placeholder="예: 중등 A반" aria-label="새 반 이름" /><button disabled={busy || loading}>추가</button></div>
          </form>}
          {(mode === "modal" || addingMode === "student") && <form onSubmit={event => { event.preventDefault(); if (!classId || !name.trim() || !grade.trim()) return; void mutate(async () => { await addStudent(classId, name.trim(), grade.trim()); setName(""); setGrade(""); }, "새 학생을 등록했습니다."); }}>
            <h3><UserPlus size={16} /> 학생 추가</h3>
            {mode === "modal" && <select value={classId} onChange={event => setClassId(event.target.value)} required aria-label="학생이 속할 반"><option value="">반 선택</option>{groups.map(group => <option key={group.id} value={group.id}>{group.group}</option>)}</select>}
            <div><input value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="학생 이름" aria-label="학생 이름" /><input value={grade} onChange={event => setGrade(event.target.value)} maxLength={30} required placeholder="학년 (예: 중2)" aria-label="학년" /><button disabled={busy || loading || !groups.length}>등록</button></div>
          </form>}
        </section></div>}

        <section className={styles.listSection}>
          <div className={styles.listTitle}><div><h3>재원생 목록</h3><small>{groups.reduce((sum, group) => sum + group.students.length, 0)}명</small></div><button onClick={() => void refresh()} disabled={busy || loading} aria-label="학생 목록 새로고침"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button></div>
          {loading ? <div className={styles.loading}><Loader2 className="animate-spin" /> 목록을 불러오는 중…</div> : !groups.length ? <div className={styles.empty}>등록된 반이 없습니다.</div> : <div className={styles.studentWorkspace}>
            <nav className={styles.studentNav} aria-label="반별 학생 목록">{groups.map(group => <div key={group.id} className={styles.navGroup}>
              <div className={styles.groupRow}><input type="checkbox" aria-label={`${group.group} 학생 전체 선택`} checked={group.students.length > 0 && group.students.every(student => selectedIds.includes(student.id))} ref={input => { if (input) input.indeterminate = group.students.some(student => selectedIds.includes(student.id)) && !group.students.every(student => selectedIds.includes(student.id)); }} onChange={event => { const ids = group.students.map(student => student.id); setSelectedIds(current => event.target.checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id))); if (event.target.checked && ids[0]) setSelectedId(ids[0]); }} /><button className={styles.groupToggle} aria-expanded={expandedGroups.includes(group.id)} onClick={() => { setSelectedIds(group.students.map(s => s.id)); setSelectedId(group.students[0]?.id ?? ""); setExpandedGroups(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id]); }}><span>{group.group}</span><small>{group.students.length}</small><ChevronDown size={14} /></button><button className={styles.groupAdd} onClick={() => { setClassId(group.id); setAddingMode("student"); setAddingOpen(true); }} aria-label={`${group.group}에 학생 추가`} title="이 반에 학생 추가"><UserPlus size={14} /></button><button className={styles.groupDelete} disabled={busy} onClick={() => { if (!window.confirm(`[${group.group}] 반을 영구 삭제할까요?\n소속 학생과 수업 보고서, 오답 기록이 모두 삭제되며 복구할 수 없습니다.`)) return; void mutate(() => deleteClass(group.id), `${group.group} 반을 삭제했습니다.`); }} aria-label={`${group.group} 삭제`} title="반 영구 삭제"><Trash2 size={14} /></button></div>
              {expandedGroups.includes(group.id) && (!group.students.length ? <p>등록된 학생 없음</p> : group.students.map(student => <div key={student.id} className={`${styles.studentRow} ${selectedId === student.id ? styles.currentStudent : ""}`}><input type="checkbox" aria-label={`${student.name} 선택`} checked={selectedIds.includes(student.id)} onChange={event => { const next = event.target.checked ? [...new Set([...selectedIds, student.id])] : selectedIds.filter(id => id !== student.id); setSelectedIds(next); setSelectedId(event.target.checked ? student.id : (selectedId === student.id ? next[0] ?? "" : selectedId)); }} /><button className={selectedIds.includes(student.id) ? styles.selectedStudent : ""} aria-current={selectedId === student.id ? "true" : undefined} onClick={() => { setSelectedIds([student.id]); setSelectedId(student.id); }}><span>{student.name.slice(0, 1)}</span><div><strong>{student.name}</strong><small>{student.grade}</small></div></button><button className={styles.studentAction} disabled={busy || recordsDirty} aria-label={`${student.name} 편집`} onClick={() => { setEditing({ id: student.id, name: student.name, grade: student.grade, version: student.version }); }}><Pencil size={14} /></button><button className={styles.studentAction} disabled={busy || recordsDirty} aria-label={`${student.name} 삭제`} onClick={() => { if (window.confirm(`${student.name} 학생과 모든 기록을 영구 삭제할까요?`)) void mutate(() => deleteStudent(student.id), "학생을 삭제했습니다."); }}><Trash2 size={14} /></button></div>))}
            </div>)}</nav>
            <div className={styles.recordPanel}><StudentDailyRecords studentIds={selectedIds} rosterRevision={recordRevision} onDirtyChange={setRecordsDirty} /></div>
          </div>}
        </section>
      </div>
      {mode === "page" && <button className={styles.floatingAdd} onClick={() => { setAddingMode("class"); setAddingOpen(true); }} aria-label="새 반 추가" title="새 반 추가"><Plus size={25} /></button>}
    </div>
  </div>;
  return mode === "modal" ? createPortal(content, document.body) : content;
}
