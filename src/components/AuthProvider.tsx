"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Building2, Loader2, LogIn } from "lucide-react";
import logo from "../../public/logo.png";
import { supabase } from "../lib/supabase";
import styles from "./auth-shell.module.css";

export type Workspace = { id: string; name: string; role: "owner" | "staff" };
type AuthContextValue = {
  user: User | null;
  workspace: Workspace | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [academyName, setAcademyName] = useState("");
  const [error, setError] = useState("");
  const activeUserId = useRef<string | null>(null);

  const loadWorkspace = useCallback(async (nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null;
    if (nextUserId && activeUserId.current === nextUserId) {
      setSession(nextSession);
      return;
    }
    activeUserId.current = nextUserId;
    setSession(nextSession);
    setWorkspace(null);
    if (!nextSession) { setLoading(false); return; }
    const { data, error: requestError } = await supabase.rpc("cosmath_get_my_workspace");
    if (requestError) setError(requestError.message);
    else setWorkspace(data as Workspace | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => loadWorkspace(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => void loadWorkspace(nextSession), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadWorkspace]);

  async function signIn() {
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (signInError) setError(signInError.message);
  }

  async function createWorkspace() {
    if (!academyName.trim()) return;
    setCreating(true); setError("");
    const { data, error: createError } = await supabase.rpc("cosmath_create_workspace", { p_name: academyName.trim() });
    if (createError) setError(createError.message);
    else setWorkspace(data as Workspace);
    setCreating(false);
  }

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    workspace,
    loading,
    signIn,
    signOut: async () => { await supabase.auth.signOut(); setWorkspace(null); },
  }), [session, workspace, loading]);

  let content = children;
  if (pathname !== "/" && loading) content = <div className={styles.loading}><Loader2 className="animate-spin" /><span>워크스페이스를 준비하고 있습니다.</span></div>;
  else if (pathname !== "/" && !session) content = <main className={styles.authPage}><section className={styles.authPanel}>
    <Image src={logo} alt="COSMATH" priority />
    <p>선생님의 기록, 학생의 성장</p>
    <h1>코스매스 워크스페이스</h1>
    <span>학원 데이터 보호를 위해 로그인해 주세요.</span>
    <button onClick={() => void signIn()}><b>G</b> Google로 계속하기 <LogIn /></button>
    {error && <div role="alert" className={styles.error}>{error}</div>}
  </section></main>;
  else if (pathname !== "/" && !workspace) content = <main className={styles.authPage}><section className={styles.authPanel}>
    <Image src={logo} alt="COSMATH" priority />
    <div className={styles.workspaceIcon}><Building2 /></div>
    <h1>학원 워크스페이스 만들기</h1>
    <span>기존 데이터가 있다면 이 계정의 학원으로 안전하게 연결됩니다.</span>
    <label>학원 이름<input value={academyName} maxLength={100} autoFocus onChange={event => setAcademyName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void createWorkspace(); }} placeholder="예: 코스매스 수학학원" /></label>
    <button disabled={creating || !academyName.trim()} onClick={() => void createWorkspace()}>{creating ? <Loader2 className="animate-spin" /> : <Building2 />} 워크스페이스 시작하기</button>
    <button className={styles.secondary} onClick={() => void value.signOut()}>다른 계정으로 로그인</button>
    {error && <div role="alert" className={styles.error}>{error}</div>}
  </section></main>;
  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
