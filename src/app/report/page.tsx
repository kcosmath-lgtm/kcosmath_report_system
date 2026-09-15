"use client";

import { useState, useRef, useEffect } from "react";
import StudentSidebar from "../../components/layout/Sidebar";
import { Menu, Download, ChevronLeft, ChevronRight, Users, User, Loader2, Save, HelpCircle, AlertTriangle, Wifi, X } from "lucide-react";
import { toBlob } from "html-to-image";
import Image from "next/image";
import logo from "../../../public/logo.png";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getFormattedDate } from "../../utils/date";
import styles from "./workspace.module.css";
import { useReportEditor } from "../../lib/use-report-editor";


export default function ReportPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLTextAreaElement>(null);
  const { reportDate, isInitialized, isLoading, loadFailed, error,
    selectedStudents, currentIndex, setCurrentIndex, currentStudent, reportData, isSaving, hasUnsavedChanges,
    isIndividualMode, setIsIndividualMode, handleBatchSelect, updateField, saveToSupabase, nextReport, prevReport } = useReportEditor();

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.height = 'auto';
      progressRef.current.style.height = progressRef.current.scrollHeight + 'px';
    }
  }, [reportData.progress, currentStudent]);

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
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 text-slate-700 font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
        <p className="mt-4 text-sm text-slate-400">저장된 보고서를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <StudentSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        disabled={isSaving || isLoading || loadFailed || isGeneratingImage}
        key={reportDate}
        onBatchSelect={handleBatchSelect}
      />
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.identity}>
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className={styles.iconButton} aria-label="학생 목록 열기"><Menu size={20} /></button>}
            <Link href="/" aria-label="코스매쓰 홈" onNavigate={event => {
              if (isSaving || (hasUnsavedChanges && !window.confirm("저장하지 않은 변경사항을 버리고 홈으로 이동할까요?"))) event.preventDefault();
            }}><Image src={logo} alt="COSMATH MATH ACADEMY" className={styles.logo} priority /></Link>
            <div className={styles.title}><h1>수업 보고서</h1><p>STUDENT REPORT</p></div>
          </div>
          <div className={styles.actions}>
            {selectedStudents.length > 0 && <>
              <div className={styles.pager}>
                <button onClick={prevReport} disabled={currentIndex === 0 || isGeneratingImage} className={styles.iconButton} aria-label="이전 학생"><ChevronLeft size={16} /></button>
                <div>{currentIndex + 1} <small>/ {selectedStudents.length}</small></div>
                <button onClick={nextReport} disabled={currentIndex === selectedStudents.length - 1 || isGeneratingImage} className={styles.iconButton} aria-label="다음 학생"><ChevronRight size={16} /></button>
              </div>
              <button onClick={() => setIsIndividualMode(!isIndividualMode)} aria-pressed={isIndividualMode} className={styles.mode}>
                {isIndividualMode ? <User size={16} /> : <Users size={16} />}{isIndividualMode ? "개별 편집" : "일괄 편집"}
              </button>
            </>}
            <button onClick={saveToSupabase} disabled={isSaving || isLoading || loadFailed || isGeneratingImage} className={[styles.button, hasUnsavedChanges ? styles.dirty : ""].join(" ")}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? "저장 중…" : "보고서 저장"}{hasUnsavedChanges && <span className={styles.dot} aria-label="저장하지 않은 변경사항" />}
            </button>
            <button onClick={saveAsImage} disabled={isGeneratingImage || isLoading || loadFailed || isSaving} className={styles.primary}>
              {isGeneratingImage ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{isGeneratingImage ? "이미지 만드는 중…" : "이미지 저장"}
            </button>
          </div>
        </header>

        {error && <div role="alert" className="p-4 bg-rose-50 text-rose-800 text-sm">{error}</div>}
        <main className={styles.canvas}>
          <fieldset disabled={isLoading || isSaving || loadFailed || isGeneratingImage} className="contents">  
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
                  readOnly
                  aria-label="보고서 날짜"
                />
              </div>

              <div className="flex justify-between items-start mb-4">
                <div className="w-[450px] h-[85px]">
                  <Image
                    src={logo}
                    alt="COSMATH MATH ACADEMY"
                    priority
                    className="w-auto h-full max-w-full object-contain object-left"
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
            <div className={styles.empty}><div className={styles.emptyIcon}><Users size={34} strokeWidth={1.3} /></div><br /><span>READY TO WRITE</span><h2>오늘의 기록을 시작해 볼까요?</h2><p>왼쪽 목록에서 학생을 선택하면<br />수업 보고서를 작성할 수 있어요.</p></div>
          )}
          </fieldset>
        </main>
      </div>

      {/* 도움말 플로팅 버튼 */}
      <button
        onClick={() => setIsHelpOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-blue-50 hover:bg-blue-100 text-slate-700 border border-blue-100 hover:border-blue-200 shadow-xl hover:scale-105 active:scale-95 transition-all p-3.5 rounded-full flex items-center justify-center cursor-pointer group"
        title="사용 가이드"
      >
        <HelpCircle size={22} className="group-hover:text-blue-600 transition-colors" />
      </button>

      {/* 도움말 모달 */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsHelpOpen(false)}>
          <div 
            className="bg-white border border-blue-100 text-slate-700 rounded-3xl shadow-2xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsHelpOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-sky-500/10 rounded-xl flex items-center justify-center text-blue-600 border border-sky-500/20">
                <HelpCircle size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-700">COSMATH Report 사용 가이드</h2>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* 가이드 카드 1: 동시 편집 */}
              <div className="bg-slate-50 border border-blue-100/80 p-4 rounded-2xl flex gap-3">
                <div className="text-amber-600 shrink-0 mt-0.5">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">다른 창과 수정 충돌이 발생한 경우</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    같은 보고서나 반별 공통 내용을 다른 창에서 먼저 저장하면 현재 저장은 중단됩니다. 작성 내용을 별도로 복사한 뒤 다시 불러와 최신 내용에 반영해 주세요. 서로 다른 학생의 개별 보고서는 따로 저장됩니다.
                  </p>
                </div>
              </div>

              {/* 가이드 카드 2: 수동 저장 및 단축키 */}
              <div className="bg-slate-50 border border-blue-100/80 p-4 rounded-2xl flex gap-3">
                <div className="text-blue-600 shrink-0 mt-0.5">
                  <Save size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">수동 저장 생활화 및 단축키</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    수정이 완료되면 상단 헤더의 <span className="text-blue-600 font-bold">DB 저장</span> 버튼을 누르거나, 키보드 단축키 <kbd className="bg-blue-50 text-[10px] px-1 py-0.5 rounded border border-blue-100 text-slate-600 font-mono">Ctrl + S</kbd> (Mac은 <kbd className="bg-blue-50 text-[10px] px-1 py-0.5 rounded border border-blue-100 text-slate-600 font-mono">Cmd + S</kbd>)를 누르면 즉시 저장됩니다.
                  </p>
                </div>
              </div>

              {/* 가이드 카드 3: 인터넷 및 이탈 경고 */}
              <div className="bg-slate-50 border border-blue-100/80 p-4 rounded-2xl flex gap-3">
                <div className="text-blue-600 shrink-0 mt-0.5">
                  <Wifi size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">네트워크 오류 및 경고</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    네트워크 연결이 일시적으로 불안정할 경우 저장 실패 경고창이 뜹니다. 만약 저장하지 않고 창을 닫으려고 하면 새로고침/이탈 차단 팝업이 띄워져 작성한 내용을 안전하게 보관할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* 가이드 카드 4: 첫 접속 지연 */}
              <div className="bg-slate-50 border border-blue-100/80 p-4 rounded-2xl flex gap-3">
                <div className="text-blue-500 shrink-0 mt-0.5">
                  <Loader2 size={18} className="animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">장기 미사용 시 첫 로딩 대기</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    방학 등으로 인해 일주일 이상 아무도 접속하지 않은 경우, Supabase DB가 수면 모드로 전환됩니다. 오랜만에 첫 접속 시 로딩이 10~30초 지연될 수 있으니 잠시 기다려주시면 정상 연결됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl active:scale-95 transition-all shadow-md"
              >
                가이드 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
