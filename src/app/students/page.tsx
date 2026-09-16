"use client";

import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard } from "lucide-react";
import logo from "../../../public/logo.png";
import StudentManagerModal from "../../components/StudentManagerModal";
import styles from "./students.module.css";
import LandingMenu from "../../components/LandingMenu";

export default function StudentsPage() {
  return <main className={styles.page}>
    <header><div className={styles.identity}><Link href="/" aria-label="홈으로 이동"><Image src={logo} alt="COSMATH MATH ACADEMY" priority /></Link><span><LayoutDashboard size={17} /> 학생 관리</span></div><LandingMenu /></header>
    <StudentManagerModal open onClose={() => history.back()} onChanged={() => {}} mode="page" />
  </main>;
}
