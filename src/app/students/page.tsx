"use client";

import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, FileText } from "lucide-react";
import logo from "../../../public/logo.png";
import StudentManagerModal from "../../components/StudentManagerModal";
import styles from "./students.module.css";
import LandingMenu from "../../components/LandingMenu";

export default function StudentsPage() {
  return <main className={styles.page}>
    <header><div className={styles.identity}><Link href="/" aria-label="홈으로 이동"><Image src={logo} alt="COSMATH MATH ACADEMY" priority /></Link><span><LayoutDashboard size={17} /> 학생 관리</span></div><div className={styles.headerActions}><Link href="/errors/report" className={styles.reportButton}><FileText size={16} /> 오답·숙제 보고서</Link><LandingMenu /></div></header>
    <StudentManagerModal open onClose={() => history.back()} onChanged={() => {}} mode="page" />
  </main>;
}
