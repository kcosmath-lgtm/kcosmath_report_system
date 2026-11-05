"use client";

import { useState, useRef, useEffect } from "react";
import LandingMenu from "../../components/LandingMenu";
import StudentSidebar from "../../components/layout/Sidebar";
import { Menu, Download, ChevronLeft, ChevronRight, Users, User, Loader2, Save } from "lucide-react";
import { flushSync } from "react-dom";
import { captureReportImage } from "../../lib/report-image";
import Image from "next/image";
import logo from "../../../public/logo.png";
import Link from "next/link";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getFormattedDate } from "../../utils/date";
import styles from "./workspace.module.css";
import { useReportEditor } from "../../lib/use-report-editor";
import { nextHomeworkStatus, normalizeHomeworkStatus } from "../../lib/report-model";


export default function ReportPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLTextAreaElement>(null);
  const { reportDate, changeDate, isInitialized, isLoading, loadFailed, error,
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
    if (isGeneratingImage) return;
    const originalIndex = currentIndex;
    setIsGeneratingImage(true);

    try {
      if (selectedStudents.length === 1) {
        const blob = await captureReportImage(reportRef.current);
        const fileName = `${reportData.grade} ${reportData.name}`;
        if (blob) saveAs(blob, `${fileName}.png`);
      } else {
        const zip = new JSZip();
        const firstGrade = selectedStudents[0].grade;
        const isAllSameGrade = selectedStudents.every(s => s.grade === firstGrade);
        const targetFolder = isAllSameGrade ? zip.folder(firstGrade) : zip;
        if (!targetFolder) throw new Error("Zip folder creation failed");

        for (let i = 0; i < selectedStudents.length; i++) {
          const student = selectedStudents[i];
          flushSync(() => setCurrentIndex(i));
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          if (!reportRef.current) throw new Error("보고서 화면을 찾지 못했습니다.");
          const blob = await captureReportImage(reportRef.current);
          targetFolder.file(student.grade + " " + student.name + ".png", blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = isAllSameGrade ? `${firstGrade}_학습보고서.zip` : `학습보고서_모음_${getFormattedDate(reportDate)}.zip`;
        saveAs(zipBlob, zipName);
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      alert(`이미지 저장 실패: ${error instanceof Error ? error.message : "브라우저가 이미지 변환을 완료하지 못했습니다."}`);
    } finally {
      setCurrentIndex(originalIndex);
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
          <LandingMenu />
        </header>
        <div className={styles.toolbar}>
          <div className={styles.actions}>
            <label title="최근 저장한 내용을 이어 쓰며, 작성일만 선택합니다.">보고서 작성일 <input type="date" value={reportDate}
              disabled={isLoading || isSaving || isGeneratingImage}
              onChange={event => changeDate(event.target.value)} /></label>
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
        </div>

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

                  <tr style={{ minHeight: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '75mm' : '70mm' }}>
                    <td className="border border-black bg-[#e8f0fe] text-center font-normal text-[14pt]">단원명/진도</td>
                    <td
                      colSpan={6}
                      className="border border-black p-0"
                      style={{
                        height: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '75mm' : '70mm', 
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
                      <button type="button" className="w-full text-center outline-none border-none bg-transparent font-normal"
                        aria-label={`지난 과제 여부 ${normalizeHomeworkStatus(reportData.hwLast)}. 누르면 다음 상태로 변경`}
                        onClick={() => updateField('hwLast', nextHomeworkStatus(reportData.hwLast))}>
                        {normalizeHomeworkStatus(reportData.hwLast)}
                      </button>
                    </td>
                    <td colSpan={2} className="border border-black bg-[#e8f0fe] text-center font-normal">과제 현황</td>
                    <td colSpan={3} className="border border-black px-[1.8mm]">
                      <input className="w-full text-center outline-none border-none bg-transparent font-normal" value={reportData.hwCurrent} onChange={(e) => updateField('hwCurrent', e.target.value)} />
                    </td>
                  </tr>

                  <tr style={{ height: (reportData.grade?.includes("중") || reportData.grade?.includes("고")) ? '20.21mm' : '25.21mm' }}>
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
    </div>
  );
}
