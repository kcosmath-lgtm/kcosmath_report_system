import { getFontEmbedCSS, toBlob } from "html-to-image";
import { optionalImageResource } from "./report-image-fonts";

// Capture text, not native form controls (whose value/scroll rendering varies by browser).
export async function captureReportImage(source: HTMLElement): Promise<Blob> {
  const fonts = await optionalImageResource(document.fonts.load('16px "Hamchorom Dotum"', '학습 현황 관리'));
  await Promise.all(Array.from(source.querySelectorAll("img"), async image => {
    await optionalImageResource(image.decode());
    if (!image.complete || !image.naturalWidth) throw new Error("보고서 로고를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 저장해 주세요.");
  }));

  const copy = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const copies = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))];
  originals.forEach((original, index) => {
    const target = copies[index];
    const computed = getComputedStyle(original);
    for (const property of Array.from(computed)) {
      target.style.setProperty(property, computed.getPropertyValue(property));
    }
    if (original instanceof HTMLImageElement && target instanceof HTMLImageElement) {
      // Reuse the decoded logo instead of fetching the Next image URL again.
      const canvas = document.createElement("canvas");
      canvas.width = original.naturalWidth;
      canvas.height = original.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이 브라우저에서 이미지 저장을 준비하지 못했습니다.");
      context.drawImage(original, 0, 0);
      target.removeAttribute("srcset");
      target.removeAttribute("sizes");
      target.src = canvas.toDataURL("image/png");
      target.loading = "eager";
    }
    if (original instanceof HTMLInputElement || original instanceof HTMLTextAreaElement) {
      const text = document.createElement("div");
      text.style.cssText = target.style.cssText;
      text.textContent = original.value;
      text.style.whiteSpace = original instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
      text.style.overflowWrap = "anywhere";
      text.style.overflow = "visible";
      text.style.height = "auto";
      text.style.minHeight = computed.height;
      text.style.color = "#000000";
      text.style.setProperty("-webkit-text-fill-color", "#000000");
      target.replaceWith(text);
    }
  });

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
  host.setAttribute("aria-hidden", "true");
  host.append(copy);
  document.body.append(host);
  try {
    const fontEmbedCSS = fonts?.length ? await optionalImageResource(getFontEmbedCSS(copy)) : undefined;
    const useSystemFont = !fontEmbedCSS || !fontEmbedCSS.includes("data:");
    if (useSystemFont) {
      for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))]) {
        node.style.fontFamily = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      }
    }
    let blob = await optionalImageResource(toBlob(copy, {
      backgroundColor: "#ffffff", pixelRatio: 3,
      fontEmbedCSS: useSystemFont ? "" : fontEmbedCSS, skipFonts: useSystemFont,
      height: Math.max(copy.offsetHeight, copy.scrollHeight),
    }), 15000);
    if (!blob) {
      // SVG/foreignObject decoding is browser-dependent. Fall back to a direct canvas renderer.
      const { default: html2canvas } = await import("html2canvas");
      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = colorCanvas.height = 1;
      const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
      for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))]) {
        const style = getComputedStyle(node);
        for (const property of ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "text-decoration-color"]) {
          if (!colorContext) continue;
          colorContext.clearRect(0, 0, 1, 1);
          colorContext.fillStyle = style.getPropertyValue(property);
          colorContext.fillRect(0, 0, 1, 1);
          const [r,g,b,a] = colorContext.getImageData(0,0,1,1).data;
          node.style.setProperty(property, `rgba(${r},${g},${b},${a / 255})`);
        }
        node.style.boxShadow = "none";
      }
      const canvas = await html2canvas(copy, { scale: 2, backgroundColor: "#ffffff", logging: false,
        onclone: (_document, element) => {
          if (element.parentElement) element.parentElement.style.left = "0";
        },
      });
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    }
    if (!blob) throw new Error("보고서 이미지를 생성하지 못했습니다.");
    return blob;
  } finally {
    host.remove();
  }
}
