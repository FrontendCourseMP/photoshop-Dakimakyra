import { processLevels, neutralLevel } from "../js/levels-engine.js";
import { applyFilter, FILTERS } from "../js/image-filters.js";
import { resizeRgba } from "../js/resample.js";
import { projectChannels } from "../js/view-modes.js";

// Проверки взаимодействуют только с публичным DOM автономной сборки.
const frame = document.querySelector("#editor");
const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await new Promise((resolve) => {
  if (frame.contentDocument?.readyState === "complete") resolve();
  else frame.addEventListener("load", resolve, { once: true });
});
const win = frame.contentWindow;
const doc = frame.contentDocument;
const $ = (selector) => doc.querySelector(selector);
const errors = [];
win.addEventListener("error", (event) => errors.push(event.message));
win.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
const click = (selector) => $(selector).click();
function change(selector, value, event = "input") {
  $(selector).value = value;
  $(selector).dispatchEvent(new win.Event(event, { bubbles: true }));
}
function check(selector, checked) {
  $(selector).checked = checked;
  $(selector).dispatchEvent(new win.Event("change", { bubbles: true }));
}
async function until(condition, message) {
  for (let i = 0; i < 160; i++) {
    if (condition()) return;
    await pause(25);
  }
  throw new Error(message);
}
const canvasBytes = () => $("#artboard").getContext("2d").getImageData(0, 0, $("#artboard").width, $("#artboard").height).data;
const same = (actual, expected) => actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) <= 1);
let fixture;
let original;
async function loadFixture() {
  const transfer = new win.DataTransfer();
  transfer.items.add(new win.File([fixture], "window-test.png", { type: "image/png" }));
  $("#filePicker").files = transfer.files;
  $("#filePicker").dispatchEvent(new win.Event("change", { bubbles: true }));
  await until(() => $("#statusText").textContent === "window-test.png открыт", "файл не открылся");
  change("#zoomSlider", "100");
  await pause();
}
async function makeFixture() {
  const canvas = doc.createElement("canvas");
  canvas.width = 8; canvas.height = 6;
  const bytes = new win.Uint8ClampedArray(8 * 6 * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = 30 + (i * 7) % 180;
    bytes[i + 1] = 60 + (i * 3) % 150;
    bytes[i + 2] = 90 + (i * 5) % 140;
    bytes[i + 3] = 255;
  }
  canvas.getContext("2d").putImageData(new win.ImageData(bytes, 8, 6), 0, 0);
  fixture = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await loadFixture();
  original = new Uint8ClampedArray(canvasBytes());
}
const levelSettings = { master: { shadow: 0, gamma: 2, highlight: 255 } };
const filterSettings = { type: "kernel", matrix: [...FILTERS.box.matrix], channels: [0, 1, 2, 3], edge: "extend" };
function editLevels() { click("#levelsTool"); change("#gammaNumber", "2"); }
function editFilter() { click("#filterTool"); change("#filterPreset", "box", "change"); }
async function applyFilterUI() {
  click("#filterApply");
  await until(() => !$("#filterDialog").open, "фильтр не применился");
  await pause();
}

const tests = [
  ["Загрузка PNG через стандартное поле файла", makeFixture],
  ["Четыре режима с миниатюрами и восстановлением цвета", async () => {
    assert(doc.querySelectorAll("#modeCards canvas").length === 4, "нужны 4 миниатюры");
    for (const [mode, count] of [["gray", 1], ["gray-alpha", 2], ["rgb", 3], ["rgba", 4]]) {
      click(`[data-mode="${mode}"]`); await pause();
      assert(doc.querySelectorAll("#channelCards button").length === count, "неверное число каналов");
      assert(same(canvasBytes(), projectChannels(original, mode)), `неверный вид ${mode}`);
    }
  }],
  ["Все три окна открываются без блокировки страницы", async () => {
    click("#levelsTool"); click("#resizeTool"); click("#filterTool");
    await pause(250);
    assert(doc.querySelectorAll("dialog[open]").length === 3, "окна не открылись вместе");
    assert(doc.querySelectorAll(":modal").length === 0, "страница заблокирована модальным окном");
    click("#pickerTool");
    const rect = $("#artboard").getBoundingClientRect();
    $("#artboard").dispatchEvent(new win.MouseEvent("mousedown", { button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    assert(!$("#pixelResult").hidden && $("#coordinateValue").textContent === "X 4, Y 3", "пипетка недоступна");
    change("#zoomSlider", "200"); await pause();
    assert($("#artboard").width === 16, "масштаб не работает");
    change("#zoomSlider", "100");
    click('[data-mode="gray"]'); await pause();
    assert(doc.querySelectorAll("#channelCards button").length === 1, "режим заблокирован");
    click('[data-mode="rgba"]');
  }],
  ["Перемещение окна и Escape закрывают только верхнее", async () => {
    const header = $("#resizeDialog header");
    header.focus();
    const before = $("#resizeDialog").getBoundingClientRect().left;
    header.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert($("#resizeDialog").getBoundingClientRect().left < before, "окно не переместилось");
    header.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!$("#resizeDialog").open && $("#levelsDialog").open && $("#filterDialog").open, "закрыты лишние окна");
  }],
  ["Окно можно свернуть и вернуть без потери настроек", async () => {
    change("#gammaNumber", "2");
    click("#levelsDialog .fold-window");
    assert($("#levelsDialog").open && $("#levelsDialog").getBoundingClientRect().height < 110, "окно не свернулось");
    click("#levelsDialog .fold-window");
    assert($("#gammaNumber").value === "2.00", "настройка потеряна");
  }],
  ["Предпросмотры независимы, отмена не удаляет другой", async () => {
    editLevels(); await pause();
    const levels = new Uint8ClampedArray(canvasBytes());
    assert(!same(levels, original), "уровни не изменили предпросмотр");
    editFilter(); await pause(350);
    click("#levelsTool"); await pause();
    assert(same(canvasBytes(), levels), "фильтр затёр предпросмотр уровней");
    check("#levelsPreview", false); await pause();
    assert(same(canvasBytes(), original), "выключенный предпросмотр не вернул исходник");
    check("#levelsPreview", true); await pause();
    click("#filterCancel"); await pause();
    assert(same(canvasBytes(), levels), "отмена фильтра стёрла предпросмотр уровней");
    click("#levelsCancel"); await pause();
    assert(same(canvasBytes(), original), "отмена изменила документ");
  }],
  ["Уровни → фильтр: обе применённые коррекции сохранены", async () => {
    editLevels(); editFilter();
    click("#levelsApply");
    assert($("#filterPreset").value === "box", "настройки фильтра сбросились");
    await applyFilterUI();
    const expected = applyFilter(processLevels(original, "rgba", levelSettings), 8, 6, filterSettings);
    assert(same(canvasBytes(), expected), "потеряна первая коррекция");
  }],
  ["Фильтр → уровни: обратный порядок сохраняет обе правки", async () => {
    await loadFixture(); editLevels(); editFilter();
    await applyFilterUI();
    assert($("#gammaNumber").value === "2.00", "настройки уровней сбросились");
    click("#levelsApply"); await pause();
    const expected = processLevels(applyFilter(original, 8, 6, filterSettings), "rgba", levelSettings);
    assert(same(canvasBytes(), expected), "потерян фильтр");
  }],
  ["Размер: смена единиц не меняет целевые размеры", async () => {
    await loadFixture(); click("#resizeTool");
    change("#resizeUnits", "percent", "change");
    assert($("#resizeWidth").value === "100" && $("#resizeHeight").value === "100", "пиксели неверно переведены в проценты");
    change("#resizeUnits", "pixels", "change");
    assert($("#resizeWidth").value === "8" && $("#resizeHeight").value === "6", "пиксели не восстановлены");
    change("#resizeWidth", "0.4");
    assert(!$("#resizeError").hidden, "принята дробная ширина в пикселях");
    click("#resizeCancel");
  }],
  ["Изменение размера при открытых уровнях и фильтре", async () => {
    editLevels(); editFilter(); click("#resizeTool");
    change("#resizeWidth", "16");
    $("#resizeForm").requestSubmit();
    await until(() => $("#sizeValue").textContent === "16 × 12 px", "размер не изменился");
    click("#levelsApply"); await applyFilterUI();
    const expected = applyFilter(processLevels(resizeRgba(original, 8, 6, 16, 12), "rgba", levelSettings), 16, 12, filterSettings);
    assert(same(canvasBytes(), expected), "буферы окон сохранили старую геометрию");
  }],
  ["Выключенный канал остаётся выключенным после Apply", async () => {
    await loadFixture(); click('[data-channel="green"]'); click("#levelsTool"); click("#levelsApply"); await pause();
    assert($('[data-channel="green"]').getAttribute("aria-pressed") === "false", "состояние канала сброшено");
    assert(canvasBytes()[1] === 0, "зелёный виден");
    click("#enableAllChannels");
  }],
  ["Пипетка учитывает предпросмотр и режим Grayscale", async () => {
    editLevels(); click('[data-mode="gray"]'); await pause();
    if ($("#pickerTool").getAttribute("aria-pressed") !== "true") click("#pickerTool");
    const rect = $("#artboard").getBoundingClientRect();
    $("#artboard").dispatchEvent(new win.MouseEvent("mousedown", { button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    const bytes = canvasBytes();
    const offset = (3 * 8 + 4) * 4;
    assert($("#rgbValue").textContent === Array.from(bytes.slice(offset, offset + 3)).join(", "), "пипетка не совпадает с предпросмотром");
    click("#levelsCancel");
  }],
  ["Все встроенные примеры по-прежнему открываются", async () => {
    for (const name of ["gradient", "mask", "vertical"]) {
      click(`[data-sample="${name}"]`); await pause();
      assert($("#fileName").textContent === `${name}-demo.gb7`, `не работает ${name}`);
    }
  }],
  ["Новый файл отменяет все старые окна и Worker", async () => {
    editLevels(); editFilter(); click("#resizeTool"); click("#filterApply");
    click('[data-sample="mask"]'); await pause(450);
    assert(doc.querySelectorAll("dialog[open]").length === 0, "остались старые окна");
    assert($("#fileName").textContent === "mask-demo.gb7", "старый расчёт перезаписал новый файл");
    change("#zoomSlider", "100"); await pause();
    assert($("#artboard").width === 640 && $("#artboard").height === 420, "неверный буфер нового файла");
  }],
  ["Запасной асинхронный режим без Worker", async () => {
    await loadFixture();
    const NativeWorker = win.Worker;
    win.Worker = class { constructor() { throw new Error("Тест недоступного Worker"); } };
    try {
      editFilter();
      await applyFilterUI();
      assert(same(canvasBytes(), applyFilter(original, 8, 6, filterSettings)), "резервный расчёт неверен");
    } finally { win.Worker = NativeWorker; }
  }],
  ["Без ошибок JavaScript", () => assert(errors.length === 0, errors.join("; "))],
];
let passed = 0;
for (const [name, test] of tests) {
  const row = document.createElement("li");
  try { await test(); passed++; row.className = "pass"; row.textContent = `✓ ${name}`; }
  catch (error) { row.className = "fail"; row.textContent = `✕ ${name}: ${error.message}`; }
  document.querySelector("#results").append(row);
}
document.querySelector("#summary").textContent = `Пройдено ${passed} / ${tests.length}`;
document.body.dataset.complete = "true";
