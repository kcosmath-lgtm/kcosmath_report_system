"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchAiQuotaStatus, type AiQuotaSnapshot } from "../../lib/ai-quota-client";
import { sendAiCopilotMessage } from "../../lib/ai-copilot";
import styles from "./GlobalAiAssistant.module.css";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  applied?: string[];
}

function AnimatedPlanetGifIcon({ busy, small = false }: { busy: boolean; small?: boolean }) {
  return (
    <div className={`${styles.orbVisual} ${small ? styles.orbVisualSmall : ""} ${busy ? styles.orbBusy : ""}`} aria-hidden="true">
      <svg className={styles.orbSvg} viewBox="0 0 68 68" fill="none">
        <defs>
          <clipPath id="planetBodyClip">
            <circle cx="34" cy="34" r="18" />
          </clipPath>
        </defs>

        {/* Back Half of Saturn Ring */}
        <g className={styles.planetRingGroup}>
          <path
            d="M 6 34 A 28 9.5 0 0 1 62 34"
            stroke="#FACC15"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M 9 34 A 25 7.5 0 0 1 59 34"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
        </g>

        {/* Orbiting Moon 2 (Background Orbit) */}
        <g className={styles.orbitingMoon2}>
          <circle cx="58" cy="18" r="3" fill="#4ADE80" />
        </g>

        {/* Planet Sphere Base */}
        <circle cx="34" cy="34" r="18" fill="#38BDF8" />

        {/* Planet Surface Clouds & Crescent Shading */}
        <g clipPath="url(#planetBodyClip)">
          <circle cx="40" cy="40" r="17.5" fill="#0284C7" />
          <g className={styles.surfaceDrift}>
            <rect x="14" y="24" width="26" height="4.5" rx="2.25" fill="#BAE6FD" fillOpacity="0.75" />
            <rect x="26" y="32" width="24" height="4" rx="2" fill="#E0F2FE" fillOpacity="0.65" />
            <circle cx="26" cy="24" r="3.5" fill="#FFFFFF" fillOpacity="0.8" />
          </g>
        </g>

        {/* Planet Rim Outline for crisp contrast on white or dark backgrounds */}
        <circle cx="34" cy="34" r="18" stroke="#0C1029" strokeWidth="2.2" />

        {/* Front Half of Saturn Ring */}
        <g className={styles.planetRingGroup}>
          <path
            d="M 62 34 A 28 9.5 0 0 1 6 34"
            stroke="#FF6B8B"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M 59 34 A 25 7.5 0 0 1 9 34"
            stroke="#FACC15"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>

        {/* Orbiting Moon 1 (Foreground Orbit) */}
        <g className={styles.orbitingMoon1}>
          <circle cx="11" cy="20" r="3.6" fill="#FF6B8B" stroke="#0C1029" strokeWidth="1.4" />
        </g>
      </svg>
    </div>
  );
}

const QUICK_PROMPTS_BY_PATH: Record<string, string[]> = {
  "/students": [
    "오늘 전원 출석, 숙제 O로 일괄 체크해줘",
    "김민준 오늘 단원평가 95점 기록해줘",
    "고1 심화반 새로 만들어줘",
  ],
  "/typing": [
    "삼차함수와 접선 그래프가 포함된 4점 문제 만들어줘",
    "고2 등차수열의 합 쌍둥이 문제 출제해줘",
  ],
  "/question-bank": [
    "삼차함수와 접선 그래프가 포함된 4점 문제 만들어줘",
    "고2 수열 등차수열의 합 쌍둥이 문제 출제해줘",
    "원가 직선이 접하는 기하 도형 문제 만들어줘",
  ],
  "/report/new": [
    "성적 그래프와 오답 분석이 강조된 우주 테마 템플릿 짜줘",
    "가로형 2단 구성으로 출결·진도 중심 템플릿 만들어줘",
  ],
  "/handoffs": [
    "내일 조교 선생님께 오답 미완료 학생 재시험 인수인계 등록해줘",
  ],
};

export default function GlobalAiAssistant() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [quota, setQuota] = useState<AiQuotaSnapshot>({
    allowed: true,
    academyName: "우리 학원",
    dailyPct: 0,
    weeklyPct: 0,
    monthlyPct: 0,
    dailyRemainingPct: 100,
    weeklyRemainingPct: 100,
    monthlyRemainingPct: 100,
    isBlocked: false,
    canManage: false,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ai",
      text: "안녕하세요! 유니데스크 통합 AI 코파일럿입니다. 출결·성적·진도 기록부터 그래프·도형 작도 문항 출제, 시험지 편집, 보고서 템플릿 설계까지 무엇이든 말씀해 주세요.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetchAiQuotaStatus().then(snap => {
      if (active) setQuota(snap);
    });
    const onQuotaUpdate = (e: Event) => {
      const detail = (e as CustomEvent<AiQuotaSnapshot | undefined>).detail;
      if (detail) setQuota(detail);
      else void fetchAiQuotaStatus().then(snap => { if (active) setQuota(snap); });
    };
    window.addEventListener("cosmath-ai-quota-updated", onQuotaUpdate);
    return () => {
      active = false;
      window.removeEventListener("cosmath-ai-quota-updated", onQuotaUpdate);
    };
  }, []);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const quickPrompts =
    QUICK_PROMPTS_BY_PATH[pathname] ?? [
      "오늘 전원 출석·숙제 O로 기록해줘",
      "삼차함수 극값 그래프 포함 4점 문제 만들어줘",
      "내일 수업 인수인계 메모 등록해줘",
    ];

  async function submitPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setBusy(true);

    try {
      const mode =
        pathname.startsWith("/question-bank")
          ? "problem_studio"
          : pathname.startsWith("/typing")
            ? "typing"
            : pathname.startsWith("/report/new")
              ? "report_template"
              : "general";

      const result = await sendAiCopilotMessage({
        prompt: trimmed,
        mode,
        pathname,
      });
      if (result.quota) setQuota(result.quota);
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: result.reply,
          applied: result.appliedSummary,
        },
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (pathname.startsWith("/ai-studio")) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      {open && (
        <section className={styles.panel} aria-label="유니데스크 AI 코파일럿">
          <header className={styles.panelHeader}>
            <div className={styles.headerTop}>
              <div className={styles.headerBrand}>
                <AnimatedPlanetGifIcon busy={busy} small />
                <div>
                  <h3>UNIDESK AI 코파일럿</h3>
                  <small>모든 워크스페이스 편집 · 실시간 연동</small>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="유니데스크 AI 코파일럿 닫기"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.quotaGrid} aria-label="학원 AI 사용률">
              {[
                { label: "오늘", pct: quota.dailyPct, color: "#38bdf8" },
                { label: "주간", pct: quota.weeklyPct, color: "#4ade80" },
                { label: "월간", pct: quota.monthlyPct, color: "#facc15" },
              ].map(item => (
                <div key={item.label} className={styles.quotaItem}>
                  <div className={styles.quotaItemTop}>
                    <span>{item.label}</span>
                    <strong>{item.pct.toFixed(1)}%</strong>
                  </div>
                  <div className={styles.quotaBar}>
                    <div
                      className={styles.quotaFill}
                      style={{
                        width: `${Math.min(100, Math.max(0, item.pct))}%`,
                        background: item.pct >= 90 ? "#ff6b8b" : item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </header>

          <div className={styles.quickRow}>
            {quickPrompts.map(q => (
              <button
                key={q}
                type="button"
                className={styles.quickChip}
                disabled={busy}
                onClick={() => void submitPrompt(q)}
              >
                ✦ {q}
              </button>
            ))}
          </div>

          <div className={styles.messages} ref={scrollRef}>
            {messages.map(m => (
              <div key={m.id} className={m.role === "user" ? styles.msgUser : styles.msgAi}>
                <div>{m.text}</div>
                {m.applied && m.applied.length > 0 && (
                  <ul className={styles.appliedList}>
                    {m.applied.map((item, idx) => (
                      <li key={idx}>✓ {item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <div className={styles.msgAi}>우주 궤도에서 작업을 실행하고 있습니다...</div>}
          </div>

          <form
            className={styles.inputArea}
            onSubmit={e => {
              e.preventDefault();
              void submitPrompt(input);
            }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="출결·성적 기록, 문제 출제, 템플릿 변경을 지시하세요..."
              aria-label="AI 코파일럿 명령 입력"
              disabled={busy}
            />
            <button type="submit" className={styles.sendBtn} disabled={busy || !input.trim()}>
              전송
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={styles.orbButton}
        aria-label="유니데스크 AI 코파일럿 열기"
        title={`AI 코파일럿 (오늘 ${quota.dailyPct.toFixed(0)}% 사용)`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <AnimatedPlanetGifIcon busy={busy} />
      </button>
    </div>
  );
}
