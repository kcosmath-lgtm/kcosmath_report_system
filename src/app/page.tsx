"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import StudentSidebar from "../components/layout/Sidebar";
import { GRADE_REPORT_DATA } from "../constants/reportContents";
import { Menu, Download, ChevronLeft, ChevronRight, Users, User, Loader2 } from "lucide-react";
import { toBlob } from "html-to-image";
import Image from "next/image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getSetting, saveSetting } from "../lib/supabase";
import { getFormattedDate } from "../utils/date";
import 'dayjs/locale/ko';

interface ReportData {
  date: string;
  type: "정규" | "보충" | "";
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
  const reportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLTextAreaElement>(null);
  const [selectedStudents, setSelectedStudents] = useState<{ id: string, name: string, grade: string, group: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const [commonData, setCommonData] = useState<ReportData>({
    date: getFormattedDate(),
    type: "정규",
    teacher: "신기정T",
    name: "", 
    subject: "수학",
    grade: "", 
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

  const [overrides, setOverrides] = useState<Record<string, Partial<ReportData>>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const [dbCommon, dbOverrides] = await Promise.all([
          getSetting<ReportData | null>("cosmath_common_data", null),
          getSetting<Record<string, Partial<ReportData>> | null>("cosmath_overrides_data", null)
        ]);

        if (dbCommon) {
          const { date, ...restData } = dbCommon;
          setCommonData(prev => ({ ...prev, ...restData }));
        }
        if (dbOverrides) {
          setOverrides(dbOverrides);
        }
      } catch (e) {
        console.error("Supabase 데이터 로드 실패:", e);
      } finally {
        setIsInitialized(true);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!isInitialized) return; 
    const handler = setTimeout(() => {
      saveSetting("cosmath_common_data", commonData);
    }, 1000);
    return () => clearTimeout(handler);
  }, [commonData, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return; 
    const handler = setTimeout(() => {
      saveSetting("cosmath_overrides_data", overrides);
    }, 1000);
    return () => clearTimeout(handler);
  }, [overrides, isInitialized]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nowFormatted = getFormattedDate();
      setCommonData(prev => {
        if (prev.date === nowFormatted) return prev;
        return { ...prev, date: nowFormatted };
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [isIndividualMode, setIsIndividualMode] = useState(false);

  const currentStudent = useMemo(() => {
    return selectedStudents[currentIndex] || null;
  }, [selectedStudents, currentIndex]);

  const reportData = useMemo(() => {
    if (!currentStudent) return commonData;
    const studentOverride = overrides[currentStudent.id] || {};
    return {
      ...commonData,
      ...studentOverride,
      name: currentStudent.name,  
      grade: currentStudent.grade 
    };
  }, [commonData, overrides, currentStudent]);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.height = 'auto';
      progressRef.current.style.height = `${progressRef.current.scrollHeight}px`;
    }
  }, [reportData.progress, currentStudent]);

  const getDefaultTime = (grade: string) => {
    if (grade && grade.includes("초")) return "15:30 ~ 17:30";
    if (grade && grade.includes("중")) return "17:30 ~ 19:30";
    if (grade && grade.includes("고")) return "19:00 ~ 22:00"; 
    return "15:30 ~ 17:30"; 
  };

  const getDefaultTeacher = (group: string) => {
    if (group && (group.includes("중1 정규반") || group.includes("초등 심화반"))) return "신기정T";
    if (group && (group.includes("중2 정규반") || group.includes("초6 정규반"))) return "홍정욱T";
    if (group && (group.includes("중3 정규반") || group.includes("공통수학"))) return "김윤재T";
    if (group && (group.includes("초등 기본반") || group.includes("중등 개별반") || group.includes("은애쌤"))) return "백금채T";
    return "신기정T"; 
  };

  const handleBatchSelect = useCallback((students: { id: string; name: string; grade: string; group: string }[]) => {
    setSelectedStudents(students);
    setCurrentIndex(0);

    if (students.length > 0) {
      setCommonData(prev => ({
        ...prev,
        time: getDefaultTime(students[0].grade),
        teacher: getDefaultTeacher(students[0].group)
      }));

      setOverrides(prev => {
        const next = { ...prev };
        students.forEach(student => {
          const preset = GRADE_REPORT_DATA[student.grade];
          if (preset && !next[student.id]?.book && !next[student.id]?.progress) {
            next[student.id] = {
              ...(next[student.id] || {}),
              book: preset.book,
              progress: preset.progress,
              notes: preset.notes
            };
          }
        });
        return next;
      });
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

  const updateField = (key: keyof ReportData, value: any) => {
    if (isIndividualMode) {
      if (!currentStudent) return;
      setOverrides(prev => ({
        ...prev,
        [currentStudent.id]: {
          ...(prev[currentStudent.id] || {}),
          [key]: value
        }
      }));
    } else {
      setCommonData(prev => ({ ...prev, [key]: value }));
      if (selectedStudents.length > 0) {
        setOverrides(prev => {
          const next = { ...prev };
          selectedStudents.forEach(student => {
            next[student.id] = {
              ...(next[student.id] || {}),
              [key]: value
            };
          });
          return next;
        });
      }
    }
  };

  const handleSelectStudent = (id: string, name: string, grade: string, group: string) => {
    const newStudent = { id, name, grade, group };
    setSelectedStudents([newStudent]);
    setCurrentIndex(0);

    setCommonData(prev => ({
      ...prev,
      time: getDefaultTime(grade),
      teacher: getDefaultTeacher(group)
    }));

    const preset = GRADE_REPORT_DATA[grade];
    if (preset) {
      setOverrides(prev => {
        const next = { ...prev };
        if (!next[id]?.book && !next[id]?.progress) {
          next[id] = {
            ...(next[id] || {}),
            book: preset.book,
            progress: preset.progress,
            notes: preset.notes
          };
        }
        return next;
      });
    }
  };

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // 🌟 [수정] 이미지 일괄 저장 안정화 로직
  const saveAsImage = async () => {
    if (!reportRef.current || selectedStudents.length === 0) return;
    setIsGeneratingImage(true);

    try {
      if (selectedStudents.length === 1) {
        const blob = await toBlob(reportRef.current, { backgroundColor: "#ffffff", pixelRatio: 3 });
        const fileName = `${reportData.grade} ${reportData.name}`;
        if (blob) saveAs(blob, `${fileName}.jpg`);
      } else {
        const zip = new JSZip();
        const firstGrade = selectedStudents[0].grade;
        const isAllSameGrade = selectedStudents.every(s => s.grade === firstGrade);
        const targetFolder = isAllSameGrade ? zip.folder(firstGrade) : zip;
        if (!targetFolder) throw new Error("Zip folder creation failed");

        const originalIndex = currentIndex;

        for (let i = 0; i < selectedStudents.length; i++) {
          const student = selectedStudents[i];
          
          // 1. 상태값 변경 트리거
          setCurrentIndex(i);
          
          // 2. React가 DOM을 완전히 리렌더링하고 브라우저 Paint를 마칠 때까지 충분한 시간을 대기
          await new Promise(resolve => setTimeout(resolve, 150));
          await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150)));

          if (reportRef.current) {
            // 3. 간혹 폰트나 이미지 로드가 느려질 때를 방지하기 위해 캡처 시도 전 강제 갱신 유도용 옵션 지정 가능
            const blob = await toBlob(reportRef.current, { 
              backgroundColor: "#ffffff", 
              pixelRatio: 3,
              cacheBust: true // 캐시 버그 방지
            });
            const fileName = `${student.grade} ${student.name}.jpg`;
            if (blob) {
              targetFolder.file(fileName, blob);
            }
          }
        }

        // 작업 종료 후 보던 화면으로 백업
        setCurrentIndex(originalIndex);
        
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = isAllSameGrade ? `${firstGrade}_학습보고서.zip` : `학습보고서_모음_${getFormattedDate()}.zip`;
        saveAs(zipBlob, zipName);
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("이미지 저장 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
        <p className="mt-4 text-sm text-slate-400">Supabase 데이터베이스와 동기화 중...</p>
      </div>
    );
  }

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
          </div>
        </header>

        <main className="p-12 flex justify-center items-start w-full min-w-max">  
          {currentStudent ? (
            <div
              key={currentStudent.id}
              ref={reportRef}
              className="bg-white p-[40px] shadow-2xl border border-slate-300 relative text-black shrink-0"
              style={{
                fontFamily: "'Hamchorom Dotum', 'Dotum', sans-serif",
                width: '297mm',  
                height: '210mm', 
                minWidth: '297mm', 
              }}
            >
              <div className="text-right mb-2" style={{ fontSize: '11pt' }}>
                <input
                  className="text-right border-none outline-none focus:bg-yellow-50 w-80" 
                  value={reportData.date || ''}
                  onChange={(e) => updateField('date', e.target.value)}
                />
              </div>

              <div className="flex justify-between items-start mb-4">
                <div className="w-[450px]">
                  <Image
                    src="/logo.png"
                    alt="Logo"
                    width={600}  
                    height={85}  
                    priority
                    className="w-full h-auto" 
                  />
                </div>
                <h1
                  className="whitespace-nowrap"
                  style={{
                    fontFamily: 'var(--font-hamchorom)',
                    fontSize: '28pt',
                    fontWeight: 'bold',      
                    position: 'absolute',    
                    left: '50%',
                    top: '12%',             
                    transform: 'translateX(-50%)', 
                    textAlign: 'center',
                    margin: '0',             
                    zIndex: 10               
                  }}
                >
                  학습 현황 관리
                </h1>

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

              <table
                className="border-collapse border-[1.5px] border-black"
                style={{
                  width: '274.88mm',
                  fontSize: '11pt',
                  fontFamily: "var(--font-hamchorom)", 
                  tableLayout: 'fixed',
                  backgroundColor: 'white'
                }}
              >
                <tbody>
                  <tr style={{ height: '10mm' }}>
                    <td className="border border-black bg-[#e8f0fe] w-[30mm] text-center font-normal">이름</td>
                    <td className="border border-black w-[65mm] text-center font-normal px-[1.8mm] bg-slate-50 font-bold">
                      {reportData.name}
                    </td>
                    <td className="border border-black bg-[#e8f0fe] w-[20mm] text-center font-normal">과목</td>
                    <td className="border border-black w-[35mm] text-center font-normal px-[1.8mm]">
                      <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.subject} onChange={(e) => updateField('subject', e.target.value)} />
                    </td>
                    <td className="border border-black bg-[#e8f0fe] w-[20mm] text-center font-normal">학년</td>
                    <td className="border border-black w-[25mm] text-center font-normal px-[1.8mm] bg-slate-50 text-slate-700">
                      {reportData.grade}
                    </td>
                    <td className="border border-black bg-[#e8f0fe] w-[79.88mm] text-center font-normal">수업 교재</td>
                  </tr>

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

                  <tr style={{ minHeight: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '75mm' : '50mm' }}>
                    <td className="border border-black bg-[#e8f0fe] text-center font-normal text-[14pt]">단원명/진도</td>
                    <td
                      colSpan={6}
                      className="border border-black p-0"
                      style={{
                        height: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '75mm' : '50mm', 
                        verticalAlign: 'middle',  
                        textAlign: 'center'       
                      }}
                    >
                      <textarea
                        ref={progressRef}
                        className="w-full outline-none border-none resize-none leading-relaxed text-[11pt] font-normal block text-black"
                        style={{
                          fontFamily: "var(--font-hamchorom)",
                          backgroundColor: 'transparent',
                          overflow: 'hidden',
                          padding: '0 4mm',       
                          display: 'inline-block',
                          verticalAlign: 'middle' 
                        }}
                        rows={1}                  
                        value={reportData.progress}
                        onChange={(e) => {
                          updateField('progress', e.target.value);
                        }}
                      />
                    </td>
                  </tr>

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

                  <tr style={{ height: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '20.21mm' : '45.21mm' }}>
                    <td className="border border-black bg-[#e8f0fe] text-center font-normal text-[14pt]">
                      {(reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? "전달사항" : "과제 학습"}
                    </td>
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
            <div className="text-slate-400 font-bold text-2xl animate-pulse">왼쪽 사이드바에서 학생들을 선택해주세요.</div>
          )}
        </main>
      </div>
    </div>
  );
}