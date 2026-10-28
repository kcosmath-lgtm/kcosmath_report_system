import Link from "next/link";
import { ArrowUpRight, BookOpen, ClipboardPenLine, FileText, ScanText, UserRoundCog } from "lucide-react";
import LandingAuthNav from "../components/LandingAuthNav";
import CosmicHeroCanvas from "../components/CosmicHeroCanvas";
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

const orbitalStations = [
  {
    orbit: "ORBIT 01 · GRAVITY CORE",
    tag: "출결 · 숙제 · 오답 · 성적 통합 코어",
    title: "흩어진 학원 일상을\n하나의 중력으로 묶다",
    description:
      "매일 반복되는 출결, 숙제(O·△·X), 오답 완료 여부, 시험 성적을 단일 궤도에 기록합니다. 채점 엑셀 파일도 즉시 흡수해 반별·학생별 데이터 행성을 체계적으로 구축합니다.",
    metrics: ["일괄 출결·숙제 체크", "오답 완료율 자동 집계", "배정문제지 엑셀(.xls) 연동"],
    href: "/students",
    cta: "학생·일일 코어 진입하기",
    colorClass: styles.planetPink,
    planetSvg: (
      <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
        <ellipse cx="110" cy="110" rx="94" ry="34" transform="rotate(-22 110 110)" stroke="#FF6B8B" strokeWidth="4" strokeDasharray="8 8" opacity="0.55" />
        <circle cx="110" cy="110" r="56" fill="#FF6B8B" />
        <circle cx="92" cy="94" r="10" fill="#FFE4EC" opacity="0.7" />
        <circle cx="128" cy="124" r="6" fill="#FFE4EC" opacity="0.7" />
        <path d="M24 144C42 162 84 159 128 141C172 123 202 94 196 72" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <circle cx="44" cy="64" r="10" fill="#FACC15" />
      </svg>
    ),
  },
  {
    orbit: "ORBIT 02 · CURRICULUM NAVIGATION",
    tag: "27개 수학 과정 · 교재 진도 항로",
    title: "초·중·고 모든 수학 단원의\n정밀한 항로를 설계하다",
    description:
      "2022·2015 개정 교육과정 27개 수학 단원 목차와 반별 공용 교재를 연결합니다. 학생마다 지금 어느 단원 우주를 통과하고 있는지 미시작·진행중·완료 상태와 누적 진행률로 한눈에 추적합니다.",
    metrics: ["27종 수학 과정 프리셋", "반별 공용 교재 카탈로그", "단원별 진행률 스냅샷"],
    href: "/students",
    cta: "교재·진도 항로 열기",
    colorClass: styles.planetGreen,
    planetSvg: (
      <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
        <circle cx="110" cy="110" r="84" stroke="#4ADE80" strokeWidth="3" strokeDasharray="6 10" opacity="0.5" />
        <path d="M110 46L168 148H52L110 46Z" fill="#4ADE80" stroke="#4ADE80" strokeWidth="16" strokeLinejoin="round" />
        <circle cx="110" cy="116" r="14" fill="#0C1029" />
        <circle cx="174" cy="66" r="12" fill="#38BDF8" />
        <circle cx="48" cy="154" r="9" fill="#FACC15" />
      </svg>
    ),
  },
  {
    orbit: "ORBIT 03 · TYPING ENGINE",
    tag: "AI 수식 추출 · HWPX / Word 변환 스테이션",
    title: "복잡한 수식과 시험지를\n즉시 재조립하는 엔진",
    description:
      "스캔된 시험지 PDF나 이미지를 올리면 AI가 문제 본문, 수식, 보기, 표, 그림 영역을 정교하게 분리합니다. 실시간 수식 편집과 지우개 도구를 거쳐 한글(HWPX)·Word·PDF 시험지로 즉시 출력합니다.",
    metrics: ["LaTeX 실시간 수식 조판", "한컴 HWPX · Word 네이티브 수식", "여백이 넉넉한 A4 2단 자동 배치"],
    href: "/typing",
    cta: "타이핑 엔진 가동하기",
    colorClass: styles.planetBlue,
    planetSvg: (
      <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
        <ellipse cx="110" cy="110" rx="92" ry="38" transform="rotate(25 110 110)" stroke="#38BDF8" strokeWidth="4" opacity="0.5" />
        <rect x="62" y="62" width="96" height="96" rx="22" transform="rotate(12 110 110)" fill="#38BDF8" />
        <rect x="82" y="82" width="56" height="56" rx="12" transform="rotate(12 110 110)" fill="#0C1029" />
        <circle cx="110" cy="110" r="11" fill="#FFFFFF" />
        <circle cx="176" cy="142" r="11" fill="#FF6B8B" />
      </svg>
    ),
  },
  {
    orbit: "ORBIT 04 · GROWTH TRANSMISSION",
    tag: "3장 구성 테마형 학습 성장 리포트",
    title: "축적된 수업 데이터가\n학부모에게 닿는 빛나는 신호",
    description:
      "궤도에 쌓인 출결·숙제·오답 수정률·성적 추이 차트와 교재별 진도가 7가지 테마의 3장짜리 성장 보고서로 자동 조립됩니다. 선생님의 세심한 피드백을 더해 가장 신뢰감 있는 리포트를 발송하세요.",
    metrics: ["7종 맞춤형 디자인 테마", "100점 환산 성적 추이 차트", "전교생 고해상도 PNG · ZIP 출력"],
    href: "/report/new",
    cta: "성장 리포트 송출하기",
    colorClass: styles.planetYellow,
    planetSvg: (
      <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
        <circle cx="110" cy="110" r="86" stroke="#FACC15" strokeWidth="3" strokeDasharray="10 8" opacity="0.55" />
        <path
          d="M110 42L129 84L175 90L141 122L150 168L110 145L70 168L79 122L45 90L91 84L110 42Z"
          fill="#FACC15"
          stroke="#FACC15"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <circle cx="110" cy="112" r="14" fill="#0C1029" />
        <circle cx="48" cy="72" r="10" fill="#4ADE80" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>본문으로 이동</a>

      <main id="main">
        {/* 1. Full-Viewport Deep Navy Cosmic Hero (100vh, no white strip, no center nav links) */}
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

          <a href="#cosmos-voyage" className={styles.scrollCue} aria-label="아래로 스크롤해 유니데스크 시스템 탐험하기">
            <span className={styles.scrollDot} />
            <small>SCROLL TO EXPLORE UNIDESK</small>
          </a>
        </section>

        {/* 2. Seamless Space Exploration & Academy System Construction */}
        <section id="cosmos-voyage" className={styles.voyageSection} aria-labelledby="voyage-title">
          <div className={styles.voyageIntro}>
            <span className={styles.systemBadge}>UNIDESK UNIVERSE</span>
            <h2 id="voyage-title">
              수업과 운영이 빈틈없이 맞물리는
              <br />
              <strong>우리 학원만의 행성계를 구축하세요</strong>
            </h2>
            <p>
              수업 준비부터 출결·진도 추적, 시험지 조판, 학부모 리포트 송출, 강사 간 인수인계까지.
              <br />
              네 개의 코어 스테이션이 하나의 데스크로 연결되어 학원의 하루를 유기적으로 움직입니다.
            </p>
          </div>

          <div className={styles.orbitTimeline}>
            <div className={styles.orbitAxis} aria-hidden="true" />

            {orbitalStations.map((station, idx) => (
              <article
                key={station.orbit}
                className={`${styles.stationRow} ${idx % 2 === 1 ? styles.stationRowReverse : ""}`}
              >
                <div className={styles.stationVisualWrap}>
                  <Link href={station.href} className={`${styles.planetOrb} ${station.colorClass}`} aria-label={station.cta}>
                    <span className={styles.planetGlow} aria-hidden="true" />
                    {station.planetSvg}
                  </Link>
                </div>

                <div className={styles.stationCard}>
                  <div className={styles.stationMeta}>
                    <span className={styles.orbitCode}>{station.orbit}</span>
                    <span className={styles.stationTag}>{station.tag}</span>
                  </div>
                  <h3>{station.title}</h3>
                  <p>{station.description}</p>
                  <ul className={styles.metricChips}>
                    {station.metrics.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <Link href={station.href} className={styles.stationLink}>
                    <span>{station.cta}</span>
                    <ArrowUpRight size={19} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

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
