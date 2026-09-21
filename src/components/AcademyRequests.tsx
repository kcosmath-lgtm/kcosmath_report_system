"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "../app/settings/settings.module.css";

type Request = { id: string; full_name: string; email: string; created_at: string };
export default function AcademyRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const { data, error } = await supabase.rpc("cosmath_pending_join_requests");
    if (error) throw error;
    setRequests(data ?? []);
  }
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("cosmath_pending_join_requests").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message); else setRequests(data ?? []);
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { setError((e as { message?: string })?.message || "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc("cosmath_review_join_request", { p_id: id, p_approve: approve });
    if (error) throw error;
    setRequests(rows => rows.filter(r => r.id !== id));
    setMessage(approve ? "승인했습니다. 강사가 승인 상태를 확인하면 입장할 수 있습니다." : "가입 요청을 거절했습니다.");
  }
  return <section id="requests" className={styles.section} aria-busy={busy}>
    <div className={styles.sectionHead}><div><p>ACADEMY</p><h2>강사 가입 요청</h2></div></div>
    <p className={styles.requestNote}>승인한 강사는 학생·반 관리, 보고서, 오답, 인수인계의 모든 업무 기능을 편집할 수 있습니다.</p>
    <div className={styles.actions}><button disabled={busy} onClick={() => void run(load)}>{busy ? "처리 중…" : "요청 새로고침"}</button></div>
    {!busy && !error && !requests.length && <p className={styles.requestNote}>대기 중인 요청이 없습니다.</p>}
    {requests.map(r => <div className={styles.requestRow} key={r.id}><div><strong>{r.full_name || "이름 미등록"}</strong><p>{r.email}</p><small>{new Date(r.created_at).toLocaleString("ko-KR")}</small></div><div className={styles.actions}>
      <button disabled={busy} onClick={() => void run(() => review(r.id, true))}>승인</button><button disabled={busy} onClick={() => void run(() => review(r.id, false))}>거절</button>
    </div></div>)}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.requestNote}>{message}</p>}
  </section>;
}
