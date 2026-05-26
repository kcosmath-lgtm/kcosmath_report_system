"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import StudentSidebar from "../components/layout/Sidebar";
import RightSidebar from "../components/layout/RightSidebar";
import { GradeContent } from "../constants/reportContents";
import { Menu, Download, ChevronLeft, ChevronRight, Users, User, Loader2, Settings } from "lucide-react";
import { toBlob } from "html-to-image";
import Image from "next/image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getFormattedDate } from "../utils/date";
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import 'dayjs/locale/ko';

// 모든 변수 내용 편집 가능하도록 인터페이스 설정
interface ReportData {
  date: string;
  type: "정규" | "보충";
  teacher: string;
  name: string;
  subject: string;
  grade: string;
  book: string;
  attendance: string;
  time: string;
  status: string;
  reason: string;
  progress: string;
  hwLast: string;
  hwCurrent: string;
  notes: string;
}

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLTextAreaElement>(null);
  const [selectedStudents, setSelectedStudents] = useState<{ id: string, name: string, grade: string, group: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0); // 현재 보고 있는 학생 인덱스

  // ✅ 공통 데이터 (일괄 편집 시 사용)
  const [commonData, setCommonData] = useState<ReportData>({
    date: getFormattedDate(),
    type: "정규",
    teacher: "신기정T",
    name: "", // 렌더링 시 오버라이드 됨
    subject: "수학",
    grade: "", // 렌더링 시 오버라이드 됨
    book: "",
    attendance: "o",
    time: "15:30 ~ 17:30",
    status: "-",
    reason: "-",
    progress: "",
    hwLast: "-",
    hwCurrent: "-",
    notes: ""
  });

  // ✅ 개별 오버라이드 데이터 (학생 이름 기준)
  const [overrides, setOverrides] = useState<Record<string, Partial<ReportData>>>({});

  // ✅ 데이터 로드 (Client-side only to avoid hydration mismatch)
  useEffect(() => {
    const savedCommon = localStorage.getItem("cosmath_common_data");
    const savedOverrides = localStorage.getItem("cosmath_overrides_data");

    if (savedCommon) {
      const parsed = JSON.parse(savedCommon);
      // ✅ 날짜는 항상 현재 날짜를 사용하도록 제외
      const { date, ...restData } = parsed;
      setCommonData(prev => ({ ...prev, ...restData }));
    }
    if (savedOverrides) {
      setOverrides(JSON.parse(savedOverrides));
    }
  }, []);

  // ✅ 데이터 저장 - commonData
  useEffect(() => {
    localStorage.setItem("cosmath_common_data", JSON.stringify(commonData));
  }, [commonData]);

  // ✅ 데이터 저장 - overrides
  useEffect(() => {
    localStorage.setItem("cosmath_overrides_data", JSON.stringify(overrides));
  }, [overrides]);

  // ✅ 실시간 날짜 업데이트 (1분마다 확인)
  useEffect(() => {
    const timer = setInterval(() => {
      const nowFormatted = getFormattedDate();

      // 사용자가 직접 수정하거나 이미 저장된 데이터가 오늘 날짜와 다를 때만 업데이트
      // (단, commonData.date가 비어있거나 초기화된 상태일 때만 자동 업데이트하는 것이 안전할 수 있음)
      // 여기서는 '오늘 날짜'와 다르면 자동으로 갱신하되, 
      // 사용자가 수동으로 고쳤는지 여부를 판단하기 위해 getFormattedDate() 결과와 비교합니다.

      setCommonData(prev => {
        // 이미 오늘 날짜라면 업데이트 불필요
        if (prev.date === nowFormatted) return prev;

        // 만약 기존 날짜가 어제 날짜였다면(또는 getFormattedDate()의 이전 결과였다면) 업데이트
        // 이 로직은 정교하게 하려면 '수동 편집 여부' 상태를 따로 두는게 좋지만, 
        // 간단하게는 '값이 비어있거나 날짜 형식일 때' 업데이트하도록 할 수 있습니다.
        return { ...prev, date: nowFormatted };
      });
    }, 60000); // 1분마다 체크

    return () => clearInterval(timer);
  }, []);

  // ✅ 편집 모드 상태 (false: 일괄 편집, true: 개별 편집)
  const [isIndividualMode, setIsIndividualMode] = useState(false);

  // 현재 보고 있는 학생 식별자 (이름-학년 조합이 유니크하다고 가정하거나 단순 이름 사용)
  // 여기서는 간단히 이름 사용 (실제 서비스에선 ID 필요)
  const currentStudent = useMemo(() => {
    return selectedStudents[currentIndex] || null;
  }, [selectedStudents, currentIndex]);

  // ✅ 최종 렌더링할 데이터 계산 (Derived State)
  const reportData = useMemo(() => {
    if (!currentStudent) return commonData;

    const studentOverride = overrides[currentStudent.id] || {};

    return {
      ...commonData,
      ...studentOverride,
      name: currentStudent.name,  // 이름은 항상 현재 선택된 학생
      grade: currentStudent.grade // 학년도 항상 현재 선택된 학생
    };
  }, [commonData, overrides, currentStudent]);

  // ✅ 진도 textarea 높이 자동 조절
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.height = 'auto';
      progressRef.current.style.height = `${progressRef.current.scrollHeight}px`;
    }
  }, [reportData.progress, currentStudent]);

  const getDefaultTime = (grade: string) => {
    if (grade.includes("초")) return "15:30 ~ 17:30";
    if (grade.includes("중")) return "17:30 ~ 19:30";
    return "15:30 ~ 17:30"; // Default fallback
  };

  const getDefaultTeacher = (group: string) => {
    if (group.includes("중1 정규반") || group.includes("초등 심화반")) return "신기정T";
    if (group.includes("중2 정규반") || group.includes("초6 정규반")) return "홍정욱T";
    if (group.includes("중3 정규반")) return "김윤재T";
    if (group.includes("초등 기본반") || group.includes("중등 개별반")) return "백금채T";
    return "신기정T"; // Default fallback
  };

  const handleBatchSelect = useCallback((students: { id: string; name: string; grade: string; group: string }[]) => {
    setSelectedStudents(students);
    setCurrentIndex(0);

    // ✅ 학년에 따른 기본 시간 및 반에 따른 담당 교사 설정
    if (students.length > 0) {
      setCommonData(prev => ({
        ...prev,
        time: getDefaultTime(students[0].grade),
        teacher: getDefaultTeacher(students[0].group)
      }));
    }
  }, []);

  const nextReport = () => {
    if (currentIndex < selectedStudents.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const prevReport = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const updateField = (key: keyof ReportData, value: string) => {
    // ✅ 변경된 로직: 일괄 편집이든 개별 편집이든 "선택된 학생들"에게만 오버라이드를 적용합니다.
    // 기존에는 일괄 편집 시 commonData(전역)를 바꿨으나, 이는 선택되지 않은 학생에게도 영향을 주는 문제가 있었습니다.

    let targets: { id: string, name: string, grade: string, group: string }[] = [];

    if (isIndividualMode) {
      // 개별 모드: 현재 보고 있는 학생만
      if (currentStudent) targets = [currentStudent];
    } else {
      // 일괄 모드: 선택된 모든 학생
      targets = selectedStudents;
    }

    if (targets.length === 0) return;

    setOverrides(prev => {
      const next = { ...prev };
      targets.forEach(student => {
        // 각 학생별 오버라이드 업데이트 (commonData 건드리지 않음)
        next[student.id] = {
          ...(next[student.id] || {}),
          [key]: value
        };
      });
      return next;
    });
  };

  const handleApplyGradeData = (data: GradeContent) => {
    if (selectedStudents.length === 0) {
      alert("데이터를 적용할 학생을 먼저 선택해주세요.");
      return;
    }

    const targets = isIndividualMode ? (currentStudent ? [currentStudent] : []) : selectedStudents;

    if (targets.length === 0) return;

    setOverrides(prev => {
      const next = { ...prev };
      targets.forEach(student => {
        next[student.id] = {
          ...(next[student.id] || {}),
          book: data.book,
          progress: data.progress,
          notes: data.notes
        };
      });
      return next;
    });

    // 적용 시 우측 사이드바 닫기 (선택 사항)
    // setIsRightSidebarOpen(false);
  };

  // 사이드바 단일 선택 시 (일단 리스트를 해당 학생 1명으로 재설정한다고 가정하거나,
  // 기획에 따라 그냥 뷰만 바꿀 수도 있음. 기존 로직 유지)
  const handleSelectStudent = (id: string, name: string, grade: string, group: string) => {
    // 단일 선택 시에도 selectedStudents를 해당 학생 1명으로 갱신하거나
    // 혹은 전체 리스트에서 해당 학생 인덱스로 이동하는 로직이 필요할 수 있음.
    // 여기서는 기존 로직과 호환성을 위해 commonData의 name/grade는 업데이트 하지 않고
    // selectedStudents를 1명으로 만드는게 깔끔함.
    const newStudent = { id, name, grade, group };
    setSelectedStudents([newStudent]);
    setCurrentIndex(0);

    // ✅ 학년에 따른 기본 시간 및 반에 따른 담당 교사 설정
    setCommonData(prev => ({
      ...prev,
      time: getDefaultTime(grade),
      teacher: getDefaultTeacher(group)
    }));
  };

  // ✅ 이미지 생성 중 로딩 상태
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);






  const saveAsImage = async () => {
    if (!reportRef.current || selectedStudents.length === 0) return;
    setIsGeneratingImage(true);

    try {
      // 1. 단일 선택인 경우: 바로 저장
      if (selectedStudents.length === 1) {
        // html-to-image 사용
        const blob = await toBlob(reportRef.current, { backgroundColor: "#ffffff", pixelRatio: 3 });

        // 파일명: [학년] [이름]
        const fileName = `${reportData.grade} ${reportData.name}`;

        if (blob) {
          saveAs(blob, `${fileName}.jpg`);
        }
      } else {
        // 2. 다중 선택인 경우: 순회하며 캡처 후압축
        const zip = new JSZip();

        // 학년 통일 여부 확인
        const firstGrade = selectedStudents[0].grade;
        const isAllSameGrade = selectedStudents.every(s => s.grade === firstGrade);

        // 폴더 구조 결정: 모두 같은 학년이면 해당 학년 폴더 생성
        const targetFolder = isAllSameGrade ? zip.folder(firstGrade) : zip;
        if (!targetFolder) throw new Error("Zip folder creation failed");

        // 현재 인덱스 저장 (작업 후 복구용)
        const originalIndex = currentIndex;

        // 순차적으로 캡처
        for (let i = 0; i < selectedStudents.length; i++) {
          const student = selectedStudents[i];

          // 화면 전환
          setCurrentIndex(i);

          // 렌더링 대기 (React 상태 업데이트 후 DOM 반영 시간 확보)
          await new Promise(resolve => setTimeout(resolve, 300)); // 시간을 조금 넉넉히

          if (reportRef.current) {
            const blob = await toBlob(reportRef.current, { backgroundColor: "#ffffff", pixelRatio: 3 });

            // 파일명: [학년] [이름].jpg
            const fileName = `${student.grade} ${student.name}.jpg`;

            if (blob) {
              targetFolder.file(fileName, blob);
            }
          }
        }

        // 작업 완료 후 원래 인덱스로 복구
        setCurrentIndex(originalIndex);

        // Zip 다운로드
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = isAllSameGrade ? `${firstGrade}_학습보고서.zip` : `학습보고서_모음_${getFormattedDate()}.zip`;
        saveAs(zipBlob, zipName);
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("이미지 저장 중 오류가 발생했습니다. (지원되지 않는 색상 형식 등)");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-200 font-['Hamchorom_Dotum', 'Dotum', 'sans-serif']">
      <StudentSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectStudent={handleSelectStudent}
        onBatchSelect={handleBatchSelect}
      />
      <div className="flex-1 flex flex-col overflow-auto relative">

        <header className="h-24 bg-[#1e293b] text-white flex items-center px-6 sticky top-0 z-10 shadow-md justify-between">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-700 rounded-lg">
                <Menu size={24} />
              </button>
            )}
            <h1 className="font-bold text-xl">COSMATH Report System</h1>
          </div>

          {/* ✅ 사라졌던 네비게이션 버튼 추가 */}
          {selectedStudents.length > 0 && (
            <div className="flex items-center gap-6 bg-slate-800 px-4 py-2 rounded-xl border border-slate-700">
              <button
                onClick={prevReport}
                disabled={currentIndex === 0}
                className="p-1 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white transition-colors"
              >
                <ChevronLeft size={32} />
              </button>

              <div className="flex flex-col items-center min-w-[100px]">
                <span className="text-sm text-slate-400 font-medium">선택된 학생</span>
                <span className="text-lg font-bold text-blue-400">
                  {currentIndex + 1} <span className="text-white text-sm">/ {selectedStudents.length}</span>
                </span>
              </div>

              <button
                onClick={nextReport}
                disabled={currentIndex === selectedStudents.length - 1}
                className="p-1 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-white transition-colors"
              >
                <ChevronRight size={32} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* 편집 모드 토글 (여러 명 선택됐을 때만 노출) */}
            {selectedStudents.length > 0 && (
              <button
                onClick={() => setIsIndividualMode(!isIndividualMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold border ${isIndividualMode
                  ? "bg-rose-500 border-rose-600 text-white hover:bg-rose-600"
                  : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white"
                  }`}
              >
                {isIndividualMode ? <User size={18} /> : <Users size={18} />}
                <span>{isIndividualMode ? "개별 편집 모드" : "일괄 편집 모드"}</span>
              </button>
            )}

            <button
              onClick={saveAsImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 disabled:cursor-wait"
            >
              {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              <span>{isGeneratingImage ? "저장 중..." : "이미지 저장"}</span>
            </button>

            {!isRightSidebarOpen && (
              <button
                onClick={() => setIsRightSidebarOpen(true)}
                className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 hover:text-white transition-all shadow-md"
                title="학년별 프리셋"
              >
                <Settings size={22} />
              </button>
            )}
          </div>
        </header>

        <main className="p-12 flex justify-center items-start w-full min-w-max">  {currentStudent ? (
          <div
            key={currentStudent.id}
            ref={reportRef}
            className="bg-white p-[40px] shadow-2xl border border-slate-300 relative text-black shrink-0"
            style={{
              fontFamily: "'Hamchorom Dotum', 'Dotum', sans-serif",
              width: '297mm',  // 가로 크기 지정
              height: '210mm', // 세로 크기 지정
              minWidth: '297mm', // 화면이 작아져도 표 찌그러짐 방지
            }}
          >
            {/* 상단 날짜 (11pt) */}
            <div className="text-right mb-2" style={{ fontSize: '11pt' }}>
              <input
                className="text-right border-none outline-none focus:bg-yellow-50 w-80" // 주차가 붙어서 너비를 w-80 정도로 늘려주세요.
                value={reportData.date || ''}
                onChange={(e) => updateField('date', e.target.value)}
              />
            </div>

            {/* 헤더 섹션 */}
            <div className="flex justify-between items-start mb-4">
              {/* 부모 div의 너비를 늘려줍니다 (예: 280px -> 450px) */}
              <div className="w-[450px]">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={600}  /* 로고 가로 크기 확대 */
                  height={85}  /* 로고 세로 크기 확대 (비율에 맞춰 조절) */
                  priority
                  className="w-full h-auto" /* div 너비에 꽉 차게 설정 */
                />
              </div>
              {/* 제목 부분: 너비를 고정하고 줄바꿈을 막았습니다 */}
              <h1
                className="whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-hamchorom)',
                  fontSize: '28pt',
                  fontWeight: 'bold',      // Bold 적용
                  position: 'absolute',    // 절대 위치 지정
                  left: '50%',
                  top: '12%',             // 전체의 50% 지점으로 이동
                  transform: 'translateX(-50%)', // 본인 너비의 절반만큼 왼쪽으로 밀어 완전 중앙 정렬
                  textAlign: 'center',
                  margin: '0',             // 위치 고정을 위해 마진 제거
                  zIndex: 10               // 다른 요소에 가려지지 않게 설정
                }}
              >
                학습 현황 관리
              </h1>

              {/* 표 부분: 원본 색상과 토글 로직 적용 */}
              <table
                className="border-collapse border border-black w-[55mm]"
                style={{ fontSize: '11pt', fontFamily: 'var(--font-hamchorom)' }}
              >
                <thead>
                  <tr style={{ height: '8mm', backgroundColor: '#e8f0fe' }}>
                    <th className="border border-black font-normal">정규수업</th>
                    <th className="border border-black font-normal">보충수업</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ height: '12mm' }}>
                    <td
                      className="border border-black text-center cursor-pointer"
                      style={{ fontSize: '11pt' }}
                      onClick={() => updateField('type', reportData.type === '정규' ? '' : '정규')}
                    >
                      {reportData.type === '정규' ? '○' : ''}
                    </td>
                    <td
                      className="border border-black text-center cursor-pointer"
                      style={{ fontSize: '11pt' }}
                      onClick={() => updateField('type', reportData.type === '보충' ? '' : '보충')}
                    >
                      {reportData.type === '보충' ? '○' : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 담당교사 (13pt, 편집 가능) */}
            {/* 담당교사 (13pt, 편집 가능) */}
            <div className="text-right mb-1" style={{ fontSize: '13pt' }}>
              <span style={{ letterSpacing: '0.02em', fontWeight: 'normal' }}>담당교사 :</span>
              <input
                className="border-none outline-none focus:bg-yellow-50 w-24 ml-1"
                style={{
                  fontWeight: 'normal',
                  letterSpacing: 'normal',
                  transform: 'translateZ(0)',
                  willChange: 'transform',
                  color: '#000000'
                }}
                value={reportData.teacher}
                onChange={(e) => updateField('teacher', e.target.value)}
              />
            </div>

            {/* 메인 표 (모든 본문 11pt) */}
            <table
              className="border-collapse border-[1.5px] border-black"
              style={{
                width: '274.88mm',
                fontSize: '11pt',
                fontFamily: "var(--font-hamchorom)", // globals.css에 설정한 변수 사용
                tableLayout: 'fixed',
                backgroundColor: 'white'
              }}
            >
              <tbody>
                {/* 1행: 기본 정보 */}
                <tr style={{ height: '10mm' }}>
                  <td className="border border-black bg-[#e8f0fe] w-[30mm] text-center font-normal">이름</td>
                  <td className="border border-black w-[65mm] text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.name} onChange={(e) => updateField('name', e.target.value)} />
                  </td>
                  <td className="border border-black bg-[#e8f0fe] w-[20mm] text-center font-normal">과목</td>
                  <td className="border border-black w-[35mm] text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.subject} onChange={(e) => updateField('subject', e.target.value)} />
                  </td>
                  <td className="border border-black bg-[#e8f0fe] w-[20mm] text-center font-normal">학년</td>
                  <td className="border border-black w-[25mm] text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.grade} onChange={(e) => updateField('grade', e.target.value)} />
                  </td>
                  <td className="border border-black bg-[#e8f0fe] w-[79.88mm] text-center font-normal">수업 교재</td>
                </tr>

                {/* 2행: 출석 및 시간 */}
                <tr style={{ height: '12mm' }}>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal">출석</td>
                  <td className="border border-black text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.attendance} onChange={(e) => updateField('attendance', e.target.value)} />
                  </td>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal leading-tight">수업 시간</td>
                  <td colSpan={3} className="border border-black text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.time} onChange={(e) => updateField('time', e.target.value)} />
                  </td>
                  <td rowSpan={2} className="border border-black p-0">
                    <textarea
                      className="w-full h-full p-[1.8mm] outline-none border-none resize-none text-center bg-transparent leading-normal font-normal"
                      style={{ fontFamily: "var(--font-hamchorom)" }}
                      value={reportData.book}
                      onChange={(e) => updateField('book', e.target.value)}
                    />
                  </td>
                </tr>

                {/* 3행: 지각 및 사유 */}
                <tr style={{ height: '12mm' }}>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal leading-tight">지각/결석</td>
                  <td className="border border-black text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.status} onChange={(e) => updateField('status', e.target.value)} />
                  </td>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal">사유</td>
                  <td colSpan={3} className="border border-black text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.reason} onChange={(e) => updateField('reason', e.target.value)} />
                  </td>
                </tr>

                {/* 4행: 단원명/진도 */}
                <tr style={{ minHeight: '50mm' }}>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal text-[14pt]">단원명/진도</td>
                  <td
                    colSpan={6}
                    className="border border-black p-0"
                    style={{
                      height: '50mm',           /* 높이 고정 */
                      verticalAlign: 'middle',  /* ★ td 차원에서 세로 중앙 정렬 */
                      textAlign: 'center'       /* ★ 가로 중앙 정렬 */
                    }}
                  >
                    <textarea
                      ref={progressRef}
                      className="w-full outline-none border-none resize-none leading-relaxed text-[11pt] font-normal block text-black"
                      style={{
                        fontFamily: "var(--font-hamchorom)",
                        backgroundColor: 'transparent',
                        overflow: 'hidden',
                        padding: '0 4mm',       /* 좌우 여백만 주고 상하는 0 */
                        display: 'inline-block',
                        verticalAlign: 'middle' /* textarea 자체도 중간에 오도록 */
                      }}
                      rows={1}                  /* 기본 한 줄 시작 */
                      value={reportData.progress}
                      onChange={(e) => {
                        updateField('progress', e.target.value);
                      }}
                    />
                  </td>
                </tr>

                {/* 5행: 과제 여부 및 현황 */}
                <tr style={{ height: '12mm' }}>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal leading-tight px-1">지난 과제 여부</td>
                  <td className="border border-black text-center font-normal px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.hwLast} onChange={(e) => updateField('hwLast', e.target.value)} />
                  </td>
                  <td colSpan={2} className="border border-black bg-[#e8f0fe] text-center font-normal">과제 현황</td>
                  <td colSpan={3} className="border border-black px-[1.8mm]">
                    <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.hwCurrent} onChange={(e) => updateField('hwCurrent', e.target.value)} />
                  </td>
                </tr>

                {/* 6행: 과제 학습 */}
                <tr style={{ height: '45.21mm' }}>
                  <td className="border border-black bg-[#e8f0fe] text-center font-normal text-[14pt]">과제 학습</td>
                  <td colSpan={6} className="border border-black p-0">
                    <textarea
                      className="w-full h-full p-[4mm] outline-none border-none resize-none leading-relaxed text-[11pt] font-normal"
                      style={{ fontFamily: "var(--font-hamchorom)" }}
                      value={reportData.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-slate-400 font-bold text-2xl animate-pulse"></div>
        )}
        </main>
      </div>

      <RightSidebar
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
        onApplyData={handleApplyGradeData}
      />
    </div>
  );
}