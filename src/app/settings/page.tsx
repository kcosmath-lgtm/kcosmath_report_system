"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, Check, LogOut, Save, ShieldCheck, UserRound } from "lucide-react";
import logo from "../../../public/logo.png";
import LandingMenu from "../../components/LandingMenu";
import { useAuth } from "../../components/AuthProvider";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const { user, workspace, signOut, updateProfile } = useAuth();
  const [name, setName] = useState(() => user?.user_metadata?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function saveProfile() {
    if (!name.trim()) return;
    setSaving(true); setMessage("");
    const error = await updateProfile(name);
    setMessage(error || "프로필을 저장했습니다.");
    setSaving(false);
  }

  const initial = (user?.user_metadata?.full_name || user?.email || "P").slice(0, 1).toUpperCase();
  return <main className={styles.page}>
    <header><div className={styles.identity}><Link href="/"><Image src={logo} alt="COSMATH" priority /></Link><span><UserRound size={17} /> 설정</span></div><LandingMenu /></header>
    <div className={styles.shell}>
      <aside className={styles.settingsNav}><p>SETTINGS</p><h1>워크스페이스 설정</h1><nav><a href="#profile" className={styles.active}><UserRound /> 프로필</a><a href="#workspace"><Building2 /> 학원 정보</a><a href="#security"><ShieldCheck /> 계정 및 보안</a></nav></aside>
      <section className={styles.content}>
        <div className={styles.summary}><div className={styles.avatar}>{initial}</div><div><p>{workspace?.name}</p><h2>{user?.user_metadata?.full_name || user?.email?.split("@")[0]}</h2><span>{user?.email}</span></div><em>{workspace?.role === "owner" ? "소유자" : "직원"}</em></div>

        <section id="profile" className={styles.section}><div className={styles.sectionHead}><div><p>PROFILE</p><h2>프로필</h2></div><UserRound /></div><div className={styles.formRow}><label>표시 이름<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="이름을 입력하세요" /></label><label>이메일<input value={user?.email || ""} disabled /></label></div><div className={styles.actions}>{message && <span className={message.includes("저장") ? styles.success : styles.error}>{!message.includes("저장") ? null : <Check />} {message}</span>}<button disabled={saving || !name.trim()} onClick={() => void saveProfile()}><Save /> 저장</button></div></section>

        <section id="workspace" className={styles.section}><div className={styles.sectionHead}><div><p>WORKSPACE</p><h2>학원 정보</h2></div><Building2 /></div><dl><div><dt>학원 이름</dt><dd>{workspace?.name}</dd></div><div><dt>내 역할</dt><dd>{workspace?.role === "owner" ? "소유자" : "직원"}</dd></div><div><dt>워크스페이스 ID</dt><dd>{workspace?.id}</dd></div></dl></section>

        <section id="security" className={styles.section}><div className={styles.sectionHead}><div><p>ACCOUNT</p><h2>계정 및 보안</h2></div><ShieldCheck /></div><dl><div><dt>로그인 방식</dt><dd>Google</dd></div><div><dt>로그인 계정</dt><dd>{user?.email}</dd></div></dl><button className={styles.logout} onClick={() => void signOut()}><LogOut /> 로그아웃</button></section>
      </section>
    </div>
  </main>;
}
