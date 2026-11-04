"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "../app/settings/settings.module.css";

type Member = {
  user_id: string;
  full_name: string;
  email: string;
  academy_name: string;
  allowed: boolean;
  can_manage: boolean;
};

type QuotaStatus = {
  academy_id?: string;
  academy_name?: string;
  allowed?: boolean;
  can_manage?: boolean;
  is_blocked?: boolean;
  daily_pct?: number;
  weekly_pct?: number;
  monthly_pct?: number;
  daily_remaining_pct?: number;
  weekly_remaining_pct?: number;
  monthly_remaining_pct?: number;
};

type AcademyQuotaRow = {
  academy_id: string;
  academy_name: string;
  member_count: number;
  daily_capacity: number;
  weekly_capacity: number;
  monthly_capacity: number;
  is_blocked: boolean;
  daily_pct: number;
  weekly_pct: number;
  monthly_pct: number;
};

export default function TypingPermissions() {
  const [manager, setManager] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [academies, setAcademies] = useState<AcademyQuotaRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [statusRes, quotaRes] = await Promise.all([
          supabase.rpc("cosmath_typing_access_status"),
          supabase.rpc("cosmath_get_ai_quota_status").then(r => r, () => ({ data: null, error: null })),
        ]);
        if (cancelled) return;
        if (quotaRes?.data && typeof quotaRes.data === "object") {
          setQuotaStatus(quotaRes.data as QuotaStatus);
        }
        if (statusRes.error || statusRes.data?.can_manage !== true) return;
        setManager(true);
        const [usersRes, acadRes] = await Promise.all([
          supabase.rpc("cosmath_list_typing_users"),
          supabase.rpc("cosmath_list_academy_ai_quotas").then(r => r, () => ({ data: [], error: null })),
        ]);
        if (cancelled) return;
        if (usersRes.error) throw usersRes.error;
        setMembers(usersRes.data ?? []);
        if (Array.isArray(acadRes?.data)) {
          setAcademies(acadRes.data as AcademyQuotaRow[]);
        }
      } catch {
        if (!cancelled) setError("사용자 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [result, acadRes, quotaRes] = await Promise.all([
        supabase.rpc("cosmath_list_typing_users"),
        supabase.rpc("cosmath_list_academy_ai_quotas").then(r => r, () => ({ data: [], error: null })),
        supabase.rpc("cosmath_get_ai_quota_status").then(r => r, () => ({ data: null, error: null })),
      ]);
      if (result.error) throw result.error;
      setMembers(result.data ?? []);
      if (Array.isArray(acadRes?.data)) setAcademies(acadRes.data as AcademyQuotaRow[]);
      if (quotaRes?.data && typeof quotaRes.data === "object") setQuotaStatus(quotaRes.data as QuotaStatus);
    } catch {
      setError("사용자 목록을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(person: Member) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await supabase.rpc("cosmath_set_typing_access", {
        p_user_id: person.user_id,
        p_allowed: !person.allowed,
      });
      if (result.error) throw result.error;
      setMembers(rows => rows.map(p => (p.user_id === person.user_id ? { ...p, allowed: !person.allowed } : p)));
      setMessage(`${person.email} 계정의 사용을 ${person.allowed ? "차단" : "허용"}했습니다.`);
    } catch (e) {
      setError((e as { message?: string })?.message || "권한을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAcademyScale(row: AcademyQuotaRow, multiplier: number, blocked = row.is_blocked) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const daily = Math.round(100 * multiplier);
      const weekly = Math.round(400 * multiplier);
      const monthly = Math.round(1200 * multiplier);
      const res = await supabase.rpc("cosmath_set_academy_ai_quota", {
        p_academy_id: row.academy_id,
        p_daily_capacity: daily,
        p_weekly_capacity: weekly,
        p_monthly_capacity: monthly,
        p_is_blocked: blocked,
      });
      if (res.error) throw res.error;
      setMessage(`${row.academy_name} 학원의 AI 한도 설정을 업데이트했습니다.`);
      await refresh();
    } catch (e) {
      setError((e as { message?: string })?.message || "학원 한도를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resetAcademyUsage(row: AcademyQuotaRow, period: "daily" | "weekly" | "all") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await supabase.rpc("cosmath_reset_academy_ai_usage", {
        p_academy_id: row.academy_id,
        p_period: period,
      });
      if (res.error) throw res.error;
      setMessage(`${row.academy_name} 학원의 사용률(%)을 0%로 초기화했습니다.`);
      await refresh();
    } catch (e) {
      setError((e as { message?: string })?.message || "사용량 초기화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const visible = members.filter(p =>
    `${p.full_name} ${p.email} ${p.academy_name}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      {quotaStatus && quotaStatus.academy_name && (
        <section id="ai-quota-overview" className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p>AI QUOTA STATUS</p>
              <h2>우리 학원 AI 사용량 ({quotaStatus.academy_name})</h2>
            </div>
          </div>
          <p className={styles.requestNote}>
            학원 단위로 일간·주간·월간 통합 AI 사용률이 관리됩니다. 100%에 도달하면 다음 주기에 자동으로 0%로 초기화됩니다.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 12 }}>
            {[
              { label: "오늘(일간) 사용률", pct: Number(quotaStatus.daily_pct ?? 0), reset: "매일 자정 0% 리셋", color: "#38bdf8" },
              { label: "이번 주(주간) 사용률", pct: Number(quotaStatus.weekly_pct ?? 0), reset: "매주 월요일 0% 리셋", color: "#4ade80" },
              { label: "이번 달(월간) 사용률", pct: Number(quotaStatus.monthly_pct ?? 0), reset: "매월 1일 0% 리셋", color: "#facc15" },
            ].map(item => (
              <div
                key={item.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{item.label}</span>
                  <strong style={{ fontSize: 18, fontWeight: 900, color: item.pct >= 90 ? "#e11d48" : "#0f172a" }}>
                    {item.pct.toFixed(1)}%
                  </strong>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, item.pct))}%`,
                      height: "100%",
                      background: item.pct >= 90 ? "#f43f5e" : item.color,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <small style={{ display: "block", marginTop: 6, fontSize: 11, color: "#64748b" }}>
                  잔여 {Math.max(0, 100 - item.pct).toFixed(1)}% · {item.reset}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}

      {manager && (
        <section id="typing-permissions" className={styles.section} aria-busy={busy}>
          <div className={styles.sectionHead}>
            <div>
              <p>TYPING & AI ACCESS</p>
              <h2>시험지 타이핑 및 학원별 AI 한도 관리</h2>
            </div>
          </div>
          <p className={styles.requestNote}>
            학원별 일간·주간·월간 AI 사용률(%)을 모니터링하고 용량 배수나 사용량 초기화를 관리할 수 있습니다.
          </p>

          {academies.length > 0 && (
            <div style={{ marginBottom: 24, display: "grid", gap: 10 }}>
              {academies.map(row => {
                const scale = Math.round((row.daily_capacity / 100) * 10) / 10;
                return (
                  <div className={styles.requestRow} key={row.academy_id}>
                    <div>
                      <strong>
                        {row.academy_name} <small>({row.member_count}명 · 한도 배수 {scale}x)</small>
                      </strong>
                      <p>
                        일간 <b>{row.daily_pct}%</b> · 주간 <b>{row.weekly_pct}%</b> · 월간 <b>{row.monthly_pct}%</b> 사용 중
                      </p>
                      <small>{row.is_blocked ? "AI 일시 차단됨" : "정상 가동 중"}</small>
                    </div>
                    <div className={styles.actions} style={{ flexWrap: "wrap", gap: 6 }}>
                      <button disabled={busy} onClick={() => void updateAcademyScale(row, 1)}>
                        기본(1x)
                      </button>
                      <button disabled={busy} onClick={() => void updateAcademyScale(row, 2)}>
                        확장(2x)
                      </button>
                      <button disabled={busy} onClick={() => void updateAcademyScale(row, 5)}>
                        대형(5x)
                      </button>
                      <button disabled={busy} onClick={() => void resetAcademyUsage(row, "all")}>
                        0% 초기화
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void updateAcademyScale(row, scale || 1, !row.is_blocked)}
                      >
                        {row.is_blocked ? "학원 차단 해제" : "학원 일시 차단"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.formRow}>
            <label>
              이름·이메일·학원으로 검색
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="권한을 줄 사용자를 찾으세요"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button disabled={busy} onClick={() => void refresh()}>
              목록 새로고침
            </button>
          </div>
          {visible.map(person => (
            <div className={styles.requestRow} key={person.user_id}>
              <div>
                <strong>{person.full_name || "이름 미등록"}</strong>
                <p>{person.email}</p>
                <small>
                  {person.academy_name} · {person.can_manage ? "권한 관리자" : person.allowed ? "사용 허용" : "사용 차단"}
                </small>
              </div>
              <div className={styles.actions}>
                <button
                  disabled={busy || person.can_manage}
                  aria-label={`${person.email} ${person.allowed ? "사용 차단" : "사용 허용"}`}
                  onClick={() => void toggle(person)}
                >
                  {person.can_manage ? "관리자" : person.allowed ? "사용 차단" : "사용 허용"}
                </button>
              </div>
            </div>
          ))}
          {!busy && !error && !visible.length && (
            <p className={styles.requestNote}>
              검색한 사용자가 없습니다. 사용자는 먼저 로그인하고 학원에 가입해야 합니다.
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {message && (
            <p role="status" className={styles.requestNote}>
              {message}
            </p>
          )}
        </section>
      )}
    </>
  );
}
