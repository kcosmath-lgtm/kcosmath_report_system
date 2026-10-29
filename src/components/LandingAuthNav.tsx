"use client";

import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { useAuth } from "./AuthProvider";
import styles from "../app/landing.module.css";

export default function LandingAuthNav() {
  const { user, workspace, loading, signIn } = useAuth();
  if (loading) return <span className={styles.authPlaceholder} aria-hidden="true" />;
  if (user && workspace) {
    return (
      <Link href="/students" className={styles.loginButton}>
        대시보드로 가기 <ArrowRight size={16} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button className={styles.loginButton} onClick={() => void signIn()}>
      <LogIn size={16} aria-hidden="true" /> 로그인
    </button>
  );
}
