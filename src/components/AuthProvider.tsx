"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import logo from "../../public/logo.png";
import { supabase } from "../lib/supabase";
import styles from "./auth-shell.module.css";
import WorkspaceOnboarding from "./WorkspaceOnboarding";

export type Workspace = { id: string; name: string; role: "owner" | "staff" };
type AuthContextValue = {
  user: User | null;
  workspace: Workspace | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<string | null>;
  uploadAvatar: (file: File) => Promise<string | null>;
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
  const [error, setError] = useState("");
  const activeUserId = useRef<string | null>(null);

  const requestSequence = useRef(0);
  const loadWorkspace = useCallback(async (nextSession: Session | null, force = false) => {
    const nextUserId = nextSession?.user.id ?? null;
    setSession(nextSession);
    if (!force && nextUserId && activeUserId.current === nextUserId) return;
    activeUserId.current = nextUserId;
    const sequence = ++requestSequence.current;
    setLoading(true); setError(""); setWorkspace(null);
    if (!nextSession) { setLoading(false); return; }
    try {
      const { data, error: requestError } = await supabase.rpc("cosmath_get_my_workspace");
      if (sequence !== requestSequence.current) return;
      if (requestError) throw requestError;
      setWorkspace(data as Workspace | null);
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      activeUserId.current = null;
      setError((e as { message?: string })?.message || "학원 정보를 불러오지 못했습니다.");
    } finally { if (sequence === requestSequence.current) setLoading(false); }
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

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    workspace,
    loading,
    signIn,
    signOut: async () => { await supabase.auth.signOut(); setWorkspace(null); },
    updateProfile: async (fullName: string) => {
      const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
      return updateError?.message ?? null;
    },
    uploadAvatar: async (file: File) => {
      if (!session?.user) return "로그인이 필요합니다.";
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "JPG, PNG 또는 WebP 이미지만 사용할 수 있습니다.";
      if (file.size > 2 * 1024 * 1024) return "프로필 사진은 2MB 이하여야 합니다.";
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${session.user.id}/profile.${extension}`;
      const { error: uploadError } = await supabase.storage.from("cosmath-avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (uploadError) return uploadError.message;
      const { data } = supabase.storage.from("cosmath-avatars").getPublicUrl(path);
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: `${data.publicUrl}?v=${Date.now()}` } });
      return updateError?.message ?? null;
    },
  }), [session, workspace, loading]);

  let content = children;
  if ((pathname !== "/" || session) && loading) content = <div className={styles.loading}><Loader2 className="animate-spin" /><span>워크스페이스를 준비하고 있습니다.</span></div>;
  else if (pathname !== "/" && !session) content = <main className={styles.authPage}><section className={styles.authPanel}>
    <Image src={logo} alt="COSMATH" priority />
    <p>선생님의 기록, 학생의 성장</p>
    <h1>코스매스 워크스페이스</h1>
    <span>학원 데이터 보호를 위해 로그인해 주세요.</span>
    <button onClick={() => void signIn()}><b>G</b> Google로 계속하기 <LogIn /></button>
    {error && <div role="alert" className={styles.error}>{error}</div>}
  </section></main>;
  else if (session && error && !workspace) content = <main className={styles.authPage}><section className={styles.authPanel}>
    <h1>학원 정보를 확인하지 못했습니다</h1><div role="alert" className={styles.error}>{error}</div>
    <button onClick={() => void loadWorkspace(session, true)}>다시 확인</button>
    <button onClick={() => void value.signOut()}>로그아웃</button>
  </section></main>;
  else if (session && !workspace) content = <WorkspaceOnboarding key={session.user.id} refresh={() => loadWorkspace(session, true)} signOut={value.signOut} />;
  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}
