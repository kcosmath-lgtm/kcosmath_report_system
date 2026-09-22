"use client";
import { useRosterRefresh } from "../../lib/use-roster-refresh";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, RefreshCw, Users } from "lucide-react";
import { loadStudents } from "../../lib/report-storage";
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
  const busy = false;
  const [error, setError] = useState("");
  const selectionCallback = useRef(onBatchSelect);
  selectionCallback.current = onBatchSelect;

  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setError("");
    try {
      const rows = await loadStudents();
      if (sequence !== refreshSequence.current) return;
      setGroups(rows);
      const activeIds = new Set(rows.flatMap(group => group.students.map(student => student.id)));
      setSelectedIds(ids => ids.filter(id => activeIds.has(id)));
    } catch (e) { setError(e instanceof Error ? e.message : "학생 목록을 불러오지 못했습니다."); }
    finally { if (sequence === refreshSequence.current) setLoading(false); }
  }, []);
  useRosterRefresh(refresh, disabled);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    selectionCallback.current(groups.flatMap(group => group.students
      .filter(student => selectedIds.includes(student.id))
      .map(student => ({ id: student.id, name: student.name, grade: student.grade, group: group.group, classId: group.id }))));
  }, [selectedIds, groups]);

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
        {(loading || busy) && <p role="status" className="text-xs text-slate-400">{loading ? "학생 목록을 불러오는 중…" : "변경사항 저장 중…"}</p>}
        <fieldset disabled={busy || loading || disabled} className="space-y-3 disabled:opacity-60">
          {!loading && !error && groups.length === 0 && <p className="text-xs leading-6 text-slate-400 py-6">등록된 반과 학생이 없습니다.<br />반을 만든 뒤 학생을 추가해 주세요.</p>}
          {groups.map(group => {
            const isExpanded = expanded.includes(group.id);
            const allSelected = group.students.length > 0 && group.students.every(student => selectedIds.includes(student.id));
            return <div key={group.id} className={styles.group}>
              <div className={styles.groupHead}>
                <input type="checkbox" className={styles.checkbox} aria-label={`${group.group} 전체 선택`} ref={input => { if (input) input.indeterminate = !allSelected && group.students.some(student => selectedIds.includes(student.id)); }} checked={allSelected} disabled={!group.students.length} onChange={() => setSelectedIds(ids => allSelected ? ids.filter(id => !group.students.some(student => student.id === id)) : [...new Set([...ids, ...group.students.map(student => student.id)])])} />
                <button className="text-xs text-left flex-1 min-w-0 flex items-center justify-between gap-1" aria-expanded={isExpanded} onClick={() => setExpanded(ids => isExpanded ? ids.filter(id => id !== group.id) : [...ids, group.id])}><span className="truncate">{group.group} ({group.students.length})</span><ChevronDown size={14} className={isExpanded ? "rotate-180" : ""} /></button>
              </div>
              {isExpanded && <div className={styles.studentList}>
                {!group.students.length && <p className="p-4 text-xs text-slate-400">등록된 학생이 없습니다.</p>}
                {group.students.map(student => <div key={student.id} className={styles.student} data-selected={selectedIds.includes(student.id)}>
                  <input type="checkbox" className={styles.checkbox} aria-label={`${student.name} 선택`} checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                  <button className="text-left flex-1" onClick={() => setSelectedIds([student.id])}>{student.name}</button><span className="text-slate-400">{student.grade}</span>
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
