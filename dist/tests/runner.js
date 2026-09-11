import { runCases } from "./cases.js";

const list = document.getElementById("results");
const summary = document.getElementById("summary");
const result = await runCases(({ name, passed, message }) => {
  const item = document.createElement("li");
  item.textContent = passed ? `PASS: ${name}` : `FAIL: ${name}: ${message}`;
  if (!passed) item.className = "fail";
  list.append(item);
});
summary.textContent = result.failures.length ? `Ошибок: ${result.failures.length}` : `Все проверки пройдены: ${result.passed}/${result.total}`;
