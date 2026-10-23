"use client";

import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { MockExam } from "../types/mock-exam";
import styles from "../app/question-bank/question-bank.module.css";

const pageSize = 15;
const resourceNames: Record<string, string> = { problem: "문제", answer: "정답", explanation: "해설" };

export default function MockExamLibrary({ exams }: { exams: MockExam[] }) {
  const [grade, setGrade] = useState(1);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const gradeExams = exams.filter(exam => exam.grade === grade);
  const years = [...new Set(gradeExams.map(exam => exam.year))].sort((a, b) => b - a);
  const subjects = [...new Set(gradeExams.map(exam => exam.subject))].sort();
  const months = [...new Set(gradeExams.map(exam => exam.month))].sort((a, b) => a - b);
  const filtered = gradeExams.filter(exam => (!year || exam.year === Number(year)) && (!month || exam.month === Number(month)) && (!subject || exam.subject === subject) && `${exam.year} ${exam.title}`.includes(query.trim()));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return <section className={styles.library} aria-labelledby="exam-library-title">
    <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>수학 기출 자료실</span><h2 id="exam-library-title">학년별 모의고사</h2></div><span>시험지 단위 · 선택과목별 자료 포함</span></div>
    <div className={styles.gradeTabs} role="group" aria-label="학년 선택">{[1, 2, 3].map(value => <button key={value} aria-pressed={grade === value} onClick={() => { setGrade(value); setSubject(""); setYear(""); setMonth(""); setPage(1); }}>고{value}<span>{exams.filter(exam => exam.grade === value).length}</span></button>)}</div>
    <div className={styles.filters}>
      <label>시행 연도<select value={year} onChange={event => { setYear(event.target.value); setPage(1); }}><option value="">전체 연도</option>{years.map(value => <option key={value} value={value}>{value}년</option>)}</select></label>
      <label>시행 월<select value={month} onChange={event => { setMonth(event.target.value); setPage(1); }}><option value="">전체 월</option>{months.map(value => <option key={value} value={value}>{value}월</option>)}</select></label>
      <label>수학 과목<select value={subject} onChange={event => { setSubject(event.target.value); setPage(1); }}><option value="">전체 과목</option>{subjects.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className={styles.search}>자료 검색<div><Search size={16} aria-hidden="true" /><input type="search" value={query} placeholder="연도, 시험명, 과목 검색" onChange={event => { setQuery(event.target.value); setPage(1); }} /></div></label>
    </div>
    <p className={styles.resultCount} role="status">검색 결과 <strong>{filtered.length}건</strong></p>
    <div className={styles.examList}>{visible.length ? visible.map(exam => {
      const available = exam.resources.filter(resource => resource.localPath);
      return <article key={exam.id} className={styles.examRow}>
        <div className={styles.examDate}><strong>{exam.year}</strong><span>{exam.month}월</span></div>
        <div className={styles.examInfo}><span>고{exam.grade} · {exam.subject}</span><h3>{exam.title}</h3><small>{available.some(resource => resource.kind === "problem") ? "원본 문제 저장됨" : "원본 문제 미확보"} · 출처 EBSi</small></div>
        <div className={styles.examLinks}>{available.map((resource, index) => <a key={`${resource.kind}-${index}`} href={resource.localPath} target="_blank" rel="noopener noreferrer" aria-label={`${exam.year}년 ${exam.title} ${resourceNames[resource.kind] || resource.kind} 새 창에서 열기`}>{resourceNames[resource.kind] || resource.kind}<ExternalLink size={12} aria-hidden="true" /></a>)}<a className={styles.sourceLink} href={exam.source} target="_blank" rel="noopener noreferrer" aria-label={`${exam.year}년 ${exam.title} 공식 자료실 새 창에서 열기`}>공식 자료실<ExternalLink size={12} aria-hidden="true" /></a></div>
      </article>;
    }) : <p className={styles.noResults}>조건에 맞는 자료가 없습니다. 검색 조건을 바꿔 주세요.</p>}</div>
    <nav className={styles.pagination} aria-label="기출 자료 페이지"><button disabled={page === 1} onClick={() => setPage(current => current - 1)}>이전</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(current => current + 1)}>다음</button></nav>
  </section>;
}
