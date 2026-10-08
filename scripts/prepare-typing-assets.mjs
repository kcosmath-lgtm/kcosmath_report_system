import { copyFileSync, cpSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/typing/", import.meta.url), { recursive: true });
copyFileSync(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/typing/pdf.worker.min.mjs", import.meta.url));

for (const directory of ["wasm", "cmaps", "standard_fonts"]) cpSync(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url), new URL(`../public/typing/${directory}/`, import.meta.url), { recursive: true });
