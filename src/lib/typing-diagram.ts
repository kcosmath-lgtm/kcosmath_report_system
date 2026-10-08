export type FigureDiagram = { width: number; height: number; elements: { kind: "polyline" | "ellipse" | "text"; points: number[][]; x: number; y: number; rx: number; ry: number; text: string }[] };
export const diagramSchema = { type: "OBJECT", properties: {
  width: { type: "NUMBER" }, height: { type: "NUMBER" },
  elements: { type: "ARRAY", items: { type: "OBJECT", properties: {
    kind: { type: "STRING", enum: ["polyline", "ellipse", "text"] },
    points: { type: "ARRAY", items: { type: "ARRAY", items: { type: "NUMBER" } } },
    ...Object.fromEntries(["x","y","rx","ry"].map(name => [name, { type: "NUMBER" }])), text: { type: "STRING" },
  }, required: ["kind","points","x","y","rx","ry","text"] } },
}, required: ["width","height","elements"] };
export function normalizeDiagram(value: unknown): FigureDiagram {
  const d = value as FigureDiagram;
  const coordinate = (n: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 2000;
  if (!d || !coordinate(d.width) || !coordinate(d.height) || d.width < 1 || d.height < 1 || !Array.isArray(d.elements) || !d.elements.length || d.elements.length > 300) throw new Error("그림 구조를 확인해 주세요.");
  let pointCount = 0;
  const elements = d.elements.map(e => {
    if (!e || !["polyline", "ellipse", "text"].includes(e.kind) || ![e.x,e.y,e.rx,e.ry].every(coordinate) || typeof e.text !== "string" || e.text.length > 200 || !Array.isArray(e.points) || e.points.length > 300) throw new Error("그림 요소를 확인해 주세요.");
    pointCount += e.points.length;
    if (pointCount > 6000 || e.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(coordinate)) || (e.kind === "polyline" && e.points.length < 2)) throw new Error("그림 좌표를 확인해 주세요.");
    return { kind: e.kind, points: e.points.map(p => [...p]), x: e.x, y: e.y, rx: e.rx, ry: e.ry, text: e.text };
  });
  return { width: d.width, height: d.height, elements };
}
export function diagramSvg(value: unknown): string {
  const d = normalizeDiagram(value);
  const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}"><rect width="100%" height="100%" fill="white"/>` + d.elements.map(e => e.kind === "text"
    ? `<text x="${e.x}" y="${e.y}" fill="black" font-family="Arial, sans-serif" font-size="${Math.max(12,Math.min(32,d.width/24))}">${escape(e.text)}</text>`
    : e.kind === "ellipse" ? `<ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" fill="none" stroke="black" stroke-width="2"/>`
    : `<polyline points="${e.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="black" stroke-width="2" stroke-linejoin="round"/>`).join('') + '</svg>';
}
export async function diagramPng(value: unknown): Promise<string> {
  const d = normalizeDiagram(value), url = URL.createObjectURL(new Blob([diagramSvg(d)], { type: "image/svg+xml" }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'), scale = Math.min(1,1200/d.width,1600/d.height);
    canvas.width = Math.max(1,Math.round(d.width*scale)); canvas.height = Math.max(1,Math.round(d.height*scale));
    canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
