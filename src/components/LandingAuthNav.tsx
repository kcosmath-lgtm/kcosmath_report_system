"use client";

import { LogIn } from "lucide-react";
import LandingMenu from "./LandingMenu";
import { useAuth } from "./AuthProvider";
import styles from "../app/landing.module.css";

export default function LandingAuthNav() {
  const { user, workspace, loading, signIn } = useAuth();
  if (loading) return <span className={styles.authPlaceholder} aria-hidden="true" />;
  if (user && workspace) return <LandingMenu />;
  return <button className={styles.loginButton} onClick={() => void signIn()}><LogIn size={16} /> 로그인</button>;
}
