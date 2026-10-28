"use client";

import { useEffect, useRef } from "react";

interface StarDot {
  x: number;
  y: number;
  z: number;
  size: number;
}

interface FloatingShape {
  id: number;
  type: "circle" | "square" | "triangle" | "star";
  anchorX: number;
  anchorY: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  angle: number;
  vAngle: number;
  scale: number;
  vScale: number;
}

export default function CosmicHeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let width = 1440;
    let height = 900;

    const mouse = {
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
    };

    const stars: StarDot[] = Array.from({ length: 56 }, (_, i) => ({
      x: ((i * 73 + 19) % 100) / 100,
      y: ((i * 41 + 37) % 100) / 100,
      z: 0.3 + (i % 5) * 0.16,
      size: 1.8 + (i % 3) * 0.9,
    }));

    const shapes: FloatingShape[] = [
      {
        id: 0,
        type: "circle",
        anchorX: 0.15,
        anchorY: 0.27,
        px: 0,
        py: 0,
        vx: 0.14,
        vy: 0.11,
        r: 102,
        color: "#FF6B8B",
        angle: 0,
        vAngle: 0.0009,
        scale: 1,
        vScale: 0,
      },
      {
        id: 1,
        type: "square",
        anchorX: 0.84,
        anchorY: 0.28,
        px: 0,
        py: 0,
        vx: -0.13,
        vy: 0.12,
        r: 98,
        color: "#38BDF8",
        angle: 0.35,
        vAngle: -0.001,
        scale: 1,
        vScale: 0,
      },
      {
        id: 2,
        type: "triangle",
        anchorX: 0.17,
        anchorY: 0.74,
        px: 0,
        py: 0,
        vx: 0.12,
        vy: -0.13,
        r: 108,
        color: "#4ADE80",
        angle: -0.25,
        vAngle: 0.0011,
        scale: 1,
        vScale: 0,
      },
      {
        id: 3,
        type: "star",
        anchorX: 0.83,
        anchorY: 0.74,
        px: 0,
        py: 0,
        vx: -0.14,
        vy: -0.1,
        r: 104,
        color: "#FACC15",
        angle: 0.15,
        vAngle: -0.0009,
        scale: 1,
        vScale: 0,
      },
    ];

    let initialized = false;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const baseRadius = Math.max(54, Math.min(116, Math.min(width, height) * 0.122));
      shapes.forEach((s) => {
        s.r = s.type === "triangle" ? baseRadius * 1.08 : baseRadius;
        if (!initialized) {
          s.px = s.anchorX * width;
          s.py = s.anchorY * height;
        } else {
          s.px = Math.min(Math.max(s.r + 16, s.px), width - s.r - 16);
          s.py = Math.min(Math.max(s.r + 96, s.py), height - s.r - 24);
        }
      });
      initialized = true;
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (ny < 0 || ny > rect.height || nx < 0 || nx > rect.width) {
        mouse.x = -9999;
        mouse.y = -9999;
        return;
      }
      mouse.vx = mouse.x === -9999 ? 0 : nx - mouse.x;
      mouse.vy = mouse.y === -9999 ? 0 : ny - mouse.y;
      mouse.x = nx;
      mouse.y = ny;
    };

    const onMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseout", onMouseLeave, { passive: true });

    const drawRoundedPolygon = (pts: { x: number; y: number }[], radius: number) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[(i - 1 + pts.length) % pts.length];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const mx1 = (p0.x + p1.x) / 2;
        const my1 = (p0.y + p1.y) / 2;
        const mx2 = (p1.x + p2.x) / 2;
        const my2 = (p1.y + p2.y) / 2;
        if (i === 0) ctx.moveTo(mx1, my1);
        ctx.arcTo(p1.x, p1.y, mx2, my2, radius);
        ctx.lineTo(mx2, my2);
      }
      ctx.closePath();
      ctx.fill();
    };

    const drawShape = (s: FloatingShape) => {
      ctx.save();
      ctx.translate(s.px, s.py);
      ctx.rotate(s.angle);
      ctx.scale(s.scale, s.scale);
      ctx.fillStyle = s.color;
      ctx.lineJoin = "round";

      if (s.type === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 0.92, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.type === "square") {
        const side = s.r * 1.62;
        ctx.beginPath();
        ctx.roundRect(-side / 2, -side / 2, side, side, Math.max(18, s.r * 0.28));
        ctx.fill();
      } else if (s.type === "triangle") {
        const R = s.r * 1.12;
        const pts = [0, 1, 2].map((k) => {
          const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
          return { x: Math.cos(a) * R, y: Math.sin(a) * R };
        });
        drawRoundedPolygon(pts, Math.max(14, s.r * 0.24));
      } else if (s.type === "star") {
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k < 10; k++) {
          const rad = k % 2 === 0 ? s.r * 1.08 : s.r * 0.5;
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
        }
        drawRoundedPolygon(pts, Math.max(8, s.r * 0.12));
      }

      ctx.restore();
    };

    const tick = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Slow parallax flat stars
      const parX = mouse.x === -9999 ? 0 : (mouse.x - width / 2) * 0.01;
      const parY = mouse.y === -9999 ? 0 : (mouse.y - height / 2) * 0.01;
      ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
      for (const st of stars) {
        const sx = (st.x * width - parX * st.z + width) % width;
        const sy = (st.y * height - parY * st.z + height) % height;
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center typography safe zone so shapes never enter the center headline
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const safeRx = Math.min(width * 0.3, 380);
      const safeRy = Math.min(height * 0.24, 185);

      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];

        // Slow, gentle zero-gravity drift
        s.vx += Math.sin(t * 0.00042 + s.id * 1.9) * 0.0036;
        s.vy += Math.cos(t * 0.00048 + s.id * 2.3) * 0.0036;

        // Soft mouse repulsion (push only)
        if (mouse.x !== -9999) {
          const dx = s.px - mouse.x;
          const dy = s.py - mouse.y;
          const dist = Math.hypot(dx, dy) || 1;
          const repelRadius = s.r + 145;
          if (dist < repelRadius) {
            const strength = (repelRadius - dist) / repelRadius;
            s.vx += (dx / dist) * strength * 0.45 + mouse.vx * 0.012 * strength;
            s.vy += (dy / dist) * strength * 0.45 + mouse.vy * 0.012 * strength;
            s.vAngle += mouse.vx * 0.0003 * strength;
          }
        }

        // Keep shapes out of the center text zone
        const cdx = s.px - centerX;
        const cdy = s.py - centerY;
        const rx = safeRx + s.r;
        const ry = safeRy + s.r;
        const normDist = Math.hypot(cdx / rx, cdy / ry) || 0.001;
        if (normDist < 1) {
          const pushAngle = Math.atan2(cdy / ry, cdx / rx);
          const targetX = centerX + Math.cos(pushAngle) * rx;
          const targetY = centerY + Math.sin(pushAngle) * ry;
          const nx = Math.cos(pushAngle);
          const ny = Math.sin(pushAngle);

          s.px = targetX;
          s.py = targetY;

          const dot = s.vx * nx + s.vy * ny;
          if (dot < 0) {
            s.vx -= 1.75 * dot * nx;
            s.vy -= 1.75 * dot * ny;
          } else {
            s.vx += nx * 0.32;
            s.vy += ny * 0.32;
          }
          s.vScale = 0.05;
        }

        // Clamp max speed so movement stays slow and calm
        const speed = Math.hypot(s.vx, s.vy);
        const maxSpeed = 1.85;
        if (speed > maxSpeed) {
          s.vx = (s.vx / speed) * maxSpeed;
          s.vy = (s.vy / speed) * maxSpeed;
        }

        s.px += s.vx;
        s.py += s.vy;
        s.vx *= 0.982;
        s.vy *= 0.982;

        // Outer viewport wall bounce
        const minX = s.r + 18;
        const maxX = width - s.r - 18;
        const minY = s.r + 92;
        const maxY = height - s.r - 24;

        if (s.px < minX) {
          s.px = minX;
          s.vx = Math.abs(s.vx) * 0.78;
          s.vScale = 0.05;
        } else if (s.px > maxX) {
          s.px = maxX;
          s.vx = -Math.abs(s.vx) * 0.78;
          s.vScale = 0.05;
        }

        if (s.py < minY) {
          s.py = minY;
          s.vy = Math.abs(s.vy) * 0.78;
          s.vScale = 0.05;
        } else if (s.py > maxY) {
          s.py = maxY;
          s.vy = -Math.abs(s.vy) * 0.78;
          s.vScale = 0.05;
        }

        // Shape-to-shape collisions
        for (let j = i + 1; j < shapes.length; j++) {
          const b = shapes[j];
          const dx = b.px - s.px;
          const dy = b.py - s.py;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = s.r + b.r + 12;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (minDist - dist) * 0.5;
            s.px -= nx * overlap;
            s.py -= ny * overlap;
            b.px += nx * overlap;
            b.py += ny * overlap;

            const kx = s.vx - b.vx;
            const ky = s.vy - b.vy;
            const p = nx * kx + ny * ky;
            if (p > 0) {
              s.vx -= p * nx * 0.75;
              s.vy -= p * ny * 0.75;
              b.vx += p * nx * 0.75;
              b.vy += p * ny * 0.75;
            }
            s.vScale = 0.07;
            b.vScale = 0.07;
          }
        }

        s.vScale += (1 - s.scale) * 0.15;
        s.vScale *= 0.76;
        s.scale += s.vScale;

        s.angle += s.vAngle;
        s.vAngle *= 0.99;
        const baseSpin = (s.id % 2 === 0 ? 1 : -1) * 0.0009;
        s.vAngle += (baseSpin - s.vAngle) * 0.02;

        drawShape(s);
      }

      mouse.vx *= 0.5;
      mouse.vy *= 0.5;
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
