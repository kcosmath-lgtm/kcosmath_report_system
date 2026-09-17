"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, GraduationCap, Loader2, Plus, RefreshCw, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { addClass, addStudent, archiveStudent, deleteClass, deleteStudent, loadStudents } from "../lib/report-storage";
import type { StudentGroup } from "../types/student";
import styles from "./student-manager.module.css";
import StudentAdminChat from "./StudentAdminChat";

type Props = { open: boolean; onClose: () => void; onChanged: () => void; mode?: "modal" | "page" };

export default function StudentManagerModal({ open, onClose, onChanged, mode = "modal" }: Props) {
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

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const rows = await loadStudents();
      setGroups(rows);
      setClassId(current => rows.some(group => group.id === current) ? current : rows[0]?.id ?? "");
      const ids = rows.flatMap(group => group.students.map(student => student.id));
      setSelectedIds(current => current.filter(id => ids.includes(id)));
      setSelectedId(current => ids.includes(current) ? current : "");
      setExpandedGroups(current => current.filter(id => rows.some(group => group.id === id)));
    } catch (e) { setError(e instanceof Error ? e.message : "학생 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  useEffect(() => {
    if (!open || mode !== "modal") return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", escape);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", escape);
  }, [open, busy, onClose, mode]);

  const selected = useMemo(() => {
    for (const group of groups) {
      const student = group.students.find(item => item.id === selectedId);
      if (student) return { student, group };
    }
    return null;
  }, [groups, selectedId]);
  const selectedStudents = useMemo(() => selectedIds.flatMap(id => {
    for (const group of groups) { const student = group.students.find(item => item.id === id); if (student) return [{ student, group }]; }
    return [];
  }), [groups, selectedIds]);
  const selectedIndex = Math.max(0, selectedStudents.findIndex(item => item.student.id === selectedId));

  async function mutate(action: () => Promise<void>, message: string) {
    if (busy || loading) return;
    setBusy(true); setError(""); setStatus("");
    try { await action(); await refresh(); onChanged(); setStatus(message); }
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
              <div className={styles.groupRow}><input type="checkbox" aria-label={`${group.group} 학생 전체 선택`} checked={group.students.length > 0 && group.students.every(student => selectedIds.includes(student.id))} ref={input => { if (input) input.indeterminate = group.students.some(student => selectedIds.includes(student.id)) && !group.students.every(student => selectedIds.includes(student.id)); }} onChange={event => { const ids = group.students.map(student => student.id); setSelectedIds(current => event.target.checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id))); if (event.target.checked && ids[0]) setSelectedId(ids[0]); }} /><button className={styles.groupToggle} aria-expanded={expandedGroups.includes(group.id)} onClick={() => setExpandedGroups(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])}><span>{group.group}</span><small>{group.students.length}</small><ChevronDown size={14} /></button><button className={styles.groupAdd} onClick={() => { setClassId(group.id); setAddingMode("student"); setAddingOpen(true); }} aria-label={`${group.group}에 학생 추가`} title="이 반에 학생 추가"><UserPlus size={14} /></button><button className={styles.groupDelete} disabled={busy} onClick={() => { if (!window.confirm(`[${group.group}] 반을 영구 삭제할까요?\n소속 학생과 수업 보고서, 오답 기록이 모두 삭제되며 복구할 수 없습니다.`)) return; void mutate(() => deleteClass(group.id), `${group.group} 반을 삭제했습니다.`); }} aria-label={`${group.group} 삭제`} title="반 영구 삭제"><Trash2 size={14} /></button></div>
              {expandedGroups.includes(group.id) && (!group.students.length ? <p>등록된 학생 없음</p> : group.students.map(student => <div key={student.id} className={`${styles.studentRow} ${selectedId === student.id ? styles.currentStudent : ""}`}><input type="checkbox" aria-label={`${student.name} 선택`} checked={selectedIds.includes(student.id)} onChange={event => { const next = event.target.checked ? [...new Set([...selectedIds, student.id])] : selectedIds.filter(id => id !== student.id); setSelectedIds(next); setSelectedId(event.target.checked ? student.id : (selectedId === student.id ? next[0] ?? "" : selectedId)); }} /><button className={selectedIds.includes(student.id) ? styles.selectedStudent : ""} aria-current={selectedId === student.id ? "true" : undefined} onClick={() => { setSelectedIds(current => current.includes(student.id) ? current : [...current, student.id]); setSelectedId(student.id); }}><span>{student.name.slice(0, 1)}</span><div><strong>{student.name}</strong><small>{student.grade}</small></div></button></div>))}
            </div>)}</nav>
            <div className={styles.profile}>{selected ? <><div className={styles.cardPager}><button disabled={selectedIndex <= 0} onClick={() => setSelectedId(selectedStudents[selectedIndex - 1].student.id)} aria-label="이전 학생 프로필"><ChevronLeft size={18} /></button><span><strong>{selectedIndex + 1}</strong> / {selectedStudents.length}</span><button disabled={selectedIndex >= selectedStudents.length - 1} onClick={() => setSelectedId(selectedStudents[selectedIndex + 1].student.id)} aria-label="다음 학생 프로필"><ChevronRight size={18} /></button></div><div key={selected.student.id} className={styles.profileCard}>
              <div className={styles.cardGlow} /><div className={styles.profileHead}><span>{selected.student.name.slice(0, 1)}</span><div><small>STUDENT PROFILE</small><h3>{selected.student.name}</h3><p>{selected.student.grade} · {selected.group.group}</p></div><Sparkles size={22} /></div>
              <div className={styles.learningCard}><div><span><BookOpen size={16} /></span><div><small>COSMATH STUDENT</small><strong>배움의 기록을 차곡차곡</strong></div></div><div className={styles.progressBars}><i /><i /><i /><i /></div></div>
              <dl><div><dt>학생 이름</dt><dd>{selected.student.name}</dd></div><div><dt>학년</dt><dd>{selected.student.grade}</dd></div><div><dt>소속 반</dt><dd>{selected.group.group}</dd></div><div><dt>현재 상태</dt><dd><i /> 재원 중</dd></div></dl>
              <div className={styles.profileNotice}><GraduationCap size={18} /><p><strong>학생 기록 안내</strong><span>퇴원 처리해도 기존 수업 보고서와 기록은 안전하게 보존됩니다.</span></p></div>
              <div className={styles.profileActions}>
                <button className={styles.archiveButton} disabled={busy} onClick={() => {
                  const { student } = selected;
                  if (!window.confirm(`[${student.name}] 학생을 퇴원 처리할까요?\n목록에서는 숨겨지지만 기존 보고서 기록은 보존됩니다.`)) return;
                  void mutate(() => archiveStudent(student.id, student.version), `${student.name} 학생을 퇴원 처리했습니다.`);
                }}>퇴원 처리</button>
                <button className={styles.deleteButton} disabled={busy} onClick={() => {
                  const { student } = selected;
                  if (!window.confirm(`[${student.name}] 학생을 영구 삭제할까요?\n수업 보고서와 오답 기록이 모두 삭제되며 복구할 수 없습니다.`)) return;
                  void mutate(() => deleteStudent(student.id), `${student.name} 학생을 삭제했습니다.`);
                }}><Trash2 size={14} /> 영구 삭제</button>
              </div>
            </div></> : <div className={styles.emptyProfile}><Users size={28} /><p>왼쪽 목록에서 학생을 선택하세요.</p></div>}</div>
          </div>}
        </section>
      </div>
      {mode === "page" && <button className={styles.floatingAdd} onClick={() => { setAddingMode("class"); setAddingOpen(true); }} aria-label="새 반 추가" title="새 반 추가"><Plus size={25} /></button>}
      {mode === "page" && <StudentAdminChat groups={groups} disabled={busy || loading} onChanged={async () => { await refresh(); onChanged(); }} />}
    </div>
  </div>;
  return mode === "modal" ? createPortal(content, document.body) : content;
}
