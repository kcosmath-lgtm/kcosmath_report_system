"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { loadStudents, loadWrongAnswerRange } from "../../../lib/report-storage";
import { achievement, reportMonths, summarize } from "../../../lib/wrong-answer-report";
import type { StudentGroup } from "../../../types/student";
import type { WrongAnswerRecord } from "../../../types/wrong-answer";
import styles from "./report.module.css";

type ReportStudent = { id: string; name: string; grade: string; group: string };
type Preview = { start: string; end: string; students: ReportStudent[]; records: WrongAnswerRecord[] };
const statusLabel = { O: "완료", "△": "일부 완료", X: "미완료" };

function MonthlyReport({ student, month, preview }: { student: ReportStudent; month: string; preview: Preview }) {
  const start = preview.start > `${month}-01` ? preview.start : `${month}-01`;
  const monthEnd = dayjs(`${month}-01`).endOf("month").format("YYYY-MM-DD");
  const end = preview.end < monthEnd ? preview.end : monthEnd;
  const records = preview.records.filter(r => r.student_id === student.id && r.record_date.startsWith(month));
  const stats = summarize(records);
  const days = Array.from({ length: dayjs(end).diff(dayjs(start), "day") + 1 }, (_, i) => dayjs(start).add(i, "day").format("YYYY-MM-DD"));
  const max = Math.max(1, ...records.map(r => r.total_wrong));
  const calendarDays = Array.from({ length: Math.ceil((dayjs(`${month}-01`).day() + dayjs(monthEnd).date()) / 7) * 7 }, (_, i) => {
    const date = dayjs(`${month}-01`).startOf("week").add(i, "day").format("YYYY-MM-DD");
    return { date, inRange: date >= start && date <= end, record: records.find(r => r.record_date === date) };
  });
  const weeks = Array.from({ length: Math.ceil(dayjs(monthEnd).date() / 7) }, (_, i) => {
    const first = i * 7 + 1, last = Math.min(first + 6, dayjs(monthEnd).date());
    return { label: `${first}~${last}일`, stats: summarize(records.filter(r => { const d = dayjs(r.record_date).date(); return d >= first && d <= last; })) };
  });
  return <article className={styles.sheet}>
    <header className={styles.reportHeader}><span>COSMATH · LEARNING REPORT</span><h1>오답 & 숙제 성장 보고서</h1><p>{dayjs(`${month}-01`).format("YYYY년 M월")} <b>｜</b> {start} ~ {end}</p><div>{student.group} · {student.grade} <strong>{student.name}</strong></div></header>
    <section className={styles.metrics}>{[["전체 오답", `${stats.total}문제`], ["수정 완료", `${stats.corrected}문제`], ["미수정", `${stats.remaining}문제`], ["수정 완료율", stats.rate === null ? "대상 없음" : `${stats.rate}%`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className={styles.achievement}><strong>{achievement(stats)}</strong><div><span>완료 실천율 <b>{stats.practiceRate === null ? "대상 없음" : `${stats.practiceRate}%`}</b> · {stats.wrongDays}일 중 {stats.completedDays}일 완료</span><span>오답 기록일당 평균 <b>{stats.averageWrong === null ? "대상 없음" : `${stats.averageWrong}문제`}</b></span></div></section>
    <section className={`${styles.panel} ${styles.calendarPanel}`}><h2><i>✓</i> 오답·숙제 실천 달력 <small>오답: ✓ 완료 · 진행 · — 미기록</small></h2><div className={styles.calendar}>{["일", "월", "화", "수", "목", "금", "토"].map(d => <b key={d}>{d}</b>)}{calendarDays.map(({ date, inRange, record: r }) => { const done = r?.completed || (!!r?.total_wrong && r.total_wrong === r.corrected_count); return <div key={date} data-outside={!inRange} data-completed={inRange && done}><strong>{date.startsWith(month) ? dayjs(date).date() : ""}</strong>{inRange && <><span>오답 {done ? "✓ 완료" : r?.total_wrong ? "진행" : "—"}</span><span>숙제 {r?.homework_status ? statusLabel[r.homework_status] : "—"}</span></>}</div>; })}</div></section>
    <section className={styles.panel}><h2><i>01</i> 날짜별 오답 수정 현황 <small>오답 완료 {stats.completedDays}일</small></h2><div className={styles.legend}><span className={styles.blueDot}/>수정 완료 <span className={styles.orangeDot}/>미수정</div><div className={styles.dailyChart}>{days.map(date => { const r = records.find(r => r.record_date === date); return <div className={styles.dayBar} key={date} title={`${date}: 오답 ${r?.total_wrong ?? 0}, 수정 ${r?.corrected_count ?? 0}${r ? "" : " (미기록)"}`}><small>{r?.total_wrong || ""}</small><div className={styles.track}><div className={styles.remaining} style={{ height: `${((r?.total_wrong ?? 0) - (r?.corrected_count ?? 0)) / max * 100}%` }}/><div className={styles.corrected} style={{ height: `${(r?.corrected_count ?? 0) / max * 100}%` }}/></div><span>{dayjs(date).date()}</span></div>; })}</div></section>
    <section className={styles.panel}><h2><i>02</i> 숙제 실천 현황 <small>완료율 {stats.homeworkRate === null ? "대상 없음" : `${stats.homeworkRate}%`}</small></h2><div className={styles.homeworkSummary}><span>완료 <b>{stats.homework.O}일</b></span><span>일부 완료 <b>{stats.homework["△"]}일</b></span><span>미완료 <b>{stats.homework.X}일</b></span><span>상태 미기록 <b>{stats.homework.missing}일</b></span></div><div className={styles.weekChart}>{weeks.map(w => <div key={w.label}><span>{w.label}</span><div className={styles.weekTrack}>{(["O", "△", "X"] as const).map(s => <div key={s} className={s === "O" ? styles.done : s === "△" ? styles.partial : styles.notDone} style={{ width: `${w.stats.homework[s] / 7 * 100}%` }}>{w.stats.homework[s] ? w.stats.homework[s] : ""}</div>)}</div></div>)}</div><div className={styles.legend}><span className={styles.greenDot}/>완료 <span className={styles.yellowDot}/>일부 완료 <span className={styles.orangeDot}/>미완료</div></section>
    <section className={styles.panel}><h2><i>03</i> 날짜별 학습 기록 <small>{records.length}일 기록</small></h2>{!records.length ? <p className={styles.empty}>선택한 기간에 저장된 기록이 없습니다.</p> : <div className={styles.recordGrid}>{[records.slice(0, 16), records.slice(16)].map((rows, i) => <table key={i}><thead><tr><th>날짜</th><th>오답/수정</th><th>오답 상태</th><th>숙제</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{dayjs(r.record_date).format("M/D")}</td><td>{r.total_wrong ? `${r.total_wrong} / ${r.corrected_count}` : "—"}</td><td>{r.completed || (r.total_wrong > 0 && r.total_wrong === r.corrected_count) ? "완료" : r.total_wrong ? "진행 중" : "미기록"}</td><td>{r.homework_status ? statusLabel[r.homework_status] : "미기록"}</td></tr>)}</tbody></table>)}</div>}</section>
    <footer>완료 실천율은 오답 수가 있거나 완료 표시한 날 기준입니다. 숙제만 기록한 날은 제외합니다.<br/>수량 미입력 완료일도 실천율·기록일당 평균의 일수에 포함합니다. 숙제 완료율 = 완료 ÷ 상태 입력일(O·△·X).<br/>미수정 수는 입력 수량 기준입니다. 전체 풀이 수가 없어 오답률·이해도를 판단하지 않습니다.</footer>
  </article>;
}

export default function WrongAnswerReportPage() {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState(() => dayjs().startOf("month").format("YYYY-MM-DD"));
  const [end, setEnd] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let cancelled = false; loadStudents().then(g => { if (!cancelled) setGroups(g); }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "학생을 불러오지 못했습니다."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, []);
  async function generate() {
    setError("");
    if (!reportMonths(start, end).length) { setError("올바른 시작일과 종료일을 선택하세요."); return; }
    if (!selected.length) { setError("보고서를 만들 학생을 선택하세요."); return; }
    setBusy(true);
    try {
      const students = groups.flatMap(g => g.students.filter(s => selected.includes(s.id)).map(s => ({ ...s, group: g.group })));
      const records = await loadWrongAnswerRange(start, end, students.map(s => s.id));
      setPreview({ start, end, students, records });
    } catch (e) { setError(e instanceof Error ? e.message : "기록을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}><div className={styles.controls}><Link href="/errors">← 오답 및 숙제 관리</Link><h1>오답·숙제 보고서</h1><p>학생과 기간을 선택해 월별 성장 기록을 만들어 보세요.</p><fieldset disabled={busy || loading}><div className={styles.dates}><label>시작일<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>종료일<input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)}/></label>{[0, -1].map(n => <button type="button" key={n} onClick={() => { const d = dayjs().add(n, "month"); setStart(d.startOf("month").format("YYYY-MM-DD")); setEnd((n ? d.endOf("month") : d).format("YYYY-MM-DD")); }}>{n ? "지난달" : "이번 달"}</button>)}</div><div className={styles.roster}>{loading ? <p>학생을 불러오는 중…</p> : groups.map(g => <section key={g.id}><label className={styles.group}><input type="checkbox" checked={!!g.students.length && g.students.every(s => selected.includes(s.id))} onChange={e => setSelected(ids => e.target.checked ? [...new Set([...ids, ...g.students.map(s => s.id)])] : ids.filter(id => !g.students.some(s => s.id === id)))}/>{g.group}</label><div>{g.students.map(s => <label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))}/>{s.name} <small>{s.grade}</small></label>)}</div></section>)}</div><button type="button" className={styles.primary} onClick={() => void generate()}>{busy ? "보고서 생성 중…" : `${selected.length}명 보고서 미리보기`}</button></fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}{preview && <div className={styles.printControls}><button type="button" onClick={() => window.print()}>PDF 저장 / 인쇄</button><span>인쇄 대상에서 ‘PDF로 저장’을 선택하세요. 미리보기는 생성 시점의 저장된 기록입니다.</span></div>}</div><div className={styles.preview}>{preview ? preview.students.flatMap(student => reportMonths(preview.start, preview.end).map(month => <MonthlyReport key={`${student.id}-${month}`} student={student} month={month} preview={preview}/>)) : <div className={styles.placeholder}>학생별 · 월별 A4 보고서가 여기에 표시됩니다.</div>}</div></main>;
}
