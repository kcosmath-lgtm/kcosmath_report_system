"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Building2, ClipboardPenLine, FileText, LogOut, Menu, ScanText, Settings, UserRoundCog, X } from "lucide-react";
import styles from "./landing-menu.module.css";
import { useAuth } from "./AuthProvider";

export default function LandingMenu({ profile = true }: { profile?: boolean }) {
  const { user, workspace, signOut } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return <div className={styles.menu}>
    <button className={`${styles.trigger} ${profile ? styles.profileTrigger : ""}`} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="landing-main-menu" aria-label={open ? "프로필 메뉴 닫기" : "프로필 메뉴 열기"}>{open ? <X size={19} /> : profile ? avatarUrl ? <Image src={avatarUrl} alt="프로필 사진" width={38} height={38} unoptimized /> : <Building2 size={18} /> : <Menu size={23} />}</button>
    {open && <><button className={styles.scrim} aria-label="메뉴 닫기" onClick={() => setOpen(false)} /><div ref={panel} id="landing-main-menu" className={styles.panel} tabIndex={-1}>
      <small>COSMATH WORKSPACE</small><h2>어떤 일을 시작할까요?</h2>
      <Link href="/report" onClick={() => setOpen(false)}><span><FileText size={21} /></span><div><strong>보고서 작성</strong><p>수업 내용과 학생별 보고서를 작성합니다.</p></div></Link>
      <Link href="/typing" onClick={() => setOpen(false)}><span><ScanText size={21} /></span><div><strong>시험지 타이핑</strong><p>시험지 PDF·이미지를 편집 가능한 문서로 만듭니다.</p></div></Link>
      <Link href="/students" onClick={() => setOpen(false)}><span><UserRoundCog size={21} /></span><div><strong>학생 관리</strong><p>학생 등록과 출석·오답·숙제·성적을 관리합니다.</p></div></Link>
      <Link href="/handoffs" onClick={() => setOpen(false)}><span><ClipboardPenLine size={21} /></span><div><strong>인수인계</strong><p>날짜별 특이사항과 참고사항을 공유합니다.</p></div></Link>
      <Link href="/settings" onClick={() => setOpen(false)}><span><Settings size={21} /></span><div><strong>설정</strong><p>프로필과 워크스페이스 정보를 관리합니다.</p></div></Link>
      <div className={styles.account}><div><strong>{workspace?.name}</strong><small>{user?.email}</small></div><button onClick={() => void signOut()} aria-label="로그아웃" title="로그아웃"><LogOut size={17} /></button></div>
    </div></>}
  </div>;
}
