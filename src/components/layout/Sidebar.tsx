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

// 🌟 안전한 고유 ID 생성을 위한 함수 (crypto.randomUUID 에러 방지)
const generateId = () => {
  return "id_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
};

export default function StudentSidebar({ isOpen, onClose, onSelectStudent, onBatchSelect }: SidebarProps) {
  const [localStudentData, setLocalStudentData] = useState<StudentGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // 학생 추가를 위한 상태
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");

  // ✅ 데이터 로드 및 최신 파일 데이터 강제 동기화 (고등부 누락 방지)
  useEffect(() => {
    const savedData = localStorage.getItem("cosmath_student_data");
    if (savedData) {
      try {
        let parsed: StudentGroup[] = JSON.parse(savedData);
        
        // 🌟 파일(students.ts)에는 있는데 로컬스토리지엔 없는 새로운 반이나 고등부 데이터를 찾아서 병합
        STUDENT_DATA.forEach((fileGroup) => {
          const existingGroup = parsed.find((g) => g.group === fileGroup.group);
          if (!existingGroup) {
            // 새로 추가된 고등부 반 전체를 추가
            parsed.push(fileGroup);
          } else {
            // 반은 존재하는데 파일에 새로 추가된 학생이 있다면 병합
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

  // ✅ 데이터 저장
  useEffect(() => {
    if (localStudentData.length > 0) {
      localStorage.setItem("cosmath_student_data", JSON.stringify(localStudentData));
    }
  }, [localStudentData]);

  // ✅ 초기화 버튼 클릭 시 완벽하게 최신 고등부 포함 데이터로 덮어쓰기
  const handleResetData = () => {
    if (window.confirm("모든 학생 데이터를 파일(STUDENT_DATA) 기준으로 초기화하시겠습니까?\n(직접 추가하거나 삭제한 내역이 사라집니다.)")) {
      localStorage.setItem("cosmath_student_data", JSON.stringify(STUDENT_DATA));
      setLocalStudentData(STUDENT_DATA);
      setSelectedIds([]);
      alert("최신 고등부 학생 데이터로 초기화되었습니다.");
    }
  };

  // 그룹 확장/축소 토글
  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName]
    );
  };

  // 개별 학생 선택/해제 토글
  const handleStudentCheck = (studentId: string, name: string, grade: string, groupName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 로우 클릭 이벤트 전파 방지

    setSelectedIds((prev) => {
      const isSelected = prev.includes(studentId);
      const nextIds = isSelected ? prev.filter((id) => id !== studentId) : [...prev, studentId];

      // 일괄 편집 모드 타겟 전달용 객체 배열 생성
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

  // 특정 반 전체 선택/해제
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

  // 학생 직접 추가하기 실행
  const handleAddStudentSubmit = (groupName: string) => {
    if (!newName.trim() || !newGrade.trim()) {
      alert("이름과 학년을 모두 입력해 주세요.");
      return;
    }

    const newStudent = {
      id: generateId(),
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

  // 학생 삭제하기
  const handleRemoveStudent = (groupName: string, studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`[${studentName}] 학생을 목록에서 정말 삭제하시겠습니까?`)) {
      setLocalStudentData((prev) =>
        prev.map((g) => (g.group === groupName ? { ...g, students: g.students.filter((s) => s.id !== studentId) } : g))
      );
      setSelectedIds((prev) => prev.filter((id) => id !== studentId));
    }
  };

  const sortedStudentData = useMemo(() => {
    return [...localStudentData];
  }, [localStudentData]);

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
            title="데이터 새로고침/초기화"
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

      {/* 반 및 학생 목록 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
        {sortedStudentData.map((group) => {
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
              {/* 반 타이틀 로우 */}
              <div
                onClick={() => toggleGroup(group.group)}
                className="flex items-center justify-between px-3.5 py-3 hover:bg-slate-800/40 cursor-pointer group/row transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* 반별 일괄 선택 체크박스 */}
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

              {/* 학생 직접 추가 인라인 Form */}
              {addingToGroup === group.group && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/40 bg-slate-950/20 flex gap-1.5 items-center">
                  <input
                    type="text"
                    placeholder="이름"
                    className="flex-1 bg-slate-900 text-[11px] px-2 py-1 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="학년"
                    className="w-12 bg-slate-900 text-[11px] px-2 py-1 rounded outline-none border border-slate-700 focus:border-sky-500 text-slate-200 text-center"
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value)}
                  />
                  <button
                    onClick={() => handleAddStudentSubmit(group.group)}
                    className="bg-sky-600 hover:bg-sky-500 text-white text-[10px] px-2.5 py-1 rounded font-bold transition-colors"
                  >
                    등록
                  </button>
                  <button
                    onClick={() => setAddingToGroup(null)}
                    className="text-slate-500 hover:text-slate-300 p-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* 반 내부 학생 리스트 */}
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
                          {/* 개별 체크박스 */}
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

      {/* 하단 선택 요약 바 */}
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