"use client";

import Link from "next/link";
import { ArrowRight, Download, LogIn } from "lucide-react";
import { useAuth } from "./AuthProvider";
import styles from "../app/landing.module.css";

export default function LandingAuthNav() {
  const { user, workspace, loading, signIn } = useAuth();

  return (
    <div className={styles.authActions}>
      <a
        href="/downloads/Cosmath-Desktop-App.exe"
        download="Cosmath-Desktop-App.exe"
        className={styles.desktopDownloadButton}
        title="카카오톡 자동 발송 기능이 포함된 Windows 전용 데스크톱 앱 다운로드"
      >
        <Download size={16} aria-hidden="true" /> PC 앱 다운로드
      </a>
      {loading ? (
        <span className={styles.authPlaceholder} aria-hidden="true" />
      ) : user && workspace ? (
        <Link href="/students" className={styles.loginButton}>
          대시보드로 가기 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <button className={styles.loginButton} onClick={() => void signIn()}>
          <LogIn size={16} aria-hidden="true" /> 로그인
        </button>
      )}
    </div>
  );
}

