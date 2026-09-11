import { runCases } from "./dist/tests/cases.js";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./dist/js/app.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./dist/index.html", import.meta.url), "utf8");
const bundleSource = readFileSync(new URL("./dist/js/app.bundle.js", import.meta.url), "utf8");
const uiDeclaration = appSource.match(/const ui = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || "";
const declaredUiKeys = new Set([...uiDeclaration.matchAll(/\b([A-Za-z]\w*)\s*:\s*byId\(/g)].map((match) => match[1]));
const referencedUiKeys = new Set([...appSource.matchAll(/\bui\.([A-Za-z]\w*)/g)].map((match) => match[1]));
const missingUiKeys = [...referencedUiKeys].filter((key) => !declaredUiKeys.has(key));

if (missingUiKeys.length) {
  console.error(`В объекте ui не объявлены элементы: ${missingUiKeys.join(", ")}`);
  process.exitCode = 1;
}

const classicBuildErrors = [];
if (!indexSource.includes('<script src="./js/app.bundle.js"></script>')) classicBuildErrors.push("index.html не подключает автономную сборку");
if (/type=["']module["']/.test(indexSource)) classicBuildErrors.push("index.html всё ещё использует JavaScript-модули");
if (/(^|\n)\s*(?:import|export)\s/m.test(bundleSource)) classicBuildErrors.push("в app.bundle.js остались модульные инструкции");
if (classicBuildErrors.length) {
  console.error(classicBuildErrors.join("\n"));
  process.exitCode = 1;
}

const result = await runCases();
if (result.failures.length) {
  console.error(result.failures.join("\n"));
  process.exitCode = 1;
} else if (!missingUiKeys.length && !classicBuildErrors.length) {
  console.log(`Все проверки пройдены: ${result.passed}/${result.total}; автономная HTML-сборка корректна`);
}
