"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "../app/landing.module.css";

interface OrbitPlanet {
  id: number;
  code: string;
  name: string;
  tag: string;
  title: string;
  description: string;
  metrics: string[];
  href: string;
  cta: string;
  color: string;
  subColor: string;
  accentColor: string;
  orbitRadius: number;
}

const PLANETS: OrbitPlanet[] = [
  {
    id: 0,
    code: "ORBIT 01",
    name: "GRAVITY CORE",
    tag: "출결 · 숙제 · 오답 · 성적 통합 행성",
    title: "흩어진 학원 일상을\n하나의 중력으로 묶다",
    description:
      "매일 반복되는 출결, 숙제(O·△·X), 오답 완료 여부, 시험 성적을 첫 번째 궤도에 기록합니다. 채점 엑셀 파일도 즉시 흡수해 반별·학생별 데이터 행성을 체계적으로 구축합니다.",
    metrics: ["일괄 출결·숙제 체크", "오답 완료율 자동 집계", "배정문제지 엑셀(.xls) 연동"],
    href: "/students",
    cta: "학생·일일 코어 진입하기",
    color: "#FF6B8B",
    subColor: "#FFE4EC",
    accentColor: "#FACC15",
    orbitRadius: 620,
  },
  {
    id: 1,
    code: "ORBIT 02",
    name: "CURRICULUM NAV",
    tag: "27개 수학 과정 · 교재 진도 행성",
    title: "초·중·고 모든 수학 단원의\n정밀한 항로를 설계하다",
    description:
      "두 번째 궤도에서는 2022·2015 개정 교육과정 27개 수학 단원 목차와 반별 공용 교재를 연결합니다. 학생마다 지금 어느 단원을 통과하고 있는지 실시간 진행률로 추적합니다.",
    metrics: ["27종 수학 과정 프리셋", "반별 공용 교재 카탈로그", "단원별 진행률 스냅샷"],
    href: "/students",
    cta: "교재·진도 항로 열기",
    color: "#4ADE80",
    subColor: "#DCFCE7",
    accentColor: "#38BDF8",
    orbitRadius: 790,
  },
  {
    id: 2,
    code: "ORBIT 03",
    name: "TYPING ENGINE",
    tag: "AI 수식 추출 · HWPX / Word 변환 행성",
    title: "복잡한 수식과 시험지를\n즉시 재조립하는 엔진",
    description:
      "세 번째 궤도가 열리면 스캔된 시험지 PDF와 이미지에서 AI가 문항·수식·표·그림을 분리합니다. 실시간 수식 편집을 거쳐 한글(HWPX)·Word·PDF 시험지로 즉시 출력합니다.",
    metrics: ["LaTeX 실시간 수식 조판", "한컴 HWPX · Word 네이티브 수식", "여백이 넉넉한 A4 2단 자동 배치"],
    href: "/typing",
    cta: "타이핑 엔진 가동하기",
    color: "#38BDF8",
    subColor: "#E0F2FE",
    accentColor: "#FF6B8B",
    orbitRadius: 960,
  },
  {
    id: 3,
    code: "ORBIT 04",
    name: "GROWTH SIGNAL",
    tag: "3장 구성 테마형 학습 성장 리포트 행성",
    title: "축적된 수업 데이터가\n학부모에게 닿는 빛나는 신호",
    description:
      "마지막 네 번째 궤도에서는 출결·숙제·오답률·성적 추이 차트와 교재별 진도가 7가지 테마의 3장짜리 성장 보고서로 완성됩니다. 선생님의 피드백을 더해 신뢰를 전송하세요.",
    metrics: ["7종 맞춤형 디자인 테마", "100점 환산 성적 추이 차트", "전교생 고해상도 PNG · ZIP 출력"],
    href: "/report/new",
    cta: "성장 리포트 송출하기",
    color: "#FACC15",
    subColor: "#FEF9C3",
    accentColor: "#4ADE80",
    orbitRadius: 1130,
  },
];

export default function StickyOrbitShowcase() {
  const trackRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetStageRef = useRef(0);
  const smoothStageRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const updateScroll = () => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const rawProgress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const nextTarget = rawProgress * (PLANETS.length - 1);
      targetStageRef.current = nextTarget;
      const rounded = Math.min(PLANETS.length - 1, Math.max(0, Math.round(nextTarget)));
      setActiveIndex((prev) => (prev === rounded ? prev : rounded));
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll);
    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let w = 1280;
    let h = 800;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const bgStars = Array.from({ length: 48 }, (_, i) => ({
      x: ((i * 67 + 13) % 100) / 100,
      y: ((i * 43 + 29) % 100) / 100,
      r: 1.2 + (i % 3) * 0.7,
      phase: i * 0.9,
    }));

    const render = (time: number) => {
      const t = time * 0.001;
      smoothStageRef.current += (targetStageRef.current - smoothStageRef.current) * 0.075;
      const stage = smoothStageRef.current;

      ctx.clearRect(0, 0, w, h);

      // Subtle animated twinkling stars
      for (const st of bgStars) {
        const alpha = 0.18 + 0.25 * Math.sin(t * 1.4 + st.phase);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Anchor the active planet squarely at x = 31% of viewport width
      const scaleFactor = Math.max(0.5, Math.min(w, h) / 720);
      const activeOrbitRadius = (620 + stage * 170) * scaleFactor;
      const spotlightX = w * 0.31;
      const originX = spotlightX - activeOrbitRadius;
      const originY = h * 0.5 + Math.sin(t * 0.6) * 5;

      // Draw each Orbit Arc & Giant Animated Planet
      PLANETS.forEach((planet, idx) => {
        const distFromStage = stage - idx;
        const unlockProgress = Math.min(1, Math.max(0, 1 - (idx - stage) * 1.05));
        if (unlockProgress <= 0.02) return;

        const orbitR = Math.max(10, planet.orbitRadius * scaleFactor);
        const focusCloseness = Math.max(0, 1 - Math.abs(distFromStage));

        // 1. Draw Unbroken Full 360° Orbit Circle
        ctx.save();
        ctx.globalAlpha = unlockProgress * (0.24 + focusCloseness * 0.64);
        ctx.strokeStyle = focusCloseness > 0.45 ? planet.color : "rgba(255, 255, 255, 0.22)";
        ctx.lineWidth = 1.8 + focusCloseness * 2.4;
        if (focusCloseness < 0.45) {
          ctx.setLineDash([8, 10]);
        }
        ctx.beginPath();
        ctx.arc(originX, originY, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated orbital energy pulse travelling along the active orbit arc
        if (focusCloseness > 0.2) {
          const pulseAngle = ((t * 0.28) % 1) * Math.PI * 0.7 - Math.PI * 0.35;
          const ox = originX + Math.cos(pulseAngle) * orbitR;
          const oy = originY + Math.sin(pulseAngle) * orbitR;
          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(ox, oy, 5 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 2. Compute Planet Position along the sweeping arc
        const sweepAngle = -distFromStage * 0.38 + Math.sin(t * 0.85 + idx) * 0.012;
        const px = originX + Math.cos(sweepAngle) * orbitR;
        const py = originY + Math.sin(sweepAngle) * orbitR;

        const baseR = Math.max(4, (46 + focusCloseness * 64) * scaleFactor * unlockProgress);

        ctx.save();
        ctx.translate(px, py);
        ctx.globalAlpha = unlockProgress;

        // Outer Expanding Radar / Gravity Waves on Active Planet
        if (focusCloseness > 0.15) {
          for (let wIdx = 0; wIdx < 2; wIdx++) {
            const wavePhase = (t * 0.5 + wIdx * 0.5) % 1;
            const waveR = baseR * (1.15 + wavePhase * 0.85);
            ctx.strokeStyle = planet.color;
            ctx.globalAlpha = (1 - wavePhase) * focusCloseness * 0.42;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, waveR, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = unlockProgress;
        }

        // Render Distinct Cinematic Planet per Index
        if (idx === 0) {
          // PLANET 1: Coral Ringed Planet + 3D Orbiting Moon
          const ringTilt = -0.36 + Math.sin(t * 0.7) * 0.05;
          const moonAngle = t * 1.35;
          const moonX = Math.cos(moonAngle) * baseR * 1.68;
          const moonY = Math.sin(moonAngle) * baseR * 0.55;
          const moonBehind = Math.sin(moonAngle) < 0;

          if (moonBehind) {
            ctx.fillStyle = planet.accentColor;
            ctx.beginPath();
            ctx.arc(moonX, moonY, baseR * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.save();
          ctx.rotate(ringTilt);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = Math.max(4, baseR * 0.13);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.72, baseR * 0.48, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = planet.accentColor;
          ctx.lineWidth = Math.max(2, baseR * 0.05);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.95, baseR * 0.56, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.clip();
          const bandShift = Math.sin(t * 0.8) * baseR * 0.22;
          ctx.fillStyle = "#E11D48";
          ctx.beginPath();
          ctx.arc(baseR * 0.35, baseR * 0.35, baseR * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = planet.subColor;
          ctx.beginPath();
          ctx.arc(-baseR * 0.32 + bandShift, -baseR * 0.26, baseR * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(baseR * 0.18 + bandShift, baseR * 0.22, baseR * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.rotate(ringTilt);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = Math.max(4, baseR * 0.13);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.72, baseR * 0.48, 0, 0, Math.PI);
          ctx.stroke();
          ctx.strokeStyle = planet.accentColor;
          ctx.lineWidth = Math.max(2, baseR * 0.05);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.95, baseR * 0.56, 0, 0, Math.PI);
          ctx.stroke();
          ctx.restore();

          if (!moonBehind) {
            ctx.fillStyle = planet.accentColor;
            ctx.beginPath();
            ctx.arc(moonX, moonY, baseR * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (idx === 1) {
          // PLANET 2: Mint Navigation Planet with Angled Orbit Ring & Twin Satellites (Clean circle arcs, no rect glitch)
          const ringTilt = 0.32 + Math.cos(t * 0.65) * 0.05;

          // Back half of tilted ring
          ctx.save();
          ctx.rotate(ringTilt);
          ctx.strokeStyle = planet.accentColor;
          ctx.lineWidth = Math.max(3.5, baseR * 0.11);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.65, baseR * 0.46, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Planet Body
          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.fill();

          // Smooth Spherical Crescent Shading + Surface Spots
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.clip();
          const drift = Math.cos(t * 0.85) * baseR * 0.2;
          ctx.fillStyle = "#16A34A";
          ctx.beginPath();
          ctx.arc(baseR * 0.35, baseR * 0.35, baseR * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = planet.subColor;
          ctx.beginPath();
          ctx.arc(-baseR * 0.28 + drift, -baseR * 0.24, baseR * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(baseR * 0.22 - drift, baseR * 0.18, baseR * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Front half of tilted ring
          ctx.save();
          ctx.rotate(ringTilt);
          ctx.strokeStyle = planet.accentColor;
          ctx.lineWidth = Math.max(3.5, baseR * 0.11);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseR * 1.65, baseR * 0.46, 0, 0, Math.PI);
          ctx.stroke();
          ctx.restore();

          // Twin Orbiting Moons
          for (let m = 0; m < 2; m++) {
            const ma = t * 1.1 + m * Math.PI;
            const mx = Math.cos(ma) * baseR * 1.48;
            const my = Math.sin(ma) * baseR * 1.48;
            ctx.fillStyle = m === 0 ? "#FACC15" : "#38BDF8";
            ctx.beginPath();
            ctx.arc(mx, my, baseR * 0.16, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (idx === 2) {
          // PLANET 3: Sky-Blue Gyroscope / AI Engine Planet
          for (const dir of [-1, 1]) {
            ctx.save();
            ctx.rotate(dir * 0.48 + Math.sin(t * 0.8) * 0.08 * dir);
            ctx.strokeStyle = dir === 1 ? "#FACC15" : "#FF6B8B";
            ctx.lineWidth = Math.max(3, baseR * 0.08);
            ctx.beginPath();
            ctx.ellipse(0, 0, baseR * 1.62, baseR * 0.52, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(0, 0, baseR * 0.92, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.rotate(-t * 0.6);
          ctx.fillStyle = "#0C1029";
          const sq = baseR * 0.68;
          ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
          ctx.restore();

          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(2, baseR * 0.2 + Math.sin(t * 3) * 2), 0, Math.PI * 2);
          ctx.fill();
        } else if (idx === 3) {
          // PLANET 4: Golden Radiant Star Planet
          ctx.save();
          ctx.rotate(t * 0.28);
          const rays = 12;
          ctx.fillStyle = "#FDE047";
          for (let rIdx = 0; rIdx < rays; rIdx++) {
            const angle = (rIdx * Math.PI * 2) / rays;
            const rx = Math.cos(angle) * baseR * 1.22;
            const ry = Math.sin(angle) * baseR * 1.22;
            ctx.beginPath();
            ctx.arc(rx, ry, baseR * 0.1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(-baseR * 0.28, -baseR * 0.28, baseR * 0.22, 0, Math.PI * 2);
          ctx.fill();

          for (let m = 0; m < 3; m++) {
            const ma = -t * 1.25 + (m * Math.PI * 2) / 3;
            const mx = Math.cos(ma) * baseR * 1.65;
            const my = Math.sin(ma) * baseR * 1.65;
            ctx.fillStyle = m === 0 ? "#FF6B8B" : m === 1 ? "#4ADE80" : "#38BDF8";
            ctx.beginPath();
            ctx.arc(mx, my, baseR * 0.16, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      });

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const activePlanet = PLANETS[activeIndex];

  return (
    <section
      id="cosmos-voyage"
      ref={trackRef}
      className={styles.orbitScrollTrack}
      aria-label="유니데스크 행성 궤도 기능 소개"
    >
      <div className={styles.orbitStickyStage}>
        {/* Full-bleed 60fps Animated Planetary Orbit Canvas */}
        <canvas ref={canvasRef} className={styles.orbitCanvas} aria-hidden="true" />

        {/* Main 2-Column Sticky Content: Left = Giant Planet Viewport Space, Right = Frameless Floating Typography */}
        <div className={styles.orbitMainGrid}>
          <div className={styles.solarMapWrap} aria-hidden="true" />

          <div className={styles.planetConsoleWrap}>
            <article className={styles.stationCard}>
              <div className={styles.stationMeta}>
                <span
                  className={styles.orbitCode}
                  style={{ backgroundColor: activePlanet.color, color: "#0C1029" }}
                >
                  {activePlanet.code} · {activePlanet.name}
                </span>
                <span className={styles.stationTag} style={{ color: activePlanet.color }}>
                  {activePlanet.tag}
                </span>
              </div>

              <h3>{activePlanet.title}</h3>
              <p>{activePlanet.description}</p>

              <ul className={styles.metricChips}>
                {activePlanet.metrics.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>

              <div className={styles.consoleFooter}>
                <Link
                  href={activePlanet.href}
                  className={styles.stationLink}
                  style={{ color: activePlanet.color }}
                >
                  <span>{activePlanet.cta}</span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </Link>

                <span className={styles.orbitCounter}>
                  0{activeIndex + 1} / 0{PLANETS.length}
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
