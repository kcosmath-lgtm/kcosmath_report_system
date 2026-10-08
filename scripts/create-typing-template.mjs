import { BlankFileMaker, HWPXWriter } from "ownhwpx";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/typing/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/typing/blank.hwpx", import.meta.url), await HWPXWriter.toBytes(BlankFileMaker.make()));
