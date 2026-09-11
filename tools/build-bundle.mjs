import { readFileSync, writeFileSync } from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const sources = [
  "dist/js/color-space.js",
  "dist/js/formats.js",
  "dist/js/resample.js",
  "dist/js/levels-engine.js",
  "dist/js/image-filters.js",
  "dist/js/demo-images.js",
  "dist/js/view-modes.js",
  "dist/js/tool-windows.js",
  "dist/js/app.js",
];

function makeClassicScript(sourcePath) {
  return readFileSync(new URL(sourcePath, projectRoot), "utf8")
    .replace(/^import\s+[^;]+;\s*$/gm, "")
    .replace(/\bexport\s+/g, "")
    .trim();
}

const body = sources.map((sourcePath) => `\n/* ${sourcePath} */\n${makeClassicScript(sourcePath)}`).join("\n");
const bundle = `/* Автономная сборка Raster Room. Создаётся командой npm run build. */\n(() => {\n  "use strict";\n${body}\n})();\n`;

writeFileSync(new URL("dist/js/app.bundle.js", projectRoot), bundle);
console.log(`Собран dist/js/app.bundle.js: ${bundle.length} символов`);
