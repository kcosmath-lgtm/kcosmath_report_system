import Link from "next/link";
import { ArrowUpRight, BookOpen, ClipboardPenLine, FileText, ScanText, UserRoundCog } from "lucide-react";
import LandingAuthNav from "../components/LandingAuthNav";
import CosmicHeroCanvas from "../components/CosmicHeroCanvas";
import StickyOrbitShowcase from "../components/StickyOrbitShowcase";
import styles from "./landing.module.css";

function LogoMark() {
  return (
    <svg className={styles.logoMark} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="13" y="7" width="19" height="23" rx="5" transform="rotate(8 13 7)" fill="#FF6B8B" />
      <rect x="7" y="10" width="19" height="23" rx="5" fill="#FFFFFF" />
      <circle cx="16.5" cy="21.5" r="3.5" fill="#0C1029" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>본문으로 이동</a>

      <main id="main">
        {/* 1. Full-Viewport Deep Navy Cosmic Hero (100vh) */}
        <section className={styles.heroStage} aria-labelledby="hero-title">
          <CosmicHeroCanvas />

          <header className={styles.header}>
            <Link href="/" className={styles.brand} aria-label="유니데스크 홈으로 이동">
              <LogoMark />
              <span>유니데스크</span>
            </Link>
            <div className={styles.authArea}>
              <LandingAuthNav />
            </div>
          </header>

          <div className={styles.heroCenter}>
            <h1 id="hero-title">
              <span>교실의 모든 우주를</span>
              <strong>하나의 데스크에</strong>
            </h1>
          </div>

          <div aria-hidden="true" />
        </section>

        {/* 2. Sticky Scroll-Pinned Orbital Planet Feature Showcase */}
        <StickyOrbitShowcase />

        {/* 3. Command Deck / Direct System Launchpad */}
        <section id="workspace" className={styles.commandSection} aria-labelledby="command-title">
          <div className={styles.commandInner}>
            <div className={styles.commandHeader}>
              <div>
                <p className={styles.eyebrow}>COMMAND DECK</p>
                <h2 id="command-title">오늘 가동할 스테이션을 선택하세요</h2>
              </div>
              <p className={styles.commandSub}>모든 모듈은 로컬과 클라우드 궤도에서 즉시 동기화됩니다.</p>
            </div>

            <div className={styles.cardsGrid}>
              <Link href="/report/new" className={`${styles.card} ${styles.cardGlowPink}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconPink}`}>
                    <FileText size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeNew}>NEW · 3장 구성</span>
                </div>
                <h3>학습 성장 보고서 빌더</h3>
                <p>출결·숙제·오답과 교재 진도를 모아 7종 테마의 성장 리포트로 송출합니다.</p>
                <div className={styles.cardFooter}>
                  <span>성장 보고서 만들기</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>

              <Link href="/students" className={`${styles.card} ${styles.cardGlowGreen}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconGreen}`}>
                    <UserRoundCog size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeCore}>CORE</span>
                </div>
                <h3>학생 · 출결 · 진도 시스템</h3>
                <p>반별 명단과 일일 출결·숙제·오답·성적, 27개 과정 단원 진도를 통합 관리합니다.</p>
                <div className={styles.cardFooter}>
                  <span>학생 관리 스테이션 열기</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>

              <Link href="/typing" className={`${styles.card} ${styles.cardGlowBlue}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconBlue}`}>
                    <ScanText size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeNew}>AI ENGINE</span>
                </div>
                <h3>시험지 타이핑 스튜디오</h3>
                <p>스캔 시험지의 수식과 문항을 추출해 한글(HWPX)·Word·PDF로 즉시 변환합니다.</p>
                <div className={styles.cardFooter}>
                  <span>타이핑 스튜디오 진입</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>

              <Link href="/report" className={`${styles.card} ${styles.cardGlowYellow}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconYellow}`}>
                    <FileText size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeCore}>DAILY</span>
                </div>
                <h3>일일 수업 보고서</h3>
                <p>오늘의 수업 진도와 과제, 학생별 전달사항을 기록하고 이미지로 내려받습니다.</p>
                <div className={styles.cardFooter}>
                  <span>일일 보고서 작성</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>

              <Link href="/question-bank" className={`${styles.card} ${styles.cardGlowBlue}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconBlue}`}>
                    <BookOpen size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeCore}>ARCHIVE</span>
                </div>
                <h3>모의고사 문제은행</h3>
                <p>고1·고2·고3 연도별 수학 모의고사 기출 문제지와 해설 아카이브를 탐색합니다.</p>
                <div className={styles.cardFooter}>
                  <span>기출 아카이브 탐색</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>

              <Link href="/handoffs" className={`${styles.card} ${styles.cardGlowPink}`}>
                <div className={styles.cardTop}>
                  <span className={`${styles.cardIcon} ${styles.iconPink}`}>
                    <ClipboardPenLine size={24} aria-hidden="true" />
                  </span>
                  <span className={styles.badgeCore}>LOG</span>
                </div>
                <h3>일일 메모 · 인수인계</h3>
                <p>날짜별 수업 특이사항과 꼭 챙겨야 할 학생 전달사항 로그를 남깁니다.</p>
                <div className={styles.cardFooter}>
                  <span>인수인계 보드 열기</span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerBrand} aria-label="유니데스크 홈으로 이동">
            <LogoMark />
            <strong>유니데스크</strong>
            <span>학원을 위한 올인원 우주 워크스페이스</span>
          </Link>
          <span className={styles.copyright}>교실의 모든 우주를 하나의 데스크에.</span>
        </div>
      </footer>
    </div>
  );
}
