"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { addClass, addStudent, archiveStudent, loadStudents } from "../../lib/report-storage";
import styles from "../../app/report/workspace.module.css";
import type { StudentGroup } from "../../types/student";
import type { ReportStudent } from "../../types/report";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchSelect: (students: ReportStudent[]) => void;
  disabled?: boolean;
}

export default function StudentSidebar({ isOpen, onClose, onBatchSelect, disabled = false }: SidebarProps) {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [className, setClassName] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const lock = useRef(false);
  const selectionCallback = useRef(onBatchSelect);
  selectionCallback.current = onBatchSelect;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadStudents();
      setGroups(rows);
      const activeIds = new Set(rows.flatMap(group => group.students.map(student => student.id)));
      setSelectedIds(ids => ids.filter(id => activeIds.has(id)));
    } catch (e) { setError(e instanceof Error ? e.message : "학생 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    selectionCallback.current(groups.flatMap(group => group.students
      .filter(student => selectedIds.includes(student.id))
      .map(student => ({ id: student.id, name: student.name, grade: student.grade, group: group.group, classId: group.id }))));
  }, [selectedIds, groups]);

  async function mutate(action: () => Promise<void>) {
    if (lock.current || disabled || loading) return;
    lock.current = true;
    setBusy(true); setError(""); setStatus("");
    try { await action(); setStatus("학생 목록 변경사항이 저장되었습니다."); }
    catch (e) { setError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }

  function toggleStudent(id: string) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  }

  return (
    <aside aria-label="학생 목록" className={styles.sidebar} data-open={isOpen} inert={!isOpen}>
      <div className={styles.sidebarHeader}>
        <div className="flex items-center gap-3"><Users size={22} className="text-sky-400" /><h2 className="font-bold text-sm">반별 학생 목록</h2></div>
        <div className="flex gap-2">
          <button disabled={busy || loading || disabled} onClick={() => void refresh()} title="목록 새로고침" aria-label="목록 새로고침" className={styles.iconButton}><RefreshCw size={16} /></button>
          <button onClick={onClose} aria-label="학생 목록 닫기" className={styles.iconButton}><ChevronLeft size={18} /></button>
        </div>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        {error && <div role="alert" className="text-xs text-rose-700 bg-rose-50 p-3 rounded-lg">{error}<button disabled={busy || disabled} className="block underline mt-2" onClick={() => void refresh()}>목록 다시 불러오기</button></div>}
        <p role="status" className="text-xs text-slate-400">{loading ? "학생 목록을 불러오는 중…" : busy ? "변경사항 저장 중…" : status}</p>
        <fieldset disabled={busy || loading || disabled} className="space-y-3 disabled:opacity-60">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (!className.trim()) return; void mutate(async () => { const group = await addClass(className.trim()); setGroups(prev => [...prev, group]); setExpanded(prev => [...prev, group.id]); setClassName(""); }); }}>
            <input aria-label="새 반 이름" placeholder="새 반 이름" value={className} onChange={e => setClassName(e.target.value)} required maxLength={100} className="min-w-0 flex-1 rounded bg-slate-800 border border-slate-700 p-2 text-xs" />
            <button className={styles.primary}>반 추가</button>
          </form>
          {!loading && !error && groups.length === 0 && <p className="text-xs leading-6 text-slate-400 py-6">등록된 반과 학생이 없습니다.<br />반을 만든 뒤 학생을 추가해 주세요.</p>}
          {groups.map(group => {
            const isExpanded = expanded.includes(group.id);
            const allSelected = group.students.length > 0 && group.students.every(student => selectedIds.includes(student.id));
            return <div key={group.id} className={styles.group}>
              <div className={styles.groupHead}>
                <input type="checkbox" className={styles.checkbox} aria-label={`${group.group} 전체 선택`} ref={input => { if (input) input.indeterminate = !allSelected && group.students.some(student => selectedIds.includes(student.id)); }} checked={allSelected} disabled={!group.students.length} onChange={() => setSelectedIds(ids => allSelected ? ids.filter(id => !group.students.some(student => student.id === id)) : [...new Set([...ids, ...group.students.map(student => student.id)])])} />
                <button className="text-xs text-left flex-1 min-w-0 flex items-center justify-between gap-1" aria-expanded={isExpanded} onClick={() => setExpanded(ids => isExpanded ? ids.filter(id => id !== group.id) : [...ids, group.id])}><span className="truncate">{group.group} ({group.students.length})</span><ChevronDown size={14} className={isExpanded ? "rotate-180" : ""} /></button>
                <button aria-label={`${group.group} 학생 추가`} onClick={() => { setAddingTo(group.id); setName(""); setGrade(""); setExpanded(ids => [...new Set([...ids, group.id])]); }}><Plus size={16} /></button>
              </div>
              {addingTo === group.id && <form className="p-3 space-y-2" onSubmit={e => { e.preventDefault(); if (!name.trim() || !grade.trim()) return; void mutate(async () => { const student = await addStudent(group.id, name.trim(), grade.trim()); setGroups(prev => prev.map(item => item.id === group.id ? { ...item, students: [...item.students, student] } : item)); setAddingTo(null); setName(""); setGrade(""); }); }}>
                <input aria-label="학생 이름" placeholder="학생 이름" required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-xs" />
                <input aria-label="학년" placeholder="학년 (예: 중2)" required maxLength={30} value={grade} onChange={e => setGrade(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-xs" />
                <div className="flex gap-3 text-xs"><button className={styles.primary}>등록</button><button type="button" onClick={() => setAddingTo(null)}>취소</button></div>
              </form>}
              {isExpanded && <div className={styles.studentList}>
                {!group.students.length && <p className="p-4 text-xs text-slate-400">등록된 학생이 없습니다.</p>}
                {group.students.map(student => <div key={student.id} className={styles.student} data-selected={selectedIds.includes(student.id)}>
                  <input type="checkbox" className={styles.checkbox} aria-label={`${student.name} 선택`} checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <button className="text-left flex-1" onClick={() => setSelectedIds([student.id])}>{student.name}</button><span className="text-slate-400">{student.grade}</span>
                  <button aria-label={`${student.name} 퇴원 처리`} title="퇴원 처리 (보고서 보존)" className="p-1 text-slate-400 hover:text-rose-400" onClick={() => {
                    if (!window.confirm(`[${student.name}] 학생을 퇴원 처리할까요? 목록에서 숨겨지며 기존 보고서는 보존됩니다.`)) return;
                    void mutate(async () => { await archiveStudent(student.id, student.version); setGroups(prev => prev.map(item => ({ ...item, students: item.students.filter(value => value.id !== student.id) }))); setSelectedIds(ids => ids.filter(id => id !== student.id)); });
                  }}><Trash2 size={14} /></button>
                </div>)}
              </div>}
            </div>;
          })}
        </fieldset>
      </div>
      <div className={styles.selection}><span>선택한 학생 <strong>{selectedIds.length}</strong>명</span><button disabled={disabled || busy} onClick={() => setSelectedIds([])} className="text-rose-300">선택 해제</button></div>
    </aside>
  );
}
