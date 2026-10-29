"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, FileText, Menu } from "lucide-react";
import logo from "../../../public/logo.png";
import StudentManagerModal from "../../components/StudentManagerModal";
import styles from "./students.module.css";
import LandingMenu from "../../components/LandingMenu";

export default function StudentsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return <main className={styles.page} data-sidebar-open={sidebarOpen}>
    <header><div className={styles.identity}>{!sidebarOpen && <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(true)} aria-label="학생 목록 열기" aria-expanded={sidebarOpen} aria-controls="student-manager-roster"><Menu size={20} /></button>}<Link href="/" aria-label="홈으로 이동"><Image src={logo} alt="UNIDESK" priority /></Link><span><LayoutDashboard size={17} /> 학생 · 수업 관리</span></div><div className={styles.headerActions}><Link href="/report/new" className={styles.reportButton}><FileText size={16} /> 학습 보고서 만들기</Link><LandingMenu /></div></header>
    <StudentManagerModal open onClose={() => history.back()} onChanged={() => {}} mode="page" sidebarOpen={sidebarOpen} onSidebarClose={() => setSidebarOpen(false)} />
  </main>;
}
