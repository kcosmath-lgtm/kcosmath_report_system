"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Building2, GraduationCap } from "lucide-react";
import logo from "../../public/logo.png";
import { supabase } from "../lib/supabase";
import styles from "./auth-shell.module.css";

type Academy = { id: string; name: string };
type JoinRequest = { id: string; academy_name: string; status: "pending" | "rejected" };
export default function WorkspaceOnboarding({ refresh, signOut }: { refresh: () => Promise<void>; signOut: () => Promise<void> }) {
  const [kind, setKind] = useState<"owner" | "staff" | null>(null);
  const [name, setName] = useState("");
  const [results, setResults] = useState<Academy[]>([]);
  const [searched, setSearched] = useState(false);
  const [request, setRequest] = useState<JoinRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  async function loadRequest() {
    const { data, error } = await supabase.rpc("cosmath_my_join_request");
    if (error) throw error;
    setRequest(data);
    if (data) setKind("staff");
    setReady(true);
  }
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("cosmath_my_join_request").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else { setRequest(data); if (data) setKind("staff"); setReady(true); }
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message || "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function search() {
    const { data, error } = await supabase.rpc("cosmath_search_academies", { p_query: name.trim() });
    if (error) throw error;
    setResults(data ?? []); setSearched(true);
  }
  return <main className={styles.authPage}><section className={styles.authPanel} aria-busy={busy}>
    <Image src={logo} alt="COSMATH" priority />
    {!ready ? <><h1>계정 정보를 확인합니다</h1><button disabled={busy} onClick={() => void run(loadRequest)}>{busy ? "확인 중…" : "다시 확인"}</button></> : !kind ? <>
      <h1>어떤 계정으로 시작할까요?</h1><span>학원을 운영하거나, 소속 학원에 강사로 참여하세요.</span>
      <button disabled={busy} onClick={() => setKind("owner")}><Building2 /> 학원 계정 · 학원 만들기</button>
      <button disabled={busy} onClick={() => setKind("staff")}><GraduationCap /> 강사 계정 · 가입 요청하기</button>
    </> : kind === "owner" ? <>
      <h1>학원 워크스페이스 만들기</h1><span>학원을 만들고 선생님들의 가입 요청을 승인할 수 있습니다.</span>
      <label>학원 이름<input value={name} maxLength={100} disabled={busy} onChange={e => setName(e.target.value)} placeholder="예: 코스매스 수학학원" /></label>
      <button disabled={busy || !name.trim()} onClick={() => void run(async () => {
        const { error } = await supabase.rpc("cosmath_create_workspace", { p_name: name.trim() });
        if (error) throw error;
        await refresh();
      })}>{busy ? "처리 중…" : "학원 만들기"}</button>
    </> : request ? <>
      <h1>{request.status === "pending" ? "학원 승인 대기 중" : "가입 요청이 거절되었습니다"}</h1>
      <span>{request.academy_name}<br />{request.status === "pending" ? "운영자가 승인하면 학원의 모든 업무 기능을 사용할 수 있습니다." : "학원 운영자에게 확인하거나 다른 학원을 선택해 주세요."}</span>
      <button disabled={busy} onClick={() => void run(async () => { await loadRequest(); await refresh(); })}>승인 상태 확인</button>
      <button disabled={busy} onClick={() => void run(async () => {
        const { error } = await supabase.rpc("cosmath_cancel_join_request", { p_id: request.id });
        if (error) throw error;
        setRequest(null); setResults([]); setSearched(false);
      })}>{request.status === "pending" ? "요청 취소" : "다시 선택하기"}</button>
    </> : <>
      <h1>소속 학원 찾기</h1><span>승인 후 학생·반, 보고서, 오답, 인수인계를 조회하고 편집할 수 있습니다.</span>
      <form onSubmit={e => { e.preventDefault(); if (name.trim().length >= 2) void run(search); }}>
        <label>학원 이름<input value={name} maxLength={100} disabled={busy} onChange={e => { setName(e.target.value); setResults([]); setSearched(false); }} placeholder="학원 이름 두 글자 이상" /></label>
        <button disabled={busy || name.trim().length < 2}>학원 검색</button>
      </form>
      <ul className={styles.results}>{results.map(a => <li key={a.id}><div><strong>{a.name}</strong><small>학원 식별번호 {a.id.slice(0, 8)}</small></div><button disabled={busy} onClick={() => void run(async () => {
        const { data, error } = await supabase.rpc("cosmath_request_academy_access", { p_academy_id: a.id });
        if (error) throw error;
        setRequest(data);
      })}>가입 요청</button></li>)}</ul>
      {searched && !results.length && <p role="status">검색 결과가 없습니다. 학원 이름을 확인해 주세요.</p>}
    </>}
    {ready && kind && !request && <button className={styles.secondary} disabled={busy} onClick={() => { setKind(null); setName(""); setResults([]); setSearched(false); }}>계정 유형 다시 선택</button>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <button className={styles.secondary} disabled={busy} onClick={() => void run(signOut)}>로그아웃</button>
  </section></main>;
}
