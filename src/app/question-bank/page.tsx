import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, FileStack, ScanText, ShieldCheck, Sparkles } from "lucide-react";
import logo from "../../../public/logo.png";
import LandingMenu from "../../components/LandingMenu";
import MockExamLibrary from "../../components/MockExamLibrary";
import catalogData from "../../data/mock-exams.json";
import type { MockExamCatalog } from "../../types/mock-exam";
import styles from "./question-bank.module.css";

const stages = [
  { number: "01", title: "문제 모으기", icon: FileStack, description: "역대 모의고사와 직접 만든 문제를 한곳에 모읍니다.", items: ["PDF·이미지에서 문항별 등록", "출처·연도·학년·문항 번호 기록", "문제 원본·수식·정답·해설 함께 보관"] },
  { number: "02", title: "찾고 분류하기", icon: BookOpen, description: "수업에 필요한 문제를 개념과 풀이 유형으로 찾습니다.", items: ["학년·단원·난이도별 검색", "세부 개념과 풀이 유형으로 분류", "기출·자체 제작·AI 변형 구분"] },
  { number: "03", title: "AI로 변형하기", icon: Sparkles, description: "원본의 풀이 구조를 참고해 새로운 연습 문제를 만듭니다.", items: ["수치 변경 → 조건 변경 순으로 확장", "문제·정답·해설을 함께 생성", "수학 검증과 선생님 검토 후 등록"] },
  { number: "04", title: "시험지 구성하기", icon: ScanText, description: "선택한 문제를 모아 수업 목적에 맞는 시험지를 구성합니다.", items: ["문항 순서·배점·풀이 공간 편집", "시험지와 정답·해설지 분리", "이후 학생별 오답 보충 시험지로 확장"] },
];

export default function QuestionBankPage() {
  const catalog = catalogData as MockExamCatalog;
  const storedProblems = catalog.exams.filter(exam => exam.resources.some(resource => resource.kind === "problem" && resource.localPath)).length;
  const uniqueFiles = new Map(catalog.exams.flatMap(exam => exam.resources).filter(resource => resource.localPath).map(resource => [resource.sha256, resource.bytes || 0]));
  const totalMb = [...uniqueFiles.values()].reduce((sum, bytes) => sum + bytes, 0) / 1024 / 1024;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.identity}><Link href="/" aria-label="COSMATH 홈"><Image src={logo} alt="COSMATH MATH ACADEMY" priority /></Link><span><BookOpen size={18} aria-hidden="true" />문제은행</span></div>
      <LandingMenu />
    </header>
    <div className={styles.content}>
      <section className={styles.intro} aria-labelledby="bank-title">
        <span className={styles.badge}>고1 · 고2 · 고3 수학</span>
        <h1 id="bank-title">역대 기출을 한곳에서.</h1>
        <p>{catalog.requestedYears.from}~{catalog.requestedYears.to}년 EBSi 공개 자료실의 수학 기출을 모았습니다.<br />학년과 시행 연도를 선택해 원본 문제·정답·해설을 확인하세요.</p>
        <div className={styles.stats}><div><span>등록 자료</span><strong>{catalog.exams.length}<small>건</small></strong></div><div><span>원본 문제 확보</span><strong>{storedProblems}<small>건</small></strong></div><div><span>중복 제거 후 저장 용량</span><strong>{totalMb.toFixed(1)}<small>MB</small></strong></div></div>
        <div className={styles.notice}>시험지 단위의 원본 자료입니다. 미확보 파일은 공식 자료실에서 확인할 수 있습니다. 문항별 분리·AI 변형·시험지 조합은 아직 연결되지 않았습니다.</div>
      </section>
      <MockExamLibrary exams={catalog.exams} />
      <h2 className={styles.roadmapTitle}>다음으로 만들어갈 기능</h2>
      <section aria-label="문제은행 이용 흐름" className={styles.flow}>
        {stages.map(({ number, title, icon: Icon, description, items }) => <article key={number} className={styles.card}>
          <div className={styles.cardTop}><span className={styles.icon}><Icon size={23} aria-hidden="true" /></span><span>{number}</span></div>
          <h2>{title}</h2><p>{description}</p><ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
        </article>)}
      </section>
      <div className={styles.bottom}>
        <section className={styles.plan} aria-labelledby="plan-title"><span className={styles.eyebrow}>먼저 만들 기능</span><h2 id="plan-title">기출 등록부터 시험지 출력까지</h2><p>첫 버전은 문제 등록·검색·시험지 편집에 집중합니다. 이후 수치 변형을 추가하고, 검증 과정을 갖춘 뒤 조건 변형과 개념 기반 신규 출제로 넓혀갑니다.</p><Link href="/typing">기존 시험지 타이핑 열기 <ArrowRight size={16} aria-hidden="true" /></Link></section>
        <section className={styles.review} aria-labelledby="review-title"><ShieldCheck size={26} aria-hidden="true" /><h2 id="review-title">검토한 문제를 수업에 사용하도록</h2><p>AI 변형 문제는 원본과 연결해 관리하고, 정답·조건·보기 검증과 선생님 검토를 거쳐 출제 대상으로 등록하는 흐름을 계획하고 있습니다.</p><div className={styles.statuses}><span>생성 초안</span><ArrowRight size={14} aria-hidden="true" /><span>검토 대기</span><ArrowRight size={14} aria-hidden="true" /><span>출제 가능</span></div></section>
      </div>
    </div>
  </main>;
}
