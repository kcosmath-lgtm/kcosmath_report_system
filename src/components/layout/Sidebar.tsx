"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, RotateCcw, ChevronLeft, Users, Plus, Trash2, X, Check } from "lucide-react";
import { STUDENT_DATA } from "../../constants/students";
import { StudentGroup } from "../../types/student";
import { getSetting, saveSetting } from "../../lib/supabase";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (id: string, name: string, grade: string, group: string) => void;
  onBatchSelect: (students: { id: string; name: string; grade: string; group: string }[]) => void;
}

const generateShortId = () => {
  return "student_" + Math.random().toString(36).substring(2, 11);
};

export default function StudentSidebar({ isOpen, onClose, onSelectStudent, onBatchSelect }: SidebarProps) {
  const [localStudentData, setLocalStudentData] = useState<StudentGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");

  const [isInitialized, setIsInitialized] = useState(false);

  // 데이터 로드
  useEffect(() => {
    async function loadStudentData() {
      let currentData: StudentGroup[] = STUDENT_DATA;
      let shouldForceSave = false;

      const hasDuplicateIds = (groups: StudentGroup[]) => {
        const ids = new Set<string>();
        for (const g of groups) {
          for (const s of g.students) {
            if (ids.has(s.id)) return true;
            ids.add(s.id);
          }
        }
        return false;
      };

      try {
        const dbData = await getSetting<StudentGroup[] | null>("cosmath_student_data", null);
        if (dbData && dbData.length > 0) {
          if (hasDuplicateIds(dbData)) {
            currentData = STUDENT_DATA;
            shouldForceSave = true;
          } else {
            currentData = dbData;
          }
        } else {
          shouldForceSave = true;
        }
      } catch (e) {
        console.error("Supabase 학생 데이터 로드 실패:", e);
      }

      const merged: StudentGroup[] = currentData.map(g => ({ ...g, students: [...g.students] }));

      STUDENT_DATA.forEach((fileGroup) => {
        const existingGroup = merged.find((g) => g.group === fileGroup.group);
        if (!existingGroup) {
          merged.push({ ...fileGroup, students: [...fileGroup.students] });
          shouldForceSave = true;
        }
      });

      setLocalStudentData(merged);
      if (shouldForceSave) {
        await saveSetting("cosmath_student_data", merged);
      }
      setIsInitialized(true);
    }

    loadStudentData();
  }, []);

  // 자동 저장
  useEffect(() => {
    if (!isInitialized || localStudentData.length === 0) return;
    const handler = setTimeout(() => {
      saveSetting("cosmath_student_data", localStudentData);
    }, 1000);
    return () => clearTimeout(handler);
  }, [localStudentData, isInitialized]);

  const handleResetData = async () => {
    if (window.confirm("모든 학생 데이터를 소스코드 파일 기준으로 초기화하시겠습니까?")) {
      setLocalStudentData(STUDENT_DATA);
      setSelectedIds([]);
      await saveSetting("cosmath_student_data", STUDENT_DATA);
      alert("최신 학생 데이터 목록으로 초기화되었습니다.");
    }
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName]
    );
  };

  // selectedIds 변경을 부모 컴포넌트에 안전하게 전달 (렌더링 사이클 외부)
  useEffect(() => {
    if (!isInitialized) return;
    const selectedStudentsObjects: { id: string; name: string; grade: string; group: string }[] = [];
    localStudentData.forEach((g) => {
      g.students.forEach((s) => {
        if (selectedIds.includes(s.id)) {
          selectedStudentsObjects.push({ id: s.id, name: s.name, grade: s.grade, group: g.group });
        }
      });
    });
    onBatchSelect(selectedStudentsObjects);
  }, [selectedIds, localStudentData, isInitialized, onBatchSelect]);

  // 개별 체크박스 토글
  const handleStudentCheck = (studentId: string, name: string, grade: string, groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const isSelected = prev.includes(studentId);
      return isSelected ? prev.filter((id) => id !== studentId) : [...prev, studentId];
    });
  };

  // 반 전체 선택/해제
  const handleGroupSelectAll = (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetGroup = localStudentData.find((g) => g.group === groupName);
    if (!targetGroup) return;

    const targetStudentIds = targetGroup.students.map((s) => s.id);
    const isAllSelected = targetStudentIds.every((id) => selectedIds.includes(id));

    setSelectedIds((prev) => {
      let nextIds = [...prev];
      if (isAllSelected) {
        nextIds = nextIds.filter((id) => !targetStudentIds.includes(id));
      } else {
        targetStudentIds.forEach((id) => {
          if (!nextIds.includes(id)) nextIds.push(id);
        });
      }
      return nextIds;
    });
  };

  // 🌟 [수정] 학생 이름/행 자체를 클릭하여 단일 선택 시 체크박스 상태도 1명으로 연동
  const handleSingleStudentClick = (id: string, name: string, grade: string, groupName: string) => {
    setSelectedIds([id]); // 체크박스 상태를 이 학생 단 한명으로 교체 (유령 버그 제거)
    onSelectStudent(id, name, grade, groupName);
  };

  const handleAddStudentSubmit = (groupName: string) => {
    if (!newName.trim() || !newGrade.trim()) {
      alert("이름과 학년을 모두 입력해 주세요.");
      return;
    }

    const newStudent = {
      id: generateShortId(),
      name: newName.trim(),
      grade: newGrade.trim(),
    };

    setLocalStudentData((prev) =>
      prev.map((g) => (g.group === groupName ? { ...g, students: [...g.students, newStudent] } : g))
    );

    setNewName("");
    setNewGrade("");
    setAddingToGroup(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, groupName: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddStudentSubmit(groupName);
    }
  };

  const handleRemoveStudent = (groupName: string, studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`[${studentName}] 학생을 목록에서 정말 삭제하시겠습니까?`)) {
      setLocalStudentData((prev) =>
        prev.map((g) => (g.group === groupName ? { ...g, students: g.students.filter((s) => s.id !== studentId) } : g))
      );
      setSelectedIds((prev) => prev.filter((id) => id !== studentId));
    }
  };

  return (
    <div className={`bg-[#1e293b] text-slate-100 flex flex-col border-r border-slate-800 transition-all duration-300 shrink-0 h-full ${isOpen ? "w-72" : "w-0 overflow-hidden border-none"}`}>
      <div className="h-24 px-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#1e293b] z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-400 border border-sky-500/20">
            <Users size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-slate-200">반별 학생 목록</span>
            <span className="text-[10px] text-slate-500 font-medium">COSMATH ACADEMY</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleResetData} className="p-2 hover:bg-slate-800 text-slate-500 hover:text-sky-400 rounded-lg transition-colors" title="데이터 초기화">
            <RotateCcw size={16} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-500 hover:text-rose-400 rounded-lg transition-colors">
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
        {localStudentData.map((group) => {
          const isExpanded = expandedGroups.includes(group.group);
          const isGroupAllSelected = group.students.length > 0 && group.students.map((s) => s.id).every((id) => selectedIds.includes(id));

          return (
            <div key={group.group} className={`border border-slate-800/60 rounded-xl bg-slate-900/30 overflow-hidden transition-all duration-200 ${isExpanded ? "bg-slate-900/50 shadow-inner" : ""}`}>
              <div onClick={() => toggleGroup(group.group)} className="flex items-center justify-between px-3.5 py-3 hover:bg-slate-800/40 cursor-pointer group/row transition-colors">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    onClick={(e) => handleGroupSelectAll(group.group, e)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isGroupAllSelected ? "bg-emerald-500 border-emerald-600 text-white" : "border-slate-700 hover:border-slate-500 bg-slate-950/40"}`}
                  >
                    {isGroupAllSelected && <Check size={11} strokeWidth={3} />}
                  </div>
                  <span className="font-bold text-[12.5px] text-slate-300 group-hover/row:text-white transition-colors truncate">{group.group}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-black tabular-nums">{group.students.length}</span>
                </div>

                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingToGroup(addingToGroup === group.group ? null : group.group);
                      if (addingToGroup !== group.group) {
                        setExpandedGroups((prev) => prev.includes(group.group) ? prev : [...prev, group.group]);
                      }
                    }}
                    className="p-1 hover:bg-slate-700 text-slate-500 hover:text-sky-400 rounded transition-colors"
                    title="학생 추가"
                  >
                    <Plus size={14} />
                  </button>
                  <ChevronDown size={14} className={`text-slate-600 group-hover/row:text-slate-400 transition-transform duration-200 ${isExpanded ? "transform rotate-180 text-sky-500" : ""}`} />
                </div>
              </div>

              {addingToGroup === group.group && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/40 bg-slate-950/40 flex gap-1.5 items-center">
                  <input type="text" placeholder="이름" autoFocus className="flex-1 bg-slate-900 text-[11px] px-2 py-1.5 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200 font-medium" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => handleKeyDown(e, group.group)} />
                  <input type="text" placeholder="학년" className="w-12 bg-slate-900 text-[11px] px-2 py-1.5 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200 text-center font-medium" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} onKeyDown={(e) => handleKeyDown(e, group.group)} />
                  <button type="button" onClick={() => handleAddStudentSubmit(group.group)} className="bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-[11px] px-3 py-1.5 rounded font-bold transition-all shrink-0">등록</button>
                  <button type="button" onClick={() => { setNewName(""); setNewGrade(""); setAddingToGroup(null); }} className="text-slate-500 hover:text-slate-300 p-1 shrink-0"><X size={13} /></button>
                </div>
              )}

              {isExpanded && (
                <div className="border-t border-slate-800/40 divide-y divide-slate-800/30 bg-slate-950/10">
                  {group.students.length === 0 ? (
                    <div className="text-center py-4 text-[11px] text-slate-600 italic">등록된 학생이 없습니다.</div>
                  ) : (
                    group.students.map((student) => {
                      const isChecked = selectedIds.includes(student.id);

                      return (
                        <div
                          key={student.id}
                          // 🌟 변경된 단일 클릭 핸들러 적용
                          onClick={() => handleSingleStudentClick(student.id, student.name, student.grade, group.group)}
                          className="flex items-center px-4 py-2.5 hover:bg-slate-800/30 cursor-pointer group transition-colors"
                        >
                          <div
                            onClick={(e) => handleStudentCheck(student.id, student.name, student.grade, group.group, e)}
                            className={`w-4 h-4 rounded border flex items-center justify-center mr-3 transition-all ${isChecked ? "bg-sky-500 border-sky-600 text-white" : "border-slate-800 hover:border-slate-600 bg-slate-900"}`}
                          >
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>

                          <span className={`flex-1 text-[13px] transition-colors ${isChecked ? "text-sky-400 font-bold" : "text-slate-400 group-hover:text-slate-200"}`}>{student.name}</span>
                          <span className="text-[10px] text-slate-500 font-bold bg-slate-800/60 px-1.5 py-0.5 rounded uppercase mr-2 tracking-wide">{student.grade}</span>
                          <button onClick={(e) => handleRemoveStudent(group.group, student.id, student.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition-all" title="학생 삭제"><Trash2 size={12} /></button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-[#0f172a] border-t border-slate-800">
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Selected</span>
            <span className="text-xs font-bold text-slate-300">총 <span className="text-sky-400 font-black text-sm">{selectedIds.length}</span>명 선택됨</span>
          </div>
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])} className="text-[11px] text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 transition-colors">선택 해제</button>
          )}
        </div>
      </div>
    </div>
  );
}