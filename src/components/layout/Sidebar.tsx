"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ChevronDown, RotateCcw, ChevronLeft, Users, Plus, Trash2, X, Check } from "lucide-react";
import { STUDENT_DATA } from "../../constants/students";
import { StudentGroup } from "../../types/student";

// 에러 방지용 인터페이스
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (id: string, name: string, grade: string, group: string) => void;
  onBatchSelect: (students: { id: string; name: string; grade: string; group: string }[]) => void;
}

export default function StudentSidebar({ isOpen, onClose, onSelectStudent, onBatchSelect }: SidebarProps) {
  const [localStudentData, setLocalStudentData] = useState<StudentGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // 학생 추가를 위한 상태
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");

  // ✅ 데이터 로드
  useEffect(() => {
    const savedData = localStorage.getItem("cosmath_student_data");
    if (savedData) {
      let parsed = JSON.parse(savedData);
      // 구버전 데이터(ID가 없는 데이터) 호환성 처리
      const hasMissingIds = parsed.some((g: any) => g.students.some((s: any) => !s.id));
      if (hasMissingIds) {
        parsed = STUDENT_DATA;
      }
      setLocalStudentData(parsed);
    } else {
      setLocalStudentData(STUDENT_DATA);
    }
  }, []);

  // ✅ 데이터 저장
  useEffect(() => {
    if (localStudentData.length > 0) {
      localStorage.setItem("cosmath_student_data", JSON.stringify(localStudentData));
    }
  }, [localStudentData]);

  const totalStudents = useMemo(() =>
    localStudentData.reduce((acc, curr) => acc + curr.students.length, 0)
    , [localStudentData]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]
    );
  };

  // 선택된 ID가 바뀔 때마다 page.tsx의 리스트를 업데이트
  useEffect(() => {
    const selectedStudentObjects = localStudentData.flatMap(group =>
      group.students
        .filter(s => selectedIds.includes(s.id))
        .map(s => ({ id: s.id, name: s.name, grade: s.grade, group: group.group }))
    );
    onBatchSelect(selectedStudentObjects);
  }, [selectedIds, onBatchSelect, localStudentData]);

  const toggleStudentCheck = (studentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(studentId) ? prev.filter(i => i !== studentId) : [...prev, studentId]
    );
  };

  const toggleGroupCheck = (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const group = localStudentData.find(g => g.group === groupName);
    if (!group) return;

    const groupStudentIds = group.students.map(s => s.id);
    const isAllSelected = groupStudentIds.every(id => selectedIds.includes(id));

    if (!isAllSelected) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...groupStudentIds])));
    } else {
      setSelectedIds(prev => prev.filter(id => !groupStudentIds.includes(id)));
    }
  };

  const handleAddStudent = (groupName: string) => {
    if (!newName.trim() || !newGrade.trim()) return;

    setLocalStudentData(prev => prev.map(group => {
      if (group.group === groupName) {
        return {
          ...group,
          students: [...group.students, { id: crypto.randomUUID(), name: newName.trim(), grade: newGrade.trim() }]
        };
      }
      return group;
    }));

    setNewName("");
    setNewGrade("");
    setAddingToGroup(null);
  };

  const handleRemoveStudent = (groupName: string, studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${studentName} 학생을 삭제하시겠습니까?`)) return;

    setLocalStudentData(prev => prev.map(group => {
      if (group.group === groupName) {
        return {
          ...group,
          students: group.students.filter(s => s.id !== studentId)
        };
      }
      return group;
    }));

    // 선택 목록에서도 제거
    setSelectedIds(prev => prev.filter(i => i !== studentId));
  };

  const handleResetData = () => {
    if (!confirm("모든 학생 데이터를 초기 상태로 되돌리시겠습니까?")) return;
    setLocalStudentData(STUDENT_DATA);
    setSelectedIds([]);
    localStorage.removeItem("cosmath_student_data");
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-[100] w-80 bg-[#1e293b] text-slate-300 flex flex-col transition-all duration-300 transform ${isOpen ? "translate-x-0" : "-translate-x-full"} shadow-2xl`}>
      <div className="h-14 min-h-[56px] px-6 flex items-center justify-between border-b border-slate-700/50 bg-[#0f172a]">
        <div>
          <h2 className="text-white font-black text-lg tracking-tight">CosMath</h2>
          <p className="text-[8px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Management</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleResetData} className="p-1.5 hover:bg-slate-700 rounded-full text-rose-400" title="데이터 초기화">
            <RotateCcw size={16} />
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-full text-slate-400">
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      <div className="px-6 py-3 flex justify-between items-center text-[11px] font-bold text-slate-500 border-b border-slate-700/30 bg-[#1e293b]">
        <div className="flex items-center gap-2"><Users size={12} /><span>재원생 <span className="text-slate-300">{totalStudents}</span>명</span></div>
        <button className="flex items-center gap-1 text-sky-500/80 hover:text-sky-400" onClick={() => setSelectedIds([])}><RotateCcw size={10} /><span>선택 초기화</span></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {localStudentData.map((group) => {
          const isExpanded = expandedGroups.includes(group.group);
          const groupStudentIds = group.students.map(s => s.id);
          const isAllSelected = groupStudentIds.length > 0 && groupStudentIds.every(id => selectedIds.includes(id));
          const isSomeSelected = groupStudentIds.some(id => selectedIds.includes(id)) && !isAllSelected;

          return (
            <div key={group.group} className="rounded-xl overflow-hidden">
              <div className={`flex items-center px-3 py-2.5 cursor-pointer rounded-lg transition-all ${isExpanded ? "bg-slate-800 text-white" : "hover:bg-slate-800/50"}`} onClick={() => toggleGroup(group.group)}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isAllSelected ? "bg-sky-500 border-sky-500" : isSomeSelected ? "bg-slate-600 border-slate-500" : "border-slate-600"}`} onClick={(e) => toggleGroupCheck(group.group, e)}>
                  {isAllSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  {isSomeSelected && <div className="w-2 h-[2px] bg-slate-300" />}
                </div>
                <span className="flex-1 text-[13px] font-semibold truncate mr-2">{group.group}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingToGroup(group.group === addingToGroup ? null : group.group); }}
                    className="p-1 hover:bg-slate-700 rounded text-sky-400"
                  >
                    <Plus size={14} />
                  </button>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                </div>
              </div>

              {addingToGroup === group.group && (
                <div className="mx-3 mt-1 mb-2 p-2 bg-slate-800/80 rounded-lg flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="이름"
                    className="w-20 bg-slate-900 text-[11px] px-2 py-1 rounded outline-none border border-slate-700 focus:border-sky-500"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="학년"
                    className="w-12 bg-slate-900 text-[11px] px-2 py-1 rounded outline-none border border-slate-700 focus:border-sky-500"
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value)}
                  />
                  <button onClick={() => handleAddStudent(group.group)} className="text-sky-400 hover:text-sky-300"><Check size={16} /></button>
                  <button onClick={() => setAddingToGroup(null)} className="text-slate-500 hover:text-slate-400"><X size={16} /></button>
                </div>
              )}

              {isExpanded && (
                <div className="mt-1 mb-2 space-y-0.5">
                  {group.students.map((student) => {
                    const isChecked = selectedIds.includes(student.id);
                    return (
                      <div key={student.id} className="group flex items-center ml-7 mr-1 px-3 py-2 rounded-lg cursor-pointer hover:bg-sky-500/10" onClick={() => onSelectStudent(student.id, student.name, student.grade, group.group)}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isChecked ? "bg-sky-500 border-sky-500" : "border-slate-700"}`} onClick={(e) => toggleStudentCheck(student.id, e)}>
                          {isChecked && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <span className={`flex-1 text-[13px] ${isChecked ? "text-sky-400 font-bold" : "text-slate-400 group-hover:text-slate-200"}`}>{student.name}</span>
                        <span className="text-[10px] text-slate-600 font-bold bg-slate-800/50 px-1.5 py-0.5 rounded uppercase mr-2">{student.grade}</span>
                        <button
                          onClick={(e) => handleRemoveStudent(group.group, student.id, student.name, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-4 bg-[#0f172a] border-t border-slate-800">
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700">
          <div className="flex flex-col"><span className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Selected</span><span className="text-xs text-slate-300 font-medium">선택된 학생</span></div>
          <span className="text-2xl font-black text-sky-400">{selectedIds.length}</span>
        </div>
      </div>
    </div>
  );
}
