import JSZip from "jszip";
import katex from "katex";
import { mml2omml } from "mathml2omml";
import { choiceLabels, hasProseChoices, formatBoxContent, examPages, splitMath, type ExamDocument, type ExamProblem } from "./typing-model";

export const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
function mathML(latex: string, display = false) {
  return katex.renderToString(latex, { output: "mathml", displayMode: display, throwOnError: true, trust: false, strict: "ignore" }).match(/<math[\s\S]*<\/math>/)![0].replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, "");
}
const symbols: Record<string, string> = {
  "∞": "inf", "→": "->", "←": "larrow", "↔": "<->", "≤": "le", "≥": "ge", "≠": "ne", "±": "+-", "∓": "-+", "×": "times", "÷": "div", "⋅": "cdot", "∑": "sum", "∏": "prod", "∫": "int", "∬": "dint", "∭": "tint", "∮": "oint", "∂": "partial", "∇": "nabla", "∈": "in", "∉": "notin", "⊂": "subset", "⊆": "subseteq", "∪": "cup", "∩": "cap", "∅": "emptyset", "∀": "forall", "∃": "exist", "∴": "therefore", "∵": "because", "≈": "approx", "≡": "equiv", "⋯": "cdots", "…": "ldots", "′": "'", "″": "''", "−": "-", "∣": "|", "‖": "||", "{": "lbrace", "}": "rbrace", "⟨": "langle", "⟩": "rangle", "∠": "angle", "⊥": "bot", "∥": "parallel", "ℝ": "R", "ℕ": "N", "ℤ": "Z", "ℚ": "Q", "ℂ": "C", "°": "DEG", "∧": "wedge", "∨": "vee", "¬": "neg", "⇒": "RARROW", "⇔": "LRARROW",
};
"α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω".split(" ").forEach((s, i) => { symbols[s] = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ")[i]; });
"Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω".split(" ").forEach((s, i) => { symbols[s] = "GAMMA DELTA THETA LAMBDA XI PI SIGMA UPSILON PHI PSI OMEGA".split(" ")[i]; });

// Convert the parsed math tree, not LaTeX string replacements: fractions,
// nested scripts, roots, matrices and cases retain their mathematical structure.
export function latexToHancom(latex: string): string {
  const root = new DOMParser().parseFromString(mathML(latex), "application/xml").documentElement;
  const children = (el: Element) => Array.from(el.childNodes).filter(n => n.nodeType === 1) as Element[];
  const visit = (el: Element): string => {
    const cs = children(el), at = (i: number) => cs[i] ? visit(cs[i]) : "";
    const group = (i: number) => `{${at(i)}}`;
    switch (el.localName) {
      case "math": case "mstyle": case "mpadded": return cs.map(visit).join(" ");
      case "semantics": return at(0);
      case "annotation": return "";
      case "mrow": {
        const table = cs.find(c => c.localName === "mtable");
        if (table && cs[0]?.textContent === "{") return `cases {${rows(table)}}`;
        return cs.map(visit).join(" ");
      }
      case "mn": case "mi": case "mo": {
        const value = el.textContent ?? "";
        if (symbols[value]) return symbols[value];
        // Unknown Unicode remains Unicode; Hancom supports literal symbols.
        return value.replace(/\u2061|\u2062|\u200b/g, "");
      }
      case "mtext": return `"${(el.textContent ?? "").replace(/"/g, "'")}"`;
      case "mspace": return "`";
      case "mfrac": return /^0(?:px|em)?$/.test(el.getAttribute("linethickness") ?? "") ? `pile {${at(0)} # ${at(1)}}` : `${group(0)} over ${group(1)}`;
      case "msqrt": return `sqrt {${cs.map(visit).join(" ")}}`;
      case "mroot": return `root ${group(1)} of ${group(0)}`;
      case "msub": return `${group(0)} _${group(1)}`;
      case "munder": {
        if (el.getAttribute("accentunder") === "true") {
          if (["_", "¯", "‾", "̲"].includes(cs[1]?.textContent ?? "")) return `under ${group(0)}`;
          throw new Error(`한글에서 지원하지 않는 아랫첨자 장식: ${latex}`);
        }
        return `${group(0)} _${group(1)}`;
      }
      case "msup": return `${group(0)} ^${group(1)}`;
      case "msubsup": case "munderover": return `${group(0)} _${group(1)} ^${group(2)}`;
      case "mover": {
        const accent: Record<string, string> = { "→": "vec", "^": "hat", "ˆ": "hat", "~": "tilde", "˜": "tilde", "¯": "bar", "‾": "bar", "˙": "dot", "¨": "ddot", "⏞": "overbrace" };
        const command = accent[cs[1]?.textContent ?? ""];
        if (!command) throw new Error(`한글에서 지원하지 않는 윗첨자 장식: ${latex}`);
        return `${command} ${group(0)}`;
      }
      case "mtable": return `matrix {${rows(el)}}`;
      case "mtr": return cs.map(visit).join(" & ");
      case "mtd": return cs.map(visit).join(" ");
      case "mphantom": return "";
      default: throw new Error(`한글 수식 변환을 지원하지 않는 구조(${el.localName})입니다: ${latex}`);
    }
  };
  const rows = (el: Element): string => children(el).map(visit).join(" # ");
  return visit(root);
}

const textRun = (text: string) => `<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
function wordRuns(text: string) {
  return splitMath(text).map(part => part.math ? mml2omml(mathML(part.value, part.display), { disableDecode: true }) : part.value.split("\n").map(textRun).join("<w:r><w:br/></w:r>")).join("");
}
function wordParagraph(text: string, props = "") {
  const paragraph = (value: string, display = false) => `<w:p><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/>${props}${display ? '<w:jc w:val="center"/>' : ""}</w:pPr>${display ? `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${mml2omml(mathML(value, true), { disableDecode: true })}</m:oMathPara>` : wordRuns(value)}</w:p>`;
  let inline = "", result = "";
  for (const part of splitMath(text)) {
    if (part.display) { if (inline.trim()) result += paragraph(inline); inline = ""; result += paragraph(part.value, true); }
    else inline += part.math ? `$${part.value}$` : part.value;
  }
  if (inline.trim() || !result) result += paragraph(inline);
  return result;
}
function imageBytes(data: string) {
  if (!/^data:image\/(png|jpeg);base64,/.test(data)) throw new Error("그림은 PNG 또는 JPG로 첨부해 주세요.");
  const encoded = data.split(",")[1], ext = data.startsWith("data:image/png") ? "png" : "jpeg";
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  let width = 0, height = 0;
  if (ext === "png" && bytes.length >= 24) { width = view.getUint32(16); height = view.getUint32(20); }
  else if (ext === "jpeg") {
    for (let i = 2; i + 8 < bytes.length;) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { height = view.getUint16(i + 5); width = view.getUint16(i + 7); break; }
      const length = view.getUint16(i + 2); if (length < 2) break; i += length + 2;
    }
  }
  if (!width || !height) throw new Error("첨부 그림의 크기를 읽지 못했습니다. PNG 또는 JPG로 다시 첨부해 주세요.");
  return { data: encoded, ext, width, height };
}
function wordTable(cells: string[][], totalWidth = 4600, raw = false, header = false): string {
  const widths = header ? [1700,6800,1700] : cells[0].map(() => Math.floor(totalWidth / cells[0].length));
  const borders = ["top","left","bottom","right","insideH","insideV"].map(edge => '<w:' + edge + ' w:val="' + (header && edge === 'bottom' ? 'single' : 'nil') + '" w:sz="6"/>').join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="' + totalWidth + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' + borders + '</w:tblBorders></w:tblPr><w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + cells.map(row => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + row.map((cell, ci) => '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>' + (raw ? cell : wordParagraph(cell).replace('w:after="160"','w:after="0"')) + '</w:tc>').join('') + '</w:tr>').join('') + '</w:tbl><w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t/></w:r></w:p>';
}
export async function buildDocx(doc: ExamDocument): Promise<Blob> {
  const zip = new JSZip();
  let imageId = 0;
  const rels: string[] = [];
  const picture = (data: string, logo = false) => {
      const id = ++imageId, img = imageBytes(data), name = `image${id}.${img.ext}`;
      const scale = Math.min((logo ? 950000 : 2300000) / img.width, (logo ? 280000 : 1500000) / img.height), width = Math.round(img.width * scale), height = Math.round(img.height * scale);
      zip.file(`word/media/${name}`, img.data, { base64: true });
      rels.push(`<Relationship Id="img${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${id}" name="문항 그림 ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    };
  const problem = (p?: ExamProblem) => {
    if (!p) return "<w:p/>";
    let result = wordParagraph(`${p.number}. ${p.question}${p.points ? `  [${p.points}]` : ""}`);
    if (p.boxContent) result += wordParagraph(formatBoxContent(p.boxContent), '<w:pBdr><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:pBdr>');
    for (const table of p.tables ?? []) {
      if (table.caption) result += wordParagraph(table.caption, '<w:jc w:val="center"/>');
      const width = Math.floor(4600 / table.rows[0].length);
      const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map(edge => `<w:${edge} w:val="single" w:sz="4" w:color="000000"/>`).join("");
      result += `<w:tbl><w:tblPr><w:tblW w:w="4600" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${table.rows[0].map(() => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${table.rows.map(row => `<w:tr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${wordParagraph(cell, '<w:jc w:val="center"/>')}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
    }
    if (p.figure) result += picture(p.figure);
    if (p.choices.length) {
      const columns = hasProseChoices(p.choices) ? 1 : Math.max(1, Math.min(5, doc.choiceColumns?.[p.id] ?? (p.choices.some(c => c.length > 20) ? 1 : 3)));
      result += wordTable(Array.from({ length: Math.ceil(p.choices.length / columns) }, (_, ri) => Array.from({ length: columns }, (_, ci) => {
        const i = ri * columns + ci; return p.choices[i] === undefined ? "" : choiceLabels[i] + " " + p.choices[i];
      })));
    }
    return result;
  };
  const pages = examPages(doc.problems, doc.perPage, doc.problemHeights).map((page, index) => {
    const logoRuns = doc.brandImage ? picture(doc.brandImage, true).replace(/^<w:p>|<\/w:p>$/g, "") : "";
    const rows = Array.from({ length: page.capacity / 2 }, (_, i) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${Math.floor(12500 / (page.capacity / 2))}" w:hRule="atLeast"/></w:trPr>${[page.left[i], page.right[i]].map((p, col) => `<w:tc><w:tcPr><w:tcW w:w="5100" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="160" w:type="dxa"/><w:left w:w="${col ? 360 : 0}" w:type="dxa"/><w:right w:w="${col ? 0 : 360}" w:type="dxa"/></w:tcMar><w:tcBorders>${col === 0 ? '<w:right w:val="single" w:sz="5" w:color="000000"/>' : ""}</w:tcBorders></w:tcPr>${problem(p)}</w:tc>`).join("")}</w:tr>`).join("");
    const title = doc.title === "MATHTYPING" ? "" : doc.title;
    const titleSize = Math.max(14, Math.min(28, Math.floor(1600 / Math.max(1, title.length))));
    const titleRuns = '<w:r><w:rPr><w:b/><w:sz w:val="' + titleSize + '"/></w:rPr><w:t>' + xml(title) + '</w:t></w:r>';
    const pageHeader = wordTable([[
      '<w:p><w:pPr><w:keepNext/></w:pPr>' + (logoRuns || textRun('COSMATH')) + '</w:p>',
      '<w:p><w:pPr><w:jc w:val="center"/><w:keepNext/></w:pPr>' + titleRuns + '</w:p>',
      wordParagraph(String(index + 1), '<w:jc w:val="right"/><w:keepNext/>'),
    ]], 10200, true, true);
    return `${index ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ""}${pageHeader}<w:tbl><w:tblPr><w:tblW w:w="10200" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="5100"/><w:gridCol w:w="5100"/></w:tblGrid>${rows}</w:tbl>`;
  }).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`);
  zip.file("word/styles.xml", '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="바탕"/><w:sz w:val="20"/><w:lang w:val="ko-KR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>');
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${pages}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:bottom="850" w:left="850" w:right="850" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}

export async function buildHwpx(doc: ExamDocument, template: ArrayBuffer): Promise<Blob> {
  const zip = await JSZip.loadAsync(template);
  let id = 1000, imageId = 0;
  const images: string[] = [];
  const runs = (text: string) => splitMath(text).map(part => part.math
    ? `<hp:run charPrIDRef="0"><hp:equation id="${++id}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseUnit="1000" textColor="#000000" baseLine="0" lineMode="CHAR" font="HancomEQN"><hp:sz width="0" height="0" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>수식</hp:shapeComment><hp:script>${xml(latexToHancom(part.value))}</hp:script></hp:equation></hp:run>`
    : `<hp:run charPrIDRef="0"><hp:t>${part.value.split("\n").map(xml).join("<hp:lineBreak/>")}</hp:t></hp:run>`).join("");
  const para = (text: string, pageBreak = false, pr = "3") => {
    const single = (value: string, style = pr) => { const result = `<hp:p id="${++id}" paraPrIDRef="${style}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">${runs(value) || '<hp:run charPrIDRef="0"><hp:t/></hp:run>'}</hp:p>`; pageBreak = false; return result; };
    let inline = "", result = "";
    for (const part of splitMath(text)) {
      if (part.display) { if (inline.trim()) result += single(inline); inline = ""; result += single(`$${part.value}$`, "17"); }
      else inline += part.math ? `$${part.value}$` : part.value;
    }
    if (inline.trim() || !result) result += single(inline);
    return result;
  };
  const picture = (data: string, logo = false) => {
      const img = imageBytes(data), binId = `image${++imageId}`;
      const scale = Math.min((logo ? 7500 : 18000) / img.width, (logo ? 2200 : 12000) / img.height), width = Math.round(img.width * scale), height = Math.round(img.height * scale);
      zip.file(`BinData/${binId}.${img.ext}`, img.data, { base64: true });
      images.push(`<opf:item id="${binId}" href="BinData/${binId}.${img.ext}" media-type="image/${img.ext}" isEmbeded="1"/>`);
      return `<hp:p id="${++id}" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:pic id="${++id}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${width}" height="${height}"/><hp:curSz width="${width}" height="${height}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(width / 2)}" centerY="${Math.round(height / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${width}" y="0"/><hc:pt2 x="${width}" y="${height}"/><hc:pt3 x="0" y="${height}"/></hp:imgRect><hp:imgClip left="0" right="${width}" top="0" bottom="${height}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:sz width="${width}" height="${height}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>문항 그림</hp:shapeComment></hp:pic></hp:run></hp:p>`;
    };
  const nativeTable = (cells: string[][], border = 5, centered = true, rowHeight = 1800, totalWidth = 23000, raw = false) => {
    const table = { rows: cells };
      const widths = totalWidth === 51024 && table.rows[0].length === 3 ? [8504,34016,8504] : table.rows[0].map(() => Math.floor(totalWidth / table.rows[0].length));
      const rows = table.rows.map((row, ri) => `<hp:tr>${row.map((cell, ci) => `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="1" dirty="0" borderFillIDRef="${border}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${raw ? cell : para(cell, false, centered ? "17" : "3")}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[ci]}" height="${rowHeight}"/><hp:cellMargin left="250" right="250" top="250" bottom="250"/></hp:tc>`).join("")}</hp:tr>`).join("");
      return `<hp:p id="${++id}" paraPrIDRef="18" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${++id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${table.rows.length}" colCnt="${table.rows[0].length}" cellSpacing="0" borderFillIDRef="${border}" noAdjust="0"><hp:sz width="${totalWidth}" height="${table.rows.length * rowHeight}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="500" bottom="500"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${rows}</hp:tbl></hp:run></hp:p>`;
  };
  const problem = (p?: ExamProblem) => {
    if (!p) return para("");
    let text = para(`${p.number}. ${p.question}${p.points ? `  [${p.points}]` : ""}`);
    if (p.boxContent) text += nativeTable([[para("〈보기〉", false, "17") + para(formatBoxContent(p.boxContent))]], 5, false, 1800, 23000, true);
    for (const table of p.tables ?? []) {
      if (table.caption) text += para(table.caption, false, "17");
      text += nativeTable(table.rows);
    }
    if (p.figure) text += picture(p.figure);
    if (p.choices.length) {
      const columns = hasProseChoices(p.choices) ? 1 : Math.max(1, Math.min(5, doc.choiceColumns?.[p.id] ?? (p.choices.some(c => c.length > 20) ? 1 : 3)));
      const rows = Array.from({ length: Math.ceil(p.choices.length / columns) }, (_, ri) => Array.from({ length: columns }, (_, ci) => {
        const i = ri * columns + ci; return p.choices[i] === undefined ? "" : choiceLabels[i] + " " + p.choices[i];
      }));
      text += nativeTable(rows, 1, false);
    }
    return text;
  };
  const original = await zip.file("Contents/section0.xml")!.async("string");
  const opening = original.slice(0, original.indexOf(">", original.indexOf("<hs:sec")) + 1);
  let sectionPr = original.match(/<hp:secPr[\s\S]*?<\/hp:secPr>/)![0];
  sectionPr = sectionPr.replace(/landscape="[^"]+"/, 'landscape="NARROWLY"').replace(/header="\d+" footer="\d+"/, 'header="0" footer="0"').replace('<hp:pagePr ', '<hp:pagePr width="59528" height="84186" ').replace(/left="8504" right="8504" top="5668" bottom="4252"/, 'left="4252" right="4252" top="4252" bottom="4252"');
  const content = examPages(doc.problems, doc.perPage, doc.problemHeights).map((page, pi) => {
    const logoRuns = doc.brandImage ? picture(doc.brandImage, true).replace(/^<hp:p[^>]*>|<\/hp:p>$/g, "") : "";
    const rowCount = page.capacity / 2, height = Math.floor(66000 / rowCount);
    const rows = Array.from({ length: rowCount }, (_, ri) => `<hp:tr>${[page.left[ri], page.right[ri]].map((p, ci) => `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="1" dirty="0" borderFillIDRef="${ci === 0 ? 3 : 1}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${problem(p)}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="25512" height="${height}"/><hp:cellMargin left="${ci ? 1700 : 0}" right="${ci ? 0 : 1700}" top="700" bottom="700"/></hp:tc>`).join("")}</hp:tr>`).join("");
    const titleParagraph = para(doc.title === "MATHTYPING" ? "" : doc.title, false, "17").replaceAll('charPrIDRef="0"', 'charPrIDRef="7"');
    const pageParagraph = para(String(pi + 1), false, "19").replaceAll('charPrIDRef="0"', 'charPrIDRef="8"');
    const logoParagraph = logoRuns ? '<hp:p id="' + (++id) + '" paraPrIDRef="18" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + logoRuns + '</hp:p>' : para("COSMATH");
    const header = nativeTable([[logoParagraph, titleParagraph, pageParagraph]], 4, false, 2800, 51024, true).replace('pageBreak="0"', 'pageBreak="' + (pi > 0 ? 1 : 0) + '"').replace('paraPrIDRef="18"', 'paraPrIDRef="20"');

    return header + `<hp:p id="${++id}" paraPrIDRef="18" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${++id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCount}" colCnt="2" cellSpacing="0" borderFillIDRef="1" noAdjust="0"><hp:sz width="51024" height="66000" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${rows}</hp:tbl></hp:run></hp:p>`;
  }).join("");
  zip.file("Contents/section0.xml", `${opening}<hp:p id="1" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${sectionPr}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:t/></hp:run></hp:p>${content}</hs:sec>`);
  let header = await zip.file("Contents/header.xml")!.async("string");
  const border = header.match(/<hh:borderFill id="1"[\s\S]*?<\/hh:borderFill>/)![0];
  const centerBorder = border.replace('id="1"', 'id="3"').replace('<hh:rightBorder type="None"', '<hh:rightBorder type="Solid"');
  const topBorder = border.replace('id="1"', 'id="4"').replace('<hh:bottomBorder type="None"', '<hh:bottomBorder type="Solid"');
  const tableBorder = border.replace('id="1"', 'id="5"').replace(/Border type="None"/g, 'Border type="Solid"');
  header = header.replace('<hh:borderFills itemCnt="2">', '<hh:borderFills itemCnt="5">').replace('</hh:borderFills>', `${centerBorder}${topBorder}${tableBorder}</hh:borderFills>`);
  const pr = header.match(/<hh:paraPr id="3"[\s\S]*?<\/hh:paraPr>/)![0].replace('id="3"', 'id="16"').replace(/borderFillIDRef="2"/, 'borderFillIDRef="4"');
  const centerPr = pr.replace('id="16"', 'id="17"').replace(/horizontal="[^"]+"/, 'horizontal="CENTER"').replace('borderFillIDRef="4"', 'borderFillIDRef="2"');
  const anchorPr = pr.replace('id="16"', 'id="18"').replace(/value="160"/g, 'value="100"').replace('borderFillIDRef="4"', 'borderFillIDRef="2"');
  const headerAnchorPr = anchorPr.replace('id="18"', 'id="20"').replace('keepWithNext="0"', 'keepWithNext="1"');
  const rightPr = centerPr.replace('id="17"', 'id="19"').replace('horizontal="CENTER"', 'horizontal="RIGHT"');
  const charPr = header.match(/<hh:charPr id="0"[\s\S]*?<\/hh:charPr>/)![0];
  const titleChar = charPr.replace('id="0"', 'id="7"').replace('height="1000"', 'height="' + Math.max(700, Math.min(1400, Math.floor(62000 / Math.max(1, doc.title.length)))) + '"').replace('</hh:charPr>', '<hh:bold/></hh:charPr>');
  const pageChar = charPr.replace('id="0"', 'id="8"').replace('height="1000"', 'height="1800"');
  header = header.replace(/<hh:charProperties itemCnt="(\d+)">/, (_, count) => '<hh:charProperties itemCnt="' + (Number(count) + 2) + '">').replace('</hh:charProperties>', titleChar + pageChar + '</hh:charProperties>');
  header = header.replace('<hh:paraProperties itemCnt="16">', '<hh:paraProperties itemCnt="21">').replace('</hh:paraProperties>', pr + centerPr + anchorPr + rightPr + headerAnchorPr + '</hh:paraProperties>').replace('paraPrIDRef="6750318"', 'paraPrIDRef="3"');
  zip.file("Contents/header.xml", header);
  let hpf = await zip.file("Contents/content.hpf")!.async("string");
  hpf = hpf.replace(/<opf:title\s*\/>/, `<opf:title>${xml(doc.title)}</opf:title>`).replace('</opf:manifest>', `${images.join("")}</opf:manifest>`);
  zip.file("Contents/content.hpf", hpf);
  zip.file("Preview/PrvText.txt", doc.problems.map(p => `${p.number}. ${p.question}`).join("\n\n"));
  // OCF requires an uncompressed mimetype entry first.
  const packed = new JSZip();
  packed.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  for (const name of Object.keys(zip.files)) if (name !== "mimetype" && !zip.files[name].dir) packed.file(name, await zip.files[name].async("uint8array"));
  return packed.generateAsync({ type: "blob", mimeType: "application/hwp+zip", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_"); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
