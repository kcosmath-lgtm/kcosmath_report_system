export interface MathFunctionSpec {
  expr: string;
  label?: string;
  style?: "solid" | "dashed";
  domain?: [number, number];
  labelPos?: [number, number];
}

export interface MathShadedRegionSpec {
  f1: string;
  f2?: string;
  from: number;
  to: number;
}

export interface MathPointSpec {
  x: number;
  y: number;
  label?: string;
  labelOffset?: [number, number];
  dropToX?: boolean;
  dropToY?: boolean;
  xTick?: string;
  yTick?: string;
  hollow?: boolean;
}

export interface MathSegmentSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style?: "solid" | "dashed";
  label?: string;
}

export interface MathPolygonSpec {
  points: Array<[number, number]>;
  shaded?: boolean;
  style?: "solid" | "dashed";
}

export interface MathCircleSpec {
  cx: number;
  cy: number;
  r: number;
  style?: "solid" | "dashed";
  shaded?: boolean;
}

export interface MathGeoSpec {
  title?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  showAxes?: boolean;
  showGrid?: boolean;
  functions?: MathFunctionSpec[];
  shadedRegions?: MathShadedRegionSpec[];
  points?: MathPointSpec[];
  segments?: MathSegmentSpec[];
  polygons?: MathPolygonSpec[];
  circles?: MathCircleSpec[];
}

function escapeXml(s: string): string {
  return String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

export function evalMathExpr(rawExpr: string, xVal: number): number {
  try {
    let expr = rawExpr
      .trim()
      .replace(/\s+/g, "")
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\^/g, "**");

    // Implicit multiplication: 2x -> 2*x, 3(x -> 3*(x, )x -> )*x, )( -> )*(
    expr = expr
      .replace(/(\d)(x|\()/gi, "$1*$2")
      .replace(/(\))(x|\d|\()/gi, "$1*$2")
      .replace(/(x)(\()/gi, "$1*$2");

    // Replace math functions with Math.*
    expr = expr
      .replace(/\bsin\(/gi, "Math.sin(")
      .replace(/\bcos\(/gi, "Math.cos(")
      .replace(/\btan\(/gi, "Math.tan(")
      .replace(/\bsqrt\(/gi, "Math.sqrt(")
      .replace(/\babs\(/gi, "Math.abs(")
      .replace(/\bln\(/gi, "Math.log(")
      .replace(/\blog\(/gi, "Math.log10(")
      .replace(/\bexp\(/gi, "Math.exp(")
      .replace(/\bpi\b/gi, "Math.PI");

    // Allow only safe characters
    if (!/^[0-9xX+\-*/().,MathsincoqrtblgexpPI\s]+$/.test(expr)) {
      return NaN;
    }

    const fn = new Function("x", `"use strict"; return (${expr});`);
    const y = Number(fn(xVal));
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

export function renderMathGeoSvg(spec: MathGeoSpec): string {
  const width = 440;
  const height = 330;
  const pad = 34;
  const xMin = spec.xRange?.[0] ?? -3.5;
  const xMax = spec.xRange?.[1] ?? 4.5;
  const yMin = spec.yRange?.[0] ?? -3.5;
  const yMax = spec.yRange?.[1] ?? 5.5;
  const showAxes = spec.showAxes !== false;

  const toScreenX = (x: number) => pad + ((x - xMin) / Math.max(0.001, xMax - xMin)) * (width - pad * 2);
  const toScreenY = (y: number) => height - pad - ((y - yMin) / Math.max(0.001, yMax - yMin)) * (height - pad * 2);

  const ox = toScreenX(0);
  const oy = toScreenY(0);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<defs><clipPath id="plotArea"><rect x="${pad - 6}" y="${pad - 6}" width="${width - (pad - 6) * 2}" height="${height - (pad - 6) * 2}"/></clipPath></defs>`
  );

  // Optional Subtle Grid (AlgeoMath / GeoGebra style)
  if (spec.showGrid) {
    parts.push(`<g stroke="#e2e8f0" stroke-width="1">`);
    for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++) {
      const sx = toScreenX(gx);
      parts.push(`<line x1="${sx.toFixed(1)}" y1="${pad}" x2="${sx.toFixed(1)}" y2="${height - pad}"/>`);
    }
    for (let gy = Math.ceil(yMin); gy <= Math.floor(yMax); gy++) {
      const sy = toScreenY(gy);
      parts.push(`<line x1="${pad}" y1="${sy.toFixed(1)}" x2="${width - pad}" y2="${sy.toFixed(1)}"/>`);
    }
    parts.push(`</g>`);
  }

  // 1. Shaded Regions (Integral / Area between curves)
  if (Array.isArray(spec.shadedRegions)) {
    parts.push(`<g clip-path="url(#plotArea)">`);
    for (const region of spec.shadedRegions) {
      const a = Math.max(xMin, Math.min(region.from, region.to));
      const b = Math.min(xMax, Math.max(region.from, region.to));
      const steps = 80;
      const topPts: string[] = [];
      const botPts: string[] = [];
      for (let i = 0; i <= steps; i++) {
        const x = a + ((b - a) * i) / steps;
        const y1 = evalMathExpr(region.f1, x);
        const y2 = region.f2 ? evalMathExpr(region.f2, x) : 0;
        if (Number.isFinite(y1) && Number.isFinite(y2)) {
          topPts.push(`${toScreenX(x).toFixed(1)},${toScreenY(y1).toFixed(1)}`);
          botPts.unshift(`${toScreenX(x).toFixed(1)},${toScreenY(y2).toFixed(1)}`);
        }
      }
      if (topPts.length > 2) {
        parts.push(
          `<polygon points="${[...topPts, ...botPts].join(" ")}" fill="#cbd5e1" fill-opacity="0.65" stroke="none"/>`
        );
      }
    }
    parts.push(`</g>`);
  }

  // 2. Polygons
  if (Array.isArray(spec.polygons)) {
    for (const poly of spec.polygons) {
      if (!Array.isArray(poly.points) || poly.points.length < 3) continue;
      const pts = poly.points.map(([x, y]) => `${toScreenX(x).toFixed(1)},${toScreenY(y).toFixed(1)}`).join(" ");
      const dash = poly.style === "dashed" ? ` stroke-dasharray="5,4"` : "";
      const fill = poly.shaded ? "#cbd5e1" : "none";
      const fillOp = poly.shaded ? ` fill-opacity="0.6"` : "";
      parts.push(`<polygon points="${pts}" fill="${fill}"${fillOp} stroke="#0f172a" stroke-width="1.8"${dash}/>`);
    }
  }

  // 3. Circles
  if (Array.isArray(spec.circles)) {
    parts.push(`<g clip-path="url(#plotArea)">`);
    for (const c of spec.circles) {
      const cx = toScreenX(c.cx);
      const cy = toScreenY(c.cy);
      const rx = Math.abs(toScreenX(c.cx + c.r) - cx);
      const ry = Math.abs(toScreenY(c.cy + c.r) - cy);
      const dash = c.style === "dashed" ? ` stroke-dasharray="5,4"` : "";
      const fill = c.shaded ? "#cbd5e1" : "none";
      const fillOp = c.shaded ? ` fill-opacity="0.55"` : "";
      parts.push(
        `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fill}"${fillOp} stroke="#0f172a" stroke-width="1.8"${dash}/>`
      );
    }
    parts.push(`</g>`);
  }

  // 4. Coordinate Axes (KICE / 평가원 모의고사 표준 스타일)
  if (showAxes) {
    const clampedOx = Math.min(width - pad, Math.max(pad, ox));
    const clampedOy = Math.min(height - pad, Math.max(pad, oy));
    parts.push(`<g stroke="#0f172a" stroke-width="1.5">`);
    // X-axis line + arrow
    parts.push(`<line x1="${pad - 4}" y1="${clampedOy.toFixed(1)}" x2="${width - pad + 8}" y2="${clampedOy.toFixed(1)}"/>`);
    parts.push(
      `<polygon points="${width - pad + 12},${clampedOy.toFixed(1)} ${width - pad + 3},${(clampedOy - 4).toFixed(1)} ${width - pad + 3},${(clampedOy + 4).toFixed(1)}" fill="#0f172a" stroke="none"/>`
    );
    // Y-axis line + arrow
    parts.push(`<line x1="${clampedOx.toFixed(1)}" y1="${height - pad + 4}" x2="${clampedOx.toFixed(1)}" y2="${pad - 8}"/>`);
    parts.push(
      `<polygon points="${clampedOx.toFixed(1)},${pad - 12} ${(clampedOx - 4).toFixed(1)},${pad - 3} ${(clampedOx + 4).toFixed(1)},${pad - 3}" fill="#0f172a" stroke="none"/>`
    );
    parts.push(`</g>`);

    // Axis labels: x, y, O
    parts.push(
      `<text x="${width - pad + 14}" y="${(clampedOy + 5).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="16" fill="#0f172a">x</text>`
    );
    parts.push(
      `<text x="${(clampedOx - 5).toFixed(1)}" y="${pad - 16}" font-family="Times New Roman, serif" font-style="italic" font-size="16" fill="#0f172a">y</text>`
    );
    parts.push(
      `<text x="${(clampedOx - 16).toFixed(1)}" y="${(clampedOy + 17).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" fill="#0f172a">O</text>`
    );
  }

  // 5. Function Curves
  if (Array.isArray(spec.functions)) {
    parts.push(`<g clip-path="url(#plotArea)">`);
    for (const fnSpec of spec.functions) {
      const domMin = fnSpec.domain?.[0] ?? xMin;
      const domMax = fnSpec.domain?.[1] ?? xMax;
      const samples = 220;
      let currentSegment: string[] = [];
      const segments: string[][] = [];

      for (let i = 0; i <= samples; i++) {
        const x = domMin + ((domMax - domMin) * i) / samples;
        const y = evalMathExpr(fnSpec.expr, x);
        if (Number.isFinite(y) && y >= yMin - (yMax - yMin) && y <= yMax + (yMax - yMin)) {
          currentSegment.push(`${toScreenX(x).toFixed(1)},${toScreenY(y).toFixed(1)}`);
        } else if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
      if (currentSegment.length > 0) segments.push(currentSegment);

      const dash = fnSpec.style === "dashed" ? ` stroke-dasharray="6,4"` : "";
      for (const seg of segments) {
        if (seg.length >= 2) {
          parts.push(
            `<polyline points="${seg.join(" ")}" fill="none" stroke="#0f172a" stroke-width="2"${dash} stroke-linejoin="round" stroke-linecap="round"/>`
          );
        }
      }

      if (fnSpec.label) {
        const lx = fnSpec.labelPos?.[0] ?? domMin + (domMax - domMin) * 0.78;
        const ly = fnSpec.labelPos?.[1] ?? evalMathExpr(fnSpec.expr, lx);
        if (Number.isFinite(ly)) {
          const sx = Math.min(width - pad - 45, Math.max(pad + 8, toScreenX(lx) + 6));
          const sy = Math.min(height - pad - 10, Math.max(pad + 16, toScreenY(ly) - 8));
          parts.push(
            `<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" fill="#0f172a">${escapeXml(fnSpec.label)}</text>`
          );
        }
      }
    }
    parts.push(`</g>`);
  }

  // 6. Line Segments
  if (Array.isArray(spec.segments)) {
    for (const seg of spec.segments) {
      const x1 = toScreenX(seg.x1);
      const y1 = toScreenY(seg.y1);
      const x2 = toScreenX(seg.x2);
      const y2 = toScreenY(seg.y2);
      const dash = seg.style === "dashed" ? ` stroke-dasharray="5,4"` : "";
      parts.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0f172a" stroke-width="1.7"${dash}/>`
      );
      if (seg.label) {
        const mx = (x1 + x2) / 2 + 5;
        const my = (y1 + y2) / 2 - 5;
        parts.push(
          `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a">${escapeXml(seg.label)}</text>`
        );
      }
    }
  }

  // 7. Points & Dashed Axis Projections (수선의 발 점선)
  if (Array.isArray(spec.points)) {
    for (const pt of spec.points) {
      const sx = toScreenX(pt.x);
      const sy = toScreenY(pt.y);

      if (pt.dropToX && showAxes) {
        parts.push(
          `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#475569" stroke-width="1.2" stroke-dasharray="4,3"/>`
        );
        const tickText = pt.xTick ?? String(pt.x);
        const ty = pt.y >= 0 ? oy + 16 : oy - 7;
        parts.push(
          `<text x="${(sx - 4).toFixed(1)}" y="${ty.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a">${escapeXml(tickText)}</text>`
        );
      }

      if (pt.dropToY && showAxes) {
        parts.push(
          `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#475569" stroke-width="1.2" stroke-dasharray="4,3"/>`
        );
        const tickText = pt.yTick ?? String(pt.y);
        const tx = pt.x >= 0 ? ox - 18 : ox + 7;
        parts.push(
          `<text x="${tx.toFixed(1)}" y="${(sy + 4).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a">${escapeXml(tickText)}</text>`
        );
      }

      parts.push(
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.2" fill="${pt.hollow ? "#ffffff" : "#0f172a"}" stroke="#0f172a" stroke-width="1.5"/>`
      );

      if (pt.label) {
        const dx = pt.labelOffset?.[0] ?? 6;
        const dy = pt.labelOffset?.[1] ?? -7;
        parts.push(
          `<text x="${(sx + dx).toFixed(1)}" y="${(sy + dy).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" font-weight="600" fill="#0f172a">${escapeXml(pt.label)}</text>`
        );
      }
    }
  }

  parts.push(`</svg>`);
  return parts.join("");
}

export async function renderMathGeoPngDataUrl(spec: MathGeoSpec): Promise<string> {
  const svg = renderMathGeoSvg(spec);
  if (typeof window === "undefined") {
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 660;
    canvas.height = 495;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MATH_GEO_PRESETS: Array<{ name: string; spec: MathGeoSpec }> = [
  {
    name: "삼차함수 극값과 접선 (수학II)",
    spec: {
      title: "삼차함수와 접선",
      xRange: [-1.5, 4.2],
      yRange: [-2.5, 5.2],
      showAxes: true,
      functions: [
        { expr: "x^3 - 3*x^2 + 2*x + 1", label: "y=f(x)", labelPos: [2.8, 3.8] },
        { expr: "2*x + 1", label: "y=g(x)", style: "dashed", labelPos: [1.8, 4.3] },
      ],
      shadedRegions: [{ f1: "2*x + 1", f2: "x^3 - 3*x^2 + 2*x + 1", from: 0, to: 3 }],
      points: [
        { x: 0, y: 1, label: "A", dropToY: true, yTick: "1" },
        { x: 3, y: 7, label: "B", dropToX: true, xTick: "3" },
        { x: 1, y: 1, label: "P", dropToX: true, xTick: "1" },
      ],
    },
  },
  {
    name: "이차함수와 직선으로 둘러싸인 넓이 (공통수학)",
    spec: {
      title: "이차함수와 직선의 교점",
      xRange: [-2, 5],
      yRange: [-2.5, 6.5],
      showAxes: true,
      functions: [
        { expr: "0.5*(x-1)^2 - 1", label: "y=f(x)", labelPos: [3.8, 3.5] },
        { expr: "0.5*x + 1", label: "y=mx+n", labelPos: [3.5, 2.9] },
      ],
      shadedRegions: [{ f1: "0.5*x + 1", f2: "0.5*(x-1)^2 - 1", from: -1, to: 4 }],
      points: [
        { x: -1, y: 0.5, label: "A", dropToX: true, xTick: "α" },
        { x: 4, y: 3, label: "B", dropToX: true, xTick: "β" },
      ],
    },
  },
  {
    name: "원과 직선의 접선 · 삼각형 기하 도형",
    spec: {
      title: "원과 삼각형",
      xRange: [-3.5, 4.5],
      yRange: [-3.2, 3.8],
      showAxes: true,
      circles: [{ cx: 0, cy: 0, r: 2.2 }],
      polygons: [{ points: [[-2.2, 0], [1.1, 1.9], [3.6, 0]], shaded: true }],
      points: [
        { x: -2.2, y: 0, label: "A", labelOffset: [-16, -6] },
        { x: 1.1, y: 1.9, label: "P(x₁, y₁)", dropToX: true, xTick: "H" },
        { x: 3.6, y: 0, label: "B", labelOffset: [6, 15] },
      ],
    },
  },
];
