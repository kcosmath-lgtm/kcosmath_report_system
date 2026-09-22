import { getFontEmbedCSS, toBlob } from "html-to-image";

// Capture text, not native form controls (whose value/scroll rendering varies by browser).
export async function captureReportImage(source: HTMLElement): Promise<Blob> {
  await document.fonts.load('16px "Hamchorom Dotum"', '학습 현황 관리');
  await document.fonts.ready;
  await Promise.all(Array.from(source.querySelectorAll("img"), image => image.decode()));

  const copy = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const copies = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("*"))];
  originals.forEach((original, index) => {
    const target = copies[index];
    const computed = getComputedStyle(original);
    for (const property of Array.from(computed)) {
      target.style.setProperty(property, computed.getPropertyValue(property));
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
    const fontEmbedCSS = await getFontEmbedCSS(copy);
    const blob = await toBlob(copy, {
      backgroundColor: "#ffffff", pixelRatio: 3, fontEmbedCSS,
      height: Math.max(copy.offsetHeight, copy.scrollHeight),
    });
    if (!blob) throw new Error("보고서 이미지를 생성하지 못했습니다.");
    return blob;
  } finally {
    host.remove();
  }
}
