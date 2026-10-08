"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "../app/settings/settings.module.css";
type Member = { user_id: string; full_name: string; email: string; academy_name: string; allowed: boolean; can_manage: boolean };
export default function TypingPermissions() {
  const [manager, setManager] = useState(false), [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await supabase.rpc("cosmath_typing_access_status");
        if (cancelled || status.error || status.data?.can_manage !== true) return;
        setManager(true);
        const result = await supabase.rpc("cosmath_list_typing_users");
        if (cancelled) return;
        if (result.error) throw result.error;
        setMembers(result.data ?? []);
      } catch { if (!cancelled) setError("사용자 목록을 불러오지 못했습니다."); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  async function refresh() {
    setBusy(true); setError("");
    try { const result = await supabase.rpc("cosmath_list_typing_users"); if (result.error) throw result.error; setMembers(result.data ?? []); }
    catch { setError("사용자 목록을 불러오지 못했습니다."); } finally { setBusy(false); }
  }
  async function toggle(person: Member) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("cosmath_set_typing_access", { p_user_id: person.user_id, p_allowed: !person.allowed });
      if (result.error) throw result.error;
      setMembers(rows => rows.map(p => p.user_id === person.user_id ? { ...p, allowed: !person.allowed } : p));
      setMessage(`${person.email} 계정의 사용을 ${person.allowed ? "차단" : "허용"}했습니다.`);
    } catch (e) { setError((e as { message?: string })?.message || "권한을 변경하지 못했습니다."); } finally { setBusy(false); }
  }
  if (!manager) return null;
  const visible = members.filter(p => `${p.full_name} ${p.email} ${p.academy_name}`.toLowerCase().includes(query.toLowerCase()));
  return <section id="typing-permissions" className={styles.section} aria-busy={busy}>
    <div className={styles.sectionHead}><div><p>TYPING ACCESS</p><h2>시험지 타이핑 사용 권한</h2></div></div>
    <p className={styles.requestNote}>허용한 계정만 시험지 타이핑과 OCR을 사용할 수 있습니다. 차단하면 이후 OCR 요청과 학원 시험지 접근이 거절됩니다. 이미 처리 중인 인식 요청과 내려받은 파일은 취소되지 않습니다.</p>
    <div className={styles.formRow}><label>이름·이메일·학원으로 검색<input value={query} onChange={e => setQuery(e.target.value)} placeholder="권한을 줄 사용자를 찾으세요"/></label></div>
    <div className={styles.actions}><button disabled={busy} onClick={() => void refresh()}>목록 새로고침</button></div>
    {visible.map(person => <div className={styles.requestRow} key={person.user_id}><div><strong>{person.full_name || "이름 미등록"}</strong><p>{person.email}</p><small>{person.academy_name} · {person.can_manage ? "권한 관리자" : person.allowed ? "사용 허용" : "사용 차단"}</small></div><div className={styles.actions}><button disabled={busy || person.can_manage} aria-label={`${person.email} ${person.allowed ? "사용 차단" : "사용 허용"}`} onClick={() => void toggle(person)}>{person.can_manage ? "관리자" : person.allowed ? "사용 차단" : "사용 허용"}</button></div></div>)}
    {!busy && !error && !visible.length && <p className={styles.requestNote}>검색한 사용자가 없습니다. 사용자는 먼저 로그인하고 학원에 가입해야 합니다.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.requestNote}>{message}</p>}
  </section>;
}
