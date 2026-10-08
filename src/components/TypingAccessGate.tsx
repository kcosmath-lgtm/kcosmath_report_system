"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, LockKeyhole } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";

export default function TypingAccessGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false, sequence = 0;
    setAllowed(null);
    async function check() {
      const current = ++sequence;
      try {
        const { data, error } = await supabase.rpc("cosmath_has_typing_access");
        if (cancelled || current !== sequence) return;
        setAllowed(!error && data === true);
        setError(error ? "사용 권한을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." : "");
      } catch {
        if (!cancelled && current === sequence) { setAllowed(false); setError("사용 권한을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요."); }
      }
    }
    void check(); window.addEventListener("focus", check);
    return () => { cancelled = true; window.removeEventListener("focus", check); };
  }, [user?.id, attempt]);
  if (allowed) return children;
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-9 text-center shadow-sm">
    {allowed === null ? <><Loader2 className="animate-spin mx-auto text-sky-600"/><p className="mt-4 text-sm text-slate-500">사용 권한을 확인하고 있습니다.</p></> : <>
      <LockKeyhole className="mx-auto text-sky-600" size={34}/><h1 className="mt-5 text-xl font-bold text-slate-800">시험지 타이핑 사용 권한이 필요합니다</h1>
      <p className="mt-3 text-sm leading-7 text-slate-500" role={error ? "alert" : undefined}>{error || "관리자가 허용한 계정만 사용할 수 있습니다. 사용하려면 관리자에게 권한을 요청해 주세요."}</p>
      <p className="mt-3 text-xs text-slate-400">{user?.email}</p><div className="mt-6 flex items-center justify-center gap-4 text-sm"><Link href="/" className="text-slate-500">홈으로</Link><button onClick={() => setAttempt(n => n + 1)} className="rounded-lg bg-sky-700 px-4 py-2 text-white">권한 다시 확인</button></div>
    </>}
  </section></main>;
}
