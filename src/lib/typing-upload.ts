import { normalizeFigureBox, type FigureBox } from "./typing-model";
export type SourcePage = { id: string; name: string; image: string; selected: boolean; status: "ready" | "done" | "error"; error?: string };
export async function imageData(file: File, maxWidth = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, 2200 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally { bitmap.close(); }
}
export async function readSource(file: File): Promise<SourcePage[]> {
  if (file.size > 30 * 1024 * 1024) throw new Error("파일은 30MB 이하로 올려 주세요.");
  const make = (image: string, name: string): SourcePage => ({ id: crypto.randomUUID(), name, image, selected: true, status: "ready" });
  if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) return [make(await imageData(file), file.name)];
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("PDF, JPG, PNG, WebP 파일을 선택해 주세요.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/typing/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ wasmUrl: "/typing/wasm/", cMapUrl: "/typing/cmaps/", cMapPacked: true, standardFontDataUrl: "/typing/standard_fonts/", data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30) throw new Error("PDF는 30페이지 이하로 나누어 올려 주세요.");
    const pages: SourcePage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / size.width, 2800 / size.height) });
      const canvas = document.createElement("canvas"); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: "white" }).promise;
      pages.push(make(canvas.toDataURL("image/jpeg", 0.88), `${file.name} · ${i}쪽`));
      page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
}

export function paddedFigureBox(box: FigureBox): FigureBox {
  return [Math.max(0, box[0] - 12), Math.max(0, box[1] - 12), Math.min(1000, box[2] + 12), Math.min(1000, box[3] + 12)];
}

export async function cropFigure(image: string, box: FigureBox): Promise<string> {
  const bounds = normalizeFigureBox(box);
  if (!bounds) throw new Error("그림 영역의 위·아래·좌·우 범위를 확인해 주세요.");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new Error("올바른 원본 이미지가 필요합니다.");
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  try {
    const [top,left,bottom,right] = bounds;
    const x = Math.floor(bitmap.width * left / 1000), y = Math.floor(bitmap.height * top / 1000);
    const width = Math.min(bitmap.width, Math.ceil(bitmap.width * right / 1000)) - x;
    const height = Math.min(bitmap.height, Math.ceil(bitmap.height * bottom / 1000)) - y;
    if (width < 4 || height < 4) throw new Error("그림 영역이 너무 작습니다. 범위를 넓혀 주세요.");
    const scale = Math.min(1, 1200 / width, 1600 / height);
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,x,y,width,height,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/png");
  } finally { bitmap.close(); }
}
