import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/typing/", import.meta.url), { recursive: true });
copyFileSync(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/typing/pdf.worker.min.mjs", import.meta.url));
