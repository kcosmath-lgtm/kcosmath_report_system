export interface MathFunctionSpec {
  expr: string;
  label?: string;
  style?: "solid" | "dashed";
  domain?: [number, number];
  labelPos?: [number, number];
  strokeWidth?: number;
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
  arrow?: boolean;
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

export interface MathTangentSpec {
  fn: string;
  atX: number;
  label?: string;
  style?: "solid" | "dashed";
  pointLabel?: string;
  dropToX?: boolean;
  dropToY?: boolean;
  xTick?: string;
  yTick?: string;
}

export interface MathRightAngleSpec {
  at: [number, number];
  from: [number, number];
  to: [number, number];
  size?: number;
}

export interface MathArcSpec {
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
  label?: string;
  shaded?: boolean;
  style?: "solid" | "dashed";
}

export interface MathAsymptoteSpec {
  x?: number;
  y?: number;
  label?: string;
}

export interface MathGeoSpec {
  title?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  showAxes?: boolean;
  showGrid?: boolean;
  equalAspect?: boolean;
  autoIntersections?: boolean;
  functions?: MathFunctionSpec[];
  shadedRegions?: MathShadedRegionSpec[];
  points?: MathPointSpec[];
  segments?: MathSegmentSpec[];
  polygons?: MathPolygonSpec[];
  circles?: MathCircleSpec[];
  tangents?: MathTangentSpec[];
  rightAngles?: MathRightAngleSpec[];
  arcs?: MathArcSpec[];
  asymptotes?: MathAsymptoteSpec[];
}

function escapeXml(s: string): string {
  return String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function convertPipeAbs(input: string): string {
  let s = input;
  // Convert innermost |...| pairs iteratively into abs(...)
  for (let iter = 0; iter < 6; iter++) {
    const next = s.replace(/\|([^|]+)\|/g, "abs($1)");
    if (next === s) break;
    s = next;
  }
  return s;
}

export function normalizeMathFormula(rawExpr: string): string {
  let expr = String(rawExpr || "").trim();
  if (!expr) return "";

  // Strip surrounding $...$
  expr = expr.replace(/^\$+|\$+$/g, "").trim();

  // Strip leading function assignment like y =, f(x) =, g(x) =, h(x) =
  expr = expr.replace(/^(?:[yY]|[fghFGHsS]\s*\(\s*x\s*\))\s*=\s*/, "");

  // Normalize Unicode math operators & superscripts
  expr = expr
    .replace(/−|–|—/g, "-")
    .replace(/×|\\times|\\cdot/g, "*")
    .replace(/÷|\\div/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4")
    .replace(/π|\\pi\b/gi, "pi");

  // Convert LaTeX \frac{a}{b} -> ((a)/(b))
  for (let i = 0; i < 5; i++) {
    const next = expr.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "(($1)/($2))");
    if (next === expr) break;
    expr = next;
  }

  // Convert LaTeX \sqrt{a} -> sqrt(a)
  for (let i = 0; i < 4; i++) {
    const next = expr.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
    if (next === expr) break;
    expr = next;
  }

  // Convert LaTeX \left| ... \right| and |...|
  expr = expr.replace(/\\left\s*\|/g, "|").replace(/\\right\s*\|/g, "|");
  expr = expr.replace(/\\left\s*\(/g, "(").replace(/\\right\s*\)/g, ")");
  expr = expr.replace(/\\(sin|cos|tan|ln|log|exp|abs)\b/gi, "$1");
  expr = expr.replace(/\{([^{}]+)\}/g, "($1)");
  expr = convertPipeAbs(expr);

  return expr.trim();
}

export function evalMathExpr(rawExpr: string, xVal: number): number {
  try {
    let expr = normalizeMathFormula(rawExpr);
    if (!expr) return NaN;

    expr = expr.replace(/\s+/g, "").replace(/\^/g, "**");

    // Protect function identifiers before implicit multiplication
    expr = expr
      .replace(/\bsin\(/gi, "__SIN__(")
      .replace(/\bcos\(/gi, "__COS__(")
      .replace(/\btan\(/gi, "__TAN__(")
      .replace(/\bsqrt\(/gi, "__SQRT__(")
      .replace(/\babs\(/gi, "__ABS__(")
      .replace(/\bln\(/gi, "__LN__(")
      .replace(/\blog\(/gi, "__LOG__(")
      .replace(/\bexp\(/gi, "__EXP__(")
      .replace(/\bpi\b/gi, "(__PI__)");

    // Implicit multiplication: 2x -> 2*x, 2( -> 2*(, 2__SIN__ -> 2*__SIN__, )x -> )*x, )2 -> )*2, )( -> )*(, x( -> x*(, x__SIN__ -> x*__SIN__
    expr = expr
      .replace(/(\d)(x|\(|__)/gi, "$1*$2")
      .replace(/(\))(x|\d|\(|__)/gi, "$1*$2")
      .replace(/(x)(\(|\d|__)/gi, "$1*$2");

    // Restore JS Math identifiers
    expr = expr
      .replace(/__SIN__\(/g, "Math.sin(")
      .replace(/__COS__\(/g, "Math.cos(")
      .replace(/__TAN__\(/g, "Math.tan(")
      .replace(/__SQRT__\(/g, "Math.sqrt(")
      .replace(/__ABS__\(/g, "Math.abs(")
      .replace(/__LN__\(/g, "Math.log(")
      .replace(/__LOG__\(/g, "Math.log10(")
      .replace(/__EXP__\(/g, "Math.exp(")
      .replace(/__PI__/g, "Math.PI");

    // Allow only safe characters
    if (!/^[0-9xX+\-*/().,MathsincoqrtablgexpPI\s]+$/.test(expr)) {
      return NaN;
    }

    const fn = new Function("x", `"use strict"; return (${expr});`);
    const y = Number(fn(xVal));
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

export function numericDerivative(expr: string, x0: number): number {
  const h = 1e-5;
  const yPlus = evalMathExpr(expr, x0 + h);
  const yMinus = evalMathExpr(expr, x0 - h);
  if (!Number.isFinite(yPlus) || !Number.isFinite(yMinus)) return NaN;
  return (yPlus - yMinus) / (2 * h);
}

export function findFunctionIntersections(
  expr1: string,
  expr2: string,
  xMin: number,
  xMax: number
): Array<{ x: number; y: number }> {
  const steps = 200;
  const dx = (xMax - xMin) / steps;
  const found: Array<{ x: number; y: number }> = [];

  const diff = (x: number) => evalMathExpr(expr1, x) - evalMathExpr(expr2, x);

  for (let i = 0; i < steps; i++) {
    const a = xMin + i * dx;
    const b = a + dx;
    const fa = diff(a);
    const fb = diff(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;

    let rootX: number | null = null;
    if (Math.abs(fa) < 1e-7) {
      rootX = a;
    } else if (fa * fb < 0) {
      let lo = a;
      let hi = b;
      let flo = fa;
      for (let iter = 0; iter < 28; iter++) {
        const mid = 0.5 * (lo + hi);
        const fmid = diff(mid);
        if (!Number.isFinite(fmid)) break;
        if (Math.abs(fmid) < 1e-8) {
          lo = mid;
          hi = mid;
          break;
        }
        if (flo * fmid <= 0) {
          hi = mid;
        } else {
          lo = mid;
          flo = fmid;
        }
      }
      rootX = 0.5 * (lo + hi);
    }

    if (rootX !== null) {
      const rx = Math.abs(rootX) < 1e-6 ? 0 : Number(rootX.toFixed(4));
      const ryRaw = evalMathExpr(expr1, rx);
      const ry2Raw = evalMathExpr(expr2, rx);
      // Ignore false sign-flips across vertical asymptotes
      if (Number.isFinite(ryRaw) && Number.isFinite(ry2Raw) && Math.abs(ryRaw - ry2Raw) < 0.08) {
        const ry = Math.abs(ryRaw) < 1e-6 ? 0 : Number(ryRaw.toFixed(4));
        if (!found.some(pt => Math.abs(pt.x - rx) < Math.max(0.08, (xMax - xMin) * 0.015))) {
          found.push({ x: rx, y: ry });
        }
      }
    }
  }
  return found;
}

export function renderMathGeoSvg(spec: MathGeoSpec): string {
  const width = 460;
  const height = 360;
  const pad = 38;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  let xMin = spec.xRange?.[0] ?? -3.5;
  let xMax = spec.xRange?.[1] ?? 4.5;
  let yMin = spec.yRange?.[0] ?? -3.5;
  let yMax = spec.yRange?.[1] ?? 5.5;
  if (xMax <= xMin) xMax = xMin + 4;
  if (yMax <= yMin) yMax = yMin + 4;

  // Auto-expand bounds to ensure explicit points, circles, and polygons never clip off-screen
  const includeBoundsPoint = (px: number, py: number, marginRatio = 0.14) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const xSpan = Math.max(1, xMax - xMin);
    const ySpan = Math.max(1, yMax - yMin);
    if (px < xMin + xSpan * 0.04) xMin = px - xSpan * marginRatio;
    if (px > xMax - xSpan * 0.04) xMax = px + xSpan * marginRatio;
    if (py < yMin + ySpan * 0.04) yMin = py - ySpan * marginRatio;
    if (py > yMax - ySpan * 0.04) yMax = py + ySpan * marginRatio;
  };

  if (Array.isArray(spec.points)) {
    for (const pt of spec.points) includeBoundsPoint(pt.x, pt.y, 0.15);
  }
  if (Array.isArray(spec.circles)) {
    for (const c of spec.circles) {
      includeBoundsPoint(c.cx - c.r, c.cy - c.r, 0.12);
      includeBoundsPoint(c.cx + c.r, c.cy + c.r, 0.12);
    }
  }
  if (Array.isArray(spec.polygons)) {
    for (const poly of spec.polygons) {
      for (const [px, py] of poly.points || []) includeBoundsPoint(px, py, 0.12);
    }
  }

  // Apply 1:1 Equal Aspect Ratio when circles/polygons/rightAngles exist or equalAspect is true
  const shouldEqualAspect =
    spec.equalAspect === true ||
    (spec.equalAspect !== false &&
      ((spec.circles && spec.circles.length > 0) ||
        (spec.rightAngles && spec.rightAngles.length > 0) ||
        (spec.arcs && spec.arcs.length > 0)));

  if (shouldEqualAspect) {
    const xSpan = xMax - xMin;
    const ySpan = yMax - yMin;
    const scaleX = plotW / xSpan;
    const scaleY = plotH / ySpan;
    if (scaleX > scaleY) {
      const targetXSpan = plotW / scaleY;
      const xMid = 0.5 * (xMin + xMax);
      xMin = xMid - 0.5 * targetXSpan;
      xMax = xMid + 0.5 * targetXSpan;
    } else if (scaleY > scaleX) {
      const targetYSpan = plotH / scaleX;
      const yMid = 0.5 * (yMin + yMax);
      yMin = yMid - 0.5 * targetYSpan;
      yMax = yMid + 0.5 * targetYSpan;
    }
  }

  const showAxes = spec.showAxes !== false;
  const toScreenX = (x: number) => pad + ((x - xMin) / Math.max(0.001, xMax - xMin)) * plotW;
  const toScreenY = (y: number) => height - pad - ((y - yMin) / Math.max(0.001, yMax - yMin)) * plotH;

  const ox = toScreenX(0);
  const oy = toScreenY(0);
  const clampedOx = Math.min(width - pad, Math.max(pad, ox));
  const clampedOy = Math.min(height - pad, Math.max(pad, oy));

  const textHalo = `paint-order="stroke" stroke="#ffffff" stroke-width="3.6" stroke-linejoin="round"`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(
    `<defs><clipPath id="plotArea"><rect x="${pad - 6}" y="${pad - 6}" width="${plotW + 12}" height="${plotH + 12}"/></clipPath></defs>`
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
      if (b <= a) continue;
      const steps = 100;
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
      parts.push(`<polygon points="${pts}" fill="${fill}"${fillOp} stroke="#0f172a" stroke-width="1.8"${dash} stroke-linejoin="round"/>`);
    }
  }

  // 3. Circles & Arcs
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

  if (Array.isArray(spec.arcs)) {
    for (const arc of spec.arcs) {
      const cx = toScreenX(arc.cx);
      const cy = toScreenY(arc.cy);
      const rx = Math.abs(toScreenX(arc.cx + arc.r) - cx);
      const ry = Math.abs(toScreenY(arc.cy + arc.r) - cy);
      const startRad = (arc.startDeg * Math.PI) / 180;
      const endRad = (arc.endDeg * Math.PI) / 180;
      const x1 = cx + rx * Math.cos(startRad);
      const y1 = cy - ry * Math.sin(startRad);
      const x2 = cx + rx * Math.cos(endRad);
      const y2 = cy - ry * Math.sin(endRad);
      const sweep = Math.abs(arc.endDeg - arc.startDeg) > 180 ? 1 : 0;
      const dash = arc.style === "dashed" ? ` stroke-dasharray="4,3"` : "";
      if (arc.shaded) {
        parts.push(
          `<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 ${sweep} 0 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="#cbd5e1" fill-opacity="0.55" stroke="#0f172a" stroke-width="1.4"${dash}/>`
        );
      } else {
        parts.push(
          `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 ${sweep} 0 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#334155" stroke-width="1.4"${dash}/>`
        );
      }
      if (arc.label) {
        const midRad = (0.5 * (arc.startDeg + arc.endDeg) * Math.PI) / 180;
        const lx = cx + (rx + 12) * Math.cos(midRad) - 4;
        const ly = cy - (ry + 12) * Math.sin(midRad) + 4;
        parts.push(
          `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a" ${textHalo}>${escapeXml(arc.label)}</text>`
        );
      }
    }
  }

  // 4. Right-Angle Marks (직각 기호)
  if (Array.isArray(spec.rightAngles)) {
    for (const ra of spec.rightAngles) {
      const ax = toScreenX(ra.at[0]);
      const ay = toScreenY(ra.at[1]);
      const fx = toScreenX(ra.from[0]) - ax;
      const fy = toScreenY(ra.from[1]) - ay;
      const tx = toScreenX(ra.to[0]) - ax;
      const ty = toScreenY(ra.to[1]) - ay;
      const flen = Math.hypot(fx, fy) || 1;
      const tlen = Math.hypot(tx, ty) || 1;
      const sz = ra.size ?? 9;
      const ux = (fx / flen) * sz;
      const uy = (fy / flen) * sz;
      const vx = (tx / tlen) * sz;
      const vy = (ty / tlen) * sz;
      const p1 = `${(ax + ux).toFixed(1)},${(ay + uy).toFixed(1)}`;
      const p2 = `${(ax + ux + vx).toFixed(1)},${(ay + uy + vy).toFixed(1)}`;
      const p3 = `${(ax + vx).toFixed(1)},${(ay + vy).toFixed(1)}`;
      parts.push(`<polyline points="${p1} ${p2} ${p3}" fill="none" stroke="#334155" stroke-width="1.3"/>`);
    }
  }

  // 5. Coordinate Axes (KICE / 평가원 모의고사 표준 스타일)
  if (showAxes) {
    parts.push(`<g stroke="#0f172a" stroke-width="1.5">`);
    parts.push(`<line x1="${pad - 4}" y1="${clampedOy.toFixed(1)}" x2="${width - pad + 8}" y2="${clampedOy.toFixed(1)}"/>`);
    parts.push(
      `<polygon points="${width - pad + 13},${clampedOy.toFixed(1)} ${width - pad + 4},${(clampedOy - 4).toFixed(1)} ${width - pad + 4},${(clampedOy + 4).toFixed(1)}" fill="#0f172a" stroke="none"/>`
    );
    parts.push(`<line x1="${clampedOx.toFixed(1)}" y1="${height - pad + 4}" x2="${clampedOx.toFixed(1)}" y2="${pad - 8}"/>`);
    parts.push(
      `<polygon points="${clampedOx.toFixed(1)},${pad - 13} ${(clampedOx - 4).toFixed(1)},${pad - 4} ${(clampedOx + 4).toFixed(1)},${pad - 4}" fill="#0f172a" stroke="none"/>`
    );
    parts.push(`</g>`);

    parts.push(
      `<text x="${width - pad + 16}" y="${(clampedOy + 5).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="16" fill="#0f172a" ${textHalo}>x</text>`
    );
    parts.push(
      `<text x="${(clampedOx - 5).toFixed(1)}" y="${pad - 17}" font-family="Times New Roman, serif" font-style="italic" font-size="16" fill="#0f172a" ${textHalo}>y</text>`
    );
    parts.push(
      `<text x="${(clampedOx - 16).toFixed(1)}" y="${(clampedOy + 17).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" fill="#0f172a" ${textHalo}>O</text>`
    );
  }

  // 6. Asymptotes (점근선)
  if (Array.isArray(spec.asymptotes)) {
    parts.push(`<g clip-path="url(#plotArea)" stroke="#475569" stroke-width="1.3" stroke-dasharray="5,4">`);
    for (const asym of spec.asymptotes) {
      if (typeof asym.x === "number") {
        const sx = toScreenX(asym.x);
        parts.push(`<line x1="${sx.toFixed(1)}" y1="${pad - 6}" x2="${sx.toFixed(1)}" y2="${height - pad + 6}"/>`);
      }
      if (typeof asym.y === "number") {
        const sy = toScreenY(asym.y);
        parts.push(`<line x1="${pad - 6}" y1="${sy.toFixed(1)}" x2="${width - pad + 6}" y2="${sy.toFixed(1)}"/>`);
      }
    }
    parts.push(`</g>`);
  }

  // 7. Function Curves (with discontinuity detection & label positioning)
  if (Array.isArray(spec.functions)) {
    parts.push(`<g clip-path="url(#plotArea)">`);
    const ySpan = yMax - yMin;
    for (const fnSpec of spec.functions) {
      const domMin = fnSpec.domain?.[0] ?? xMin;
      const domMax = fnSpec.domain?.[1] ?? xMax;
      const samples = 300;
      let currentSegment: string[] = [];
      const segments: string[][] = [];
      let prevY: number | null = null;

      for (let i = 0; i <= samples; i++) {
        const x = domMin + ((domMax - domMin) * i) / samples;
        const y = evalMathExpr(fnSpec.expr, x);
        const isJump = prevY !== null && Number.isFinite(y) && Math.abs(y - prevY) > ySpan * 1.4;
        if (Number.isFinite(y) && y >= yMin - ySpan * 1.2 && y <= yMax + ySpan * 1.2 && !isJump) {
          currentSegment.push(`${toScreenX(x).toFixed(1)},${toScreenY(y).toFixed(1)}`);
          prevY = y;
        } else {
          if (currentSegment.length >= 2) segments.push(currentSegment);
          currentSegment = [];
          if (Number.isFinite(y) && y >= yMin - ySpan * 1.2 && y <= yMax + ySpan * 1.2) {
            currentSegment.push(`${toScreenX(x).toFixed(1)},${toScreenY(y).toFixed(1)}`);
            prevY = y;
          } else {
            prevY = null;
          }
        }
      }
      if (currentSegment.length >= 2) segments.push(currentSegment);

      const dash = fnSpec.style === "dashed" ? ` stroke-dasharray="6,4"` : "";
      const sw = fnSpec.strokeWidth ?? 2.1;
      for (const seg of segments) {
        parts.push(
          `<polyline points="${seg.join(" ")}" fill="none" stroke="#0f172a" stroke-width="${sw}"${dash} stroke-linejoin="round" stroke-linecap="round"/>`
        );
      }

      if (fnSpec.label) {
        let lx = fnSpec.labelPos?.[0];
        let ly = fnSpec.labelPos?.[1];
        if (lx === undefined || ly === undefined || !Number.isFinite(ly)) {
          // Pick a visible point along the curve near 76% of domain
          for (const ratio of [0.76, 0.65, 0.84, 0.25, 0.5]) {
            const candX = domMin + (domMax - domMin) * ratio;
            const candY = evalMathExpr(fnSpec.expr, candX);
            if (Number.isFinite(candY) && candY >= yMin + ySpan * 0.08 && candY <= yMax - ySpan * 0.08) {
              lx = candX;
              ly = candY;
              break;
            }
          }
        }
        if (lx !== undefined && ly !== undefined && Number.isFinite(ly)) {
          const sx = Math.min(width - pad - 56, Math.max(pad + 8, toScreenX(lx) + 6));
          const sy = Math.min(height - pad - 10, Math.max(pad + 18, toScreenY(ly) - 8));
          parts.push(
            `<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" fill="#0f172a" ${textHalo}>${escapeXml(fnSpec.label)}</text>`
          );
        }
      }
    }
    parts.push(`</g>`);
  }

  // 8. Automatic Tangent Lines (접선 자동 작도)
  const extraPoints: MathPointSpec[] = [];
  if (Array.isArray(spec.tangents)) {
    parts.push(`<g clip-path="url(#plotArea)">`);
    for (const tan of spec.tangents) {
      const x0 = tan.atX;
      const y0 = evalMathExpr(tan.fn, x0);
      const m = numericDerivative(tan.fn, x0);
      if (!Number.isFinite(y0) || !Number.isFinite(m)) continue;
      const yAtMin = m * (xMin - x0) + y0;
      const yAtMax = m * (xMax - x0) + y0;
      const dash = tan.style === "dashed" ? ` stroke-dasharray="6,4"` : "";
      parts.push(
        `<line x1="${toScreenX(xMin).toFixed(1)}" y1="${toScreenY(yAtMin).toFixed(1)}" x2="${toScreenX(xMax).toFixed(1)}" y2="${toScreenY(yAtMax).toFixed(1)}" stroke="#0f172a" stroke-width="1.7"${dash}/>`
      );
      if (tan.label) {
        const lx = x0 + (xMax - xMin) * 0.18;
        const ly = m * (lx - x0) + y0;
        const sx = Math.min(width - pad - 45, Math.max(pad + 8, toScreenX(lx) + 6));
        const sy = Math.min(height - pad - 10, Math.max(pad + 18, toScreenY(ly) - 6));
        parts.push(
          `<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a" ${textHalo}>${escapeXml(tan.label)}</text>`
        );
      }
      extraPoints.push({
        x: x0,
        y: y0,
        label: tan.pointLabel,
        dropToX: tan.dropToX ?? true,
        dropToY: tan.dropToY,
        xTick: tan.xTick,
        yTick: tan.yTick,
      });
    }
    parts.push(`</g>`);
  }

  // 9. Automatic Intersections (두 함수 교점 자동 탐색)
  if (spec.autoIntersections && Array.isArray(spec.functions) && spec.functions.length >= 2) {
    const pts = findFunctionIntersections(spec.functions[0].expr, spec.functions[1].expr, xMin, xMax);
    pts.forEach((pt, idx) => {
      const alreadyMarked = (spec.points || []).some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < 0.18);
      if (!alreadyMarked) {
        extraPoints.push({
          x: pt.x,
          y: pt.y,
          label: String.fromCharCode(65 + idx),
          dropToX: Math.abs(pt.y) > 0.1,
          xTick: Number.isInteger(pt.x) ? String(pt.x) : undefined,
        });
      }
    });
  }

  // 10. Line Segments
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
          `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a" ${textHalo}>${escapeXml(seg.label)}</text>`
        );
      }
    }
  }

  // 11. Points & Dashed Axis Projections (수선의 발 점선)
  const allPoints = [...(spec.points || []), ...extraPoints];
  for (const pt of allPoints) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const sx = toScreenX(pt.x);
    const sy = toScreenY(pt.y);

    if (pt.dropToX && showAxes && Math.abs(sy - clampedOy) > 3) {
      parts.push(
        `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${clampedOy.toFixed(1)}" stroke="#475569" stroke-width="1.2" stroke-dasharray="4,3"/>`
      );
      const tickText = pt.xTick ?? (Math.abs(pt.x) > 1e-4 ? String(Number(pt.x.toFixed(2))) : "");
      if (tickText) {
        const ty = pt.y >= 0 ? clampedOy + 16 : clampedOy - 7;
        parts.push(
          `<text x="${(sx - 4).toFixed(1)}" y="${ty.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a" ${textHalo}>${escapeXml(tickText)}</text>`
        );
      }
    }

    if (pt.dropToY && showAxes && Math.abs(sx - clampedOx) > 3) {
      parts.push(
        `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${clampedOx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#475569" stroke-width="1.2" stroke-dasharray="4,3"/>`
      );
      const tickText = pt.yTick ?? (Math.abs(pt.y) > 1e-4 ? String(Number(pt.y.toFixed(2))) : "");
      if (tickText) {
        const tx = pt.x >= 0 ? clampedOx - 18 : clampedOx + 7;
        parts.push(
          `<text x="${tx.toFixed(1)}" y="${(sy + 4).toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="14" fill="#0f172a" ${textHalo}>${escapeXml(tickText)}</text>`
        );
      }
    }

    parts.push(
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.3" fill="${pt.hollow ? "#ffffff" : "#0f172a"}" stroke="#0f172a" stroke-width="1.5"/>`
    );

    if (pt.label) {
      const dx = pt.labelOffset?.[0] ?? 6;
      const dy = pt.labelOffset?.[1] ?? -7;
      const lx = Math.min(width - pad - 24, Math.max(pad - 12, sx + dx));
      const ly = Math.min(height - 10, Math.max(16, sy + dy));
      parts.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="Times New Roman, serif" font-style="italic" font-size="15" font-weight="600" fill="#0f172a" ${textHalo}>${escapeXml(pt.label)}</text>`
      );
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
    canvas.width = 690;
    canvas.height = 540;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 사용자의 프롬프트에 포함된 함수식(예: y = x^3 - 3x, f(x) = |x^2 - 4|), 접선, 원 등을 분석해
 * 실제 수학적으로 일치하는 MathGeoSpec을 동적으로 생성합니다.
 */
export function buildMathGeoSpecFromPrompt(prompt: string): MathGeoSpec | null {
  const text = String(prompt || "").trim();
  if (!text) return null;

  // 1. Extract explicit equations like f(x) = ..., g(x) = ..., y = ...
  const eqRegex = /(?:[fghFGH]\s*\(\s*x\s*\)|y)\s*=\s*([0-9xX+\-*/^().|\s\\fracsqrtincotablgexpPIπ]+)/g;
  const extractedFns: string[] = [];
  for (const m of text.matchAll(eqRegex)) {
    const candidate = normalizeMathFormula(m[1].replace(/[가-힣]+.*$/, "").trim());
    if (candidate && Number.isFinite(evalMathExpr(candidate, 1))) {
      extractedFns.push(candidate);
    }
  }

  if (extractedFns.length > 0) {
    const f1 = extractedFns[0];
    const f2 = extractedFns[1];
    const xRange: [number, number] = [-3.5, 4.5];
    const samples: number[] = [];
    for (let x = -3; x <= 4; x += 0.25) {
      const y1 = evalMathExpr(f1, x);
      if (Number.isFinite(y1) && Math.abs(y1) < 30) samples.push(y1);
      if (f2) {
        const y2 = evalMathExpr(f2, x);
        if (Number.isFinite(y2) && Math.abs(y2) < 30) samples.push(y2);
      }
    }
    const minY = samples.length ? Math.min(-2, ...samples) - 1 : -3.5;
    const maxY = samples.length ? Math.max(3, ...samples) + 1.2 : 5.5;
    const yRange: [number, number] = [Math.max(-12, Number(minY.toFixed(1))), Math.min(15, Number(maxY.toFixed(1)))];

    const tangents: MathTangentSpec[] = [];
    const tanMatch = text.match(/x\s*=\s*(-?\d+(?:\.\d+)?)\s*에서의?\s*접선/);
    if (tanMatch) {
      const atX = Number(tanMatch[1]);
      tangents.push({
        fn: f1,
        atX,
        label: "y=l(x)",
        style: "dashed",
        pointLabel: `P(${atX}, ${Number(evalMathExpr(f1, atX).toFixed(2))})`,
        dropToX: true,
        xTick: String(atX),
      });
    }

    const intersections = f2 ? findFunctionIntersections(f1, f2, xRange[0], xRange[1]) : [];
    const shadedRegions: MathShadedRegionSpec[] =
      f2 && intersections.length >= 2
        ? [{ f1, f2, from: intersections[0].x, to: intersections[intersections.length - 1].x }]
        : [];

    return {
      title: "사용자 수식 맞춤 작도",
      xRange,
      yRange,
      showAxes: true,
      autoIntersections: Boolean(f2),
      functions: [
        { expr: f1, label: "y=f(x)" },
        ...(f2 ? [{ expr: f2, label: "y=g(x)", style: "dashed" as const }] : []),
      ],
      shadedRegions,
      tangents,
    };
  }

  // Only fall back to semantic presets when the user explicitly asks to draw/plot a graph or diagram without raw equations
  const explicitlyWantsPlot = /(작도|그려|그래프.*그|도형.*그|그림.*그)/.test(text);
  if (explicitlyWantsPlot) {
    if (/(절댓값|미분가능|불연속|접어\s*올린)/.test(text)) {
      return MATH_GEO_PRESETS[0].spec;
    }
    if (/(원|접선|현|수선의?\s*발|외접원|내접|피타고라스)/.test(text) && !/(삼차|사차|다항|적분)/.test(text)) {
      return MATH_GEO_PRESETS[2].spec;
    }
    if (/(삼각함수|사인법칙|코사인법칙|삼각형|외접)/.test(text)) {
      return MATH_GEO_PRESETS[4].spec;
    }
    if (/(지수|로그|역함수|점근선)/.test(text)) {
      return MATH_GEO_PRESETS[5].spec;
    }
    if (/(삼차|사차|극대|극소|접선|넓이|정적분|다항함수|그래프)/.test(text)) {
      return MATH_GEO_PRESETS[1].spec;
    }
  }

  return null;
}

export const MATH_GEO_PRESETS: Array<{ name: string; spec: MathGeoSpec }> = [
  {
    name: "22·30번 킬러 · 절댓값 함수 |f(x)-t|와 미분가능성",
    spec: {
      title: "절댓값 접어올린 함수와 극값·접선",
      xRange: [-2.2, 3.6],
      yRange: [-1.2, 5.2],
      showAxes: true,
      functions: [
        { expr: "abs(x^3 - 3*x + 1)", label: "y=|f(x)|", labelPos: [2.05, 4.1] },
        { expr: "x^3 - 3*x + 1", label: "y=f(x)", style: "dashed", labelPos: [-1.8, -0.8] },
        { expr: "3", label: "y=t", style: "dashed", labelPos: [2.7, 3.1] },
      ],
      points: [
        { x: -1, y: 3, label: "A(-1, 3)", dropToX: true, xTick: "-1" },
        { x: 1, y: 1, label: "B(1, 1)", dropToX: true, dropToY: true, xTick: "1", yTick: "1" },
        { x: 2, y: 3, label: "C(2, 3)", dropToX: true, xTick: "2" },
      ],
    },
  },
  {
    name: "삼차함수 극값과 접선으로 둘러싸인 넓이 (수학II 4점)",
    spec: {
      title: "삼차함수와 접선",
      xRange: [-1.4, 3.8],
      yRange: [-1.8, 8.2],
      showAxes: true,
      functions: [
        { expr: "x^3 - 3*x^2 + 2*x + 1", label: "y=f(x)", labelPos: [2.2, 0.2] },
        { expr: "2*x + 1", label: "y=g(x)", style: "dashed", labelPos: [1.5, 4.4] },
      ],
      shadedRegions: [{ f1: "2*x + 1", f2: "x^3 - 3*x^2 + 2*x + 1", from: 0, to: 3 }],
      points: [
        { x: 0, y: 1, label: "A", dropToY: true, yTick: "1" },
        { x: 3, y: 7, label: "B(3, 7)", dropToX: true, xTick: "3" },
        { x: 1, y: 1, label: "P", dropToX: true, xTick: "1" },
      ],
    },
  },
  {
    name: "원과 접선 · 수선의 발 직각기호 (기하·공통 4점)",
    spec: {
      title: "원과 접선 기하",
      xRange: [-3.5, 5.8],
      yRange: [-3.2, 3.8],
      showAxes: true,
      equalAspect: true,
      circles: [{ cx: 0, cy: 0, r: Math.sqrt(5) }],
      polygons: [{ points: [[-Math.sqrt(5), 0], [1, 2], [5, 0]], shaded: true }],
      segments: [
        { x1: 0, y1: 0, x2: 1, y2: 2, style: "dashed" },
        { x1: -0.6, y1: 2.8, x2: 5.4, y2: -0.2 },
      ],
      rightAngles: [
        { at: [1, 2], from: [0, 0], to: [5, 0], size: 8 },
        { at: [1, 0], from: [1, 2], to: [5, 0], size: 8 },
      ],
      points: [
        { x: -Math.sqrt(5), y: 0, label: "A", labelOffset: [-18, -6] },
        { x: 1, y: 2, label: "P(1, 2)", dropToX: true, xTick: "H" },
        { x: 5, y: 0, label: "B(5, 0)", labelOffset: [-10, 18] },
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
    name: "삼각함수 코사인법칙과 외접원 기하 (수학I 15·21번급)",
    spec: {
      title: "외접원과 내접 사각형",
      xRange: [-3.6, 3.6],
      yRange: [-3.2, 3.2],
      showAxes: false,
      equalAspect: true,
      circles: [{ cx: 0, cy: 0, r: 2.6 }],
      polygons: [
        {
          points: [
            [-2.25, -1.3],
            [-1.3, 2.25],
            [2.25, 1.3],
            [1.84, -1.84],
          ],
          shaded: true,
        },
      ],
      segments: [
        { x1: -2.25, y1: -1.3, x2: 2.25, y2: 1.3, style: "dashed" },
        { x1: -1.3, y1: 2.25, x2: 1.84, y2: -1.84, style: "dashed" },
      ],
      arcs: [{ cx: -2.25, cy: -1.3, r: 0.55, startDeg: 30, endDeg: 75, label: "θ" }],
      points: [
        { x: -2.25, y: -1.3, label: "A", labelOffset: [-18, 12] },
        { x: -1.3, y: 2.25, label: "B", labelOffset: [-14, -8] },
        { x: 2.25, y: 1.3, label: "C", labelOffset: [8, -6] },
        { x: 1.84, y: -1.84, label: "D", labelOffset: [8, 14] },
      ],
    },
  },
  {
    name: "지수·로그함수 역함수 대칭과 기울기 -1 직선 (수학I 4점)",
    spec: {
      title: "지수·로그함수와 y=-x+k 교점",
      xRange: [-1.5, 5.5],
      yRange: [-1.5, 5.5],
      showAxes: true,
      equalAspect: true,
      functions: [
        { expr: "2^(x-1)", label: "y=2^{x-1}", labelPos: [2.8, 4.3] },
        { expr: "log(x)/log(2) + 1", label: "y=log_2(x)+1", domain: [0.12, 5.2], labelPos: [3.6, 2.5] },
        { expr: "x", label: "y=x", style: "dashed", labelPos: [4.2, 4.5] },
        { expr: "-x + 5", label: "y=-x+5", labelPos: [0.4, 4.7] },
      ],
      polygons: [{ points: [[0, 0], [2, 3], [3, 2]], shaded: true }],
      points: [
        { x: 2, y: 3, label: "A(x₁, y₁)", dropToX: true, xTick: "x₁" },
        { x: 3, y: 2, label: "B(x₂, y₂)", dropToX: true, xTick: "x₂" },
      ],
    },
  },
];
