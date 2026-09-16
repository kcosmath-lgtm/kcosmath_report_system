import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo.png";
import { ArrowRight, ArrowUpRight, BookOpen, Check, FileText, Layers3, Plus } from "lucide-react";
import LandingMenu from "../components/LandingMenu";
import styles from "./landing.module.css";

const steps = [
  ["01", "학생을 선택하고", "반별 학생 목록에서 보고서를 작성할 학생을 선택하세요."],
  ["02", "오늘의 수업을 기록하고", "공통 내용을 한 번에 작성하고, 학생별 내용을 세심하게 더하세요."],
  ["03", "저장하고 전달하세요", "DB 저장 버튼으로 내용을 저장하고, 보고서를 이미지로 내려받으세요."],
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>본문으로 이동</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="COSMATH 홈"><Image src={logo} alt="COSMATH MATH ACADEMY" priority className={styles.logo} /><small>WORKSPACE</small></Link>
        <nav aria-label="주 메뉴"><a href="#workspace">워크스페이스</a><a href="#guide">사용 안내</a><LandingMenu /></nav>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div>
            <p className={styles.eyebrow}>● &nbsp; A LITTLE LESS WORK, A LITTLE MORE CARE</p>
            <h1 id="hero-title">기록은 간결하게,<br />학생에게는 <em>더 가까이.</em></h1>
            <p className={styles.intro}>오늘의 수업부터 학생 한 명 한 명의 변화까지.<br />선생님의 하루를 함께하는 코스매스 워크스페이스.</p>
            <div className={styles.actions}><Link href="/report" className={styles.primary}>보고서 작성하기 <ArrowRight size={18} aria-hidden="true" /></Link><a href="#workspace">기능 둘러보기 ↓</a></div>
            <p className={styles.note}><Check size={14} aria-hidden="true" /> 수업 기록부터 이미지 저장까지, 한곳에서</p>
          </div>
          <div className={styles.visual}>
            <div className={styles.paper}>
              <div className={styles.paperTop}><Image src={logo} alt="COSMATH MATH ACADEMY" className={styles.previewLogo} /><span>미리보기 · 예시</span></div>
              <div className={styles.paperTitle}><div><p>작은 기록이 만드는 큰 성장</p><h2>오늘의 학습 리포트</h2></div><BookOpen size={28} strokeWidth={1.4} aria-hidden="true" /></div>
              <div className={styles.student}><span>김</span><div><strong>김코스 학생</strong><small>중등 2학년 · 수학</small></div><small>출석 완료</small></div>
              <div className={styles.row}><small>수업 진도</small><strong>일차함수와 그래프</strong><p>개념을 이해하고 다양한 문제에 적용했어요.</p></div>
              <div className={styles.row}><small>오늘의 과제</small><strong>유형별 문제 풀이 및 오답 정리</strong><div className={styles.bars}><i /><i /><i /><i /><i /></div></div>
              <div className={styles.memo}><small>TEACHER’S NOTE</small><p>스스로 풀이 과정을 설명하는 힘이<br />조금씩 자라고 있어요.</p></div>
              <div className={styles.paperBottom}><span>매일의 배움이 쌓이는 곳</span><b>cosmath.</b></div>
            </div>
            <div className={styles.floating}><Layers3 size={23} aria-hidden="true" /><div><strong>함께 쓰고, 세심하게 더하고</strong><p>일괄 작성과 학생별 맞춤 편집</p></div></div>
          </div>
        </section>
        <section id="workspace" className={styles.workspace} aria-labelledby="workspace-title">
          <div className={styles.heading}><div><p className={styles.eyebrow}>YOUR WORKSPACE</p><h2 id="workspace-title">오늘은 어떤 일을 시작할까요?</h2></div><p>수업에 필요한 도구를 하나씩, 한곳에.</p></div>
          <div className={styles.cards}>
            <Link href="/report" className={styles.card}><div className={styles.cardTop}><span className={styles.icon}><FileText size={25} aria-hidden="true" /></span><span className={styles.badge}>사용 가능</span></div><h3>수업 보고서</h3><p>수업 진도, 과제, 전달사항을 기록하고<br />학생별 보고서를 간편하게 완성하세요.</p><div className={styles.tags}><span>학생별 기록</span><span>일괄 편집</span><span>이미지 저장</span></div><div className={styles.cardBottom}>보고서 작성 시작하기 <ArrowUpRight size={22} aria-hidden="true" /></div></Link>
            <div className={styles.future}><Plus size={28} strokeWidth={1.4} aria-hidden="true" /><small>COMING NEXT</small><h3>더 넓어질 코스매스</h3><p>선생님에게 필요한 다음 기능이<br />이곳에 하나씩 더해질 예정이에요.</p><span>새로운 기능을 위한 공간</span></div>
          </div>
        </section>
        <section id="guide" className={styles.guide} aria-labelledby="guide-title"><div className={styles.heading}><div><p className={styles.eyebrow}>SIMPLE STEPS</p><h2 id="guide-title">수업의 마무리, 세 단계면 충분해요.</h2></div><Link href="/report">지금 시작하기 →</Link></div><div className={styles.steps}>{steps.map(([number, title, text]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
      </main>
      <footer className={styles.footer}><Link href="/" aria-label="COSMATH 홈"><Image src={logo} alt="COSMATH MATH ACADEMY" className={styles.footerLogo} /><span>선생님의 기록, 학생의 성장.</span></Link><span>하루의 배움을 오래 남기다.</span></footer>
    </div>
  );
}
