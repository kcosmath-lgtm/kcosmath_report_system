"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ChevronDown, RotateCcw, ChevronLeft, Users, Plus, Trash2, X, Check } from "lucide-react";
import { STUDENT_DATA } from "../../constants/students";
import { StudentGroup } from "../../types/student";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (id: string, name: string, grade: string, group: string) => void;
  onBatchSelect: (students: { id: string; name: string; grade: string; group: string }[]) => void;
}

// 🌟 브라우저 환경에 구애받지 않는 안전하고 규격에 맞는 고유 ID 생성기
const generateShortId = () => {
  return "student_" + Math.random().toString(36).substring(2, 11);
};

export default function StudentSidebar({ isOpen, onClose, onSelectStudent, onBatchSelect }: SidebarProps) {
  const [localStudentData, setLocalStudentData] = useState<StudentGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // 학생 추가를 위한 상태
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");

  // ✅ 1. 데이터 동기화 로드 (기존 저장 데이터 유지 + 고등부 누락 방지 병합)
  useEffect(() => {
    const savedData = localStorage.getItem("cosmath_student_data");
    if (savedData) {
      try {
        let parsed: StudentGroup[] = JSON.parse(savedData);
        
        STUDENT_DATA.forEach((fileGroup) => {
          const existingGroup = parsed.find((g) => g.group === fileGroup.group);
          if (!existingGroup) {
            parsed.push(fileGroup);
          } else {
            fileGroup.students.forEach((fileStudent) => {
              const hasStudent = existingGroup.students.some((s) => s.id === fileStudent.id);
              if (!hasStudent) {
                existingGroup.students.push(fileStudent);
              }
            });
          }
        });

        setLocalStudentData(parsed);
        localStorage.setItem("cosmath_student_data", JSON.stringify(parsed));
      } catch (e) {
        setLocalStudentData(STUDENT_DATA);
      }
    } else {
      setLocalStudentData(STUDENT_DATA);
      localStorage.setItem("cosmath_student_data", JSON.stringify(STUDENT_DATA));
    }
  }, []);

  // ✅ 2. 데이터 상태 변화 추적 저장
  useEffect(() => {
    if (localStudentData.length > 0) {
      localStorage.setItem("cosmath_student_data", JSON.stringify(localStudentData));
    }
  }, [localStudentData]);

  // ✅ 3. 초기화 버튼 기능
  const handleResetData = () => {
    if (window.confirm("모든 학생 데이터를 소스코드 파일 기준으로 초기화하시겠습니까?\n(직접 수동 추가했거나 삭제한 학생 내역이 모두 사라집니다.)")) {
      localStorage.setItem("cosmath_student_data", JSON.stringify(STUDENT_DATA));
      setLocalStudentData(STUDENT_DATA);
      setSelectedIds([]);
      alert("최신 학생 데이터 목록으로 초기화되었습니다.");
    }
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName]
    );
  };

  const handleStudentCheck = (studentId: string, name: string, grade: string, groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const isSelected = prev.includes(studentId);
      const nextIds = isSelected ? prev.filter((id) => id !== studentId) : [...prev, studentId];

      const selectedStudentsObjects: { id: string; name: string; grade: string; group: string }[] = [];
      localStudentData.forEach((g) => {
        g.students.forEach((s) => {
          if (nextIds.includes(s.id)) {
            selectedStudentsObjects.push({ id: s.id, name: s.name, grade: s.grade, group: g.group });
          }
        });
      });

      onBatchSelect(selectedStudentsObjects);
      return nextIds;
    });
  };

  const handleGroupSelectAll = (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetGroup = localStudentData.find((g) => g.group === groupName);
    if (!targetGroup) return;

    const targetStudentIds = targetGroup.students.map((s) => s.id);
    const isAllSelected = targetStudentIds.every((id) => selectedIds.includes(id));

    let nextIds = [...selectedIds];
    if (isAllSelected) {
      nextIds = nextIds.filter((id) => !targetStudentIds.includes(id));
    } else {
      targetStudentIds.forEach((id) => {
        if (!nextIds.includes(id)) nextIds.push(id);
      });
    }

    setSelectedIds(nextIds);

    const selectedStudentsObjects: { id: string; name: string; grade: string; group: string }[] = [];
    localStudentData.forEach((g) => {
      g.students.forEach((s) => {
        if (nextIds.includes(s.id)) {
          selectedStudentsObjects.push({ id: s.id, name: s.name, grade: s.grade, group: g.group });
        }
      });
    });

    onBatchSelect(selectedStudentsObjects);
  };

  // ✅ 4. [수정 완료] 엔터 및 버튼 등록 연동 함수
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

    // 로컬 데이터 상태 갱신
    setLocalStudentData((prev) => {
      const updated = prev.map((g) => 
        g.group === groupName ? { ...g, students: [...g.students, newStudent] } : g
      );
      localStorage.setItem("cosmath_student_data", JSON.stringify(updated));
      return updated;
    });

    // 입력 필드 초기화 및 닫기
    setNewName("");
    setNewGrade("");
    setAddingToGroup(null);
  };

  // 🌟 인풋 박스에서 엔터 키 감지 로직 추가
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, groupName: string) => {
    if (e.key === "Enter") {
      e.preventDefault(); // 기본 폼 제출 액션 방지
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
    <div
      className={`bg-[#1e293b] text-slate-100 flex flex-col border-r border-slate-800 transition-all duration-300 shrink-0 h-full ${
        isOpen ? "w-72" : "w-0 overflow-hidden border-none"
      }`}
    >
      {/* Sidebar Header */}
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
          <button
            onClick={handleResetData}
            className="p-2 hover:bg-slate-800 text-slate-500 hover:text-sky-400 rounded-lg transition-colors"
            title="데이터 초기화"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* 목록 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
        {localStudentData.map((group) => {
          const isExpanded = expandedGroups.includes(group.group);
          const isGroupAllSelected =
            group.students.length > 0 && group.students.map((s) => s.id).every((id) => selectedIds.includes(id));

          return (
            <div
              key={group.group}
              className={`border border-slate-800/60 rounded-xl bg-slate-900/30 overflow-hidden transition-all duration-200 ${
                isExpanded ? "bg-slate-900/50 shadow-inner" : ""
              }`}
            >
              {/* 반 타이틀 */}
              <div
                onClick={() => toggleGroup(group.group)}
                className="flex items-center justify-between px-3.5 py-3 hover:bg-slate-800/40 cursor-pointer group/row transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    onClick={(e) => handleGroupSelectAll(group.group, e)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      isGroupAllSelected
                        ? "bg-emerald-500 border-emerald-600 text-white"
                        : "border-slate-700 hover:border-slate-500 bg-slate-950/40"
                    }`}
                  >
                    {isGroupAllSelected && <Check size={11} strokeWidth={3} />}
                  </div>
                  <span className="font-bold text-[12.5px] text-slate-300 group-hover/row:text-white transition-colors truncate">
                    {group.group}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full font-black tabular-nums">
                    {group.students.length}
                  </span>
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
                  <ChevronDown
                    size={14}
                    className={`text-slate-600 group-hover/row:text-slate-400 transition-transform duration-200 ${
                      isExpanded ? "transform rotate-180 text-sky-500" : ""
                    }`}
                  />
                </div>
              </div>

              {/* 🌟 엔터 버그 패치완료된 수동 입력 Form */}
              {addingToGroup === group.group && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/40 bg-slate-950/40 flex gap-1.5 items-center">
                  <input
                    type="text"
                    placeholder="이름"
                    autoFocus
                    className="flex-1 bg-slate-900 text-[11px] px-2 py-1.5 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200 font-medium"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, group.group)}
                  />
                  <input
                    type="text"
                    placeholder="학년"
                    className="w-12 bg-slate-900 text-[11px] px-2 py-1.5 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200 text-center font-medium"
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, group.group)}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddStudentSubmit(group.group)}
                    className="bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-[11px] px-3 py-1.5 rounded font-bold transition-all shrink-0"
                  >
                    등록
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewName("");
                      setNewGrade("");
                      setAddingToGroup(null);
                    }}
                    className="text-slate-500 hover:text-slate-300 p-1 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* 학생 리스트 */}
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
                          onClick={() => onSelectStudent(student.id, student.name, student.grade, group.group)}
                          className="flex items-center px-4 py-2.5 hover:bg-slate-800/30 cursor-pointer group transition-colors"
                        >
                          <div
                            onClick={(e) => handleStudentCheck(student.id, student.name, student.grade, group.group, e)}
                            className={`w-4 h-4 rounded border flex items-center justify-center mr-3 transition-all ${
                              isChecked
                                ? "bg-sky-500 border-sky-600 text-white"
                                : "border-slate-800 hover:border-slate-600 bg-slate-900"
                            }`}
                          >
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>

                          <span
                            className={`flex-1 text-[13px] transition-colors ${
                              isChecked ? "text-sky-400 font-bold" : "text-slate-400 group-hover:text-slate-200"
                            }`}
                          >
                            {student.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold bg-slate-800/60 px-1.5 py-0.5 rounded uppercase mr-2 tracking-wide">
                            {student.grade}
                          </span>
                          <button
                            onClick={(e) => handleRemoveStudent(group.group, student.id, student.name, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition-all"
                            title="학생 삭제"
                          >
                            <Trash2 size={12} />
                          </button>
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

      {/* 하단 바 */}
      <div className="p-4 bg-[#0f172a] border-t border-slate-800">
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Selected</span>
            <span className="text-xs font-bold text-slate-300">
              총 <span className="text-sky-400 font-black text-sm">{selectedIds.length}</span>명 선택됨
            </span>
          </div>
          {selectedIds.length > 0 && (
            <button
              onClick={() => setSelectedIds([])}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 transition-colors"
            >
              선택 해제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}