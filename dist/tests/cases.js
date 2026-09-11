import { encodeGB7, decodeGB7, ImageFormatError } from "../js/formats.js";
import { rgbToHex, rgbToLab } from "../js/color-space.js";
import { resizeRgba, fitScale, INTERPOLATORS } from "../js/resample.js";
import { neutralLevel, makeLut, histogram, processLevels } from "../js/levels-engine.js";
import { FILTERS, applyFilter, applyFilterInSlices } from "../js/image-filters.js";
import { createDemoImage } from "../js/demo-images.js";
import { VIEW_MODES, grayValue, projectChannels } from "../js/view-modes.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function close(actual, expected, tolerance, label) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}`);
}

function rgba(values) {
  return new Uint8ClampedArray(values);
}

export async function runCases(report = () => {}) {
  const cases = [
    ["Режимы: 1, 2, 3 и 4 канала", () => {
      assert(Object.values(VIEW_MODES).every((mode, i) => mode.channels.length === i + 1), "неверный набор режимов");
    }],
    ["Режимы: серый учитывает все RGB-компоненты", () => {
      const source = rgba([0, 255, 0, 61]);
      const output = projectChannels(source, "gray");
      assert(output[0] === 182 && output[1] === 182 && output[2] === 182 && output[3] === 255, "неверный серый");
      assert(grayValue(255, 255, 255) === 255, "неверный белый");
    }],
    ["Режимы: переключение не удаляет RGB и Alpha", () => {
      const source = rgba([20, 190, 80, 63]);
      const before = [...source];
      for (const mode of Object.keys(VIEW_MODES)) projectChannels(source, mode);
      assert(source.every((v, i) => v === before[i]), "источник изменился");
      assert(projectChannels(source, "rgba").every((v, i) => v === before[i]), "цвет или маска потеряны");
      assert(projectChannels(source, "gray-alpha")[3] === 63, "нет полупрозрачности");
    }],
    ["Каналы: отключение зелёного", () => {
      const output = projectChannels(rgba([70, 180, 110, 100]), "rgba", new Set(["red", "blue", "alpha"]));
      assert(output.join() === "70,0,110,100", "канал не отключён");
    }],
    ["Каналы: только Alpha показывает непрозрачную маску", () => {
      for (const mode of ["gray-alpha", "rgba"]) {
        const output = projectChannels(rgba([70, 180, 110, 100]), mode, new Set(["alpha"]));
        assert(output.join() === "100,100,100,255", "неверная маска");
      }
    }],
    ["Каналы: всё выключено, исходник сохранён", () => {
      const source = rgba([70, 180, 110, 100]);
      assert(projectChannels(source, "rgba", new Set()).join() === "0,0,0,255", "неверный пустой вид");
      assert(source.join() === "70,180,110,100", "источник изменился");
    }],
    ["GB7: сигнатура, размеры и big-endian", () => {
      const result = encodeGB7({ width: 2, height: 1, pixels: rgba([0, 0, 0, 255, 255, 255, 255, 255]) });
      assert(result.bytes.length === 14, "неверная длина");
      assert([0x47, 0x42, 0x37, 0x1d].every((byte, index) => result.bytes[index] === byte), "неверная сигнатура");
      assert(result.bytes[6] === 0 && result.bytes[7] === 2 && result.bytes[8] === 0 && result.bytes[9] === 1, "размер не big-endian");
    }],
    ["GB7: кодирование и декодирование крайних оттенков", () => {
      const encoded = encodeGB7({ width: 2, height: 1, pixels: rgba([0, 0, 0, 255, 255, 255, 255, 255]) });
      const decoded = decodeGB7(encoded.bytes.buffer);
      assert(decoded.pixels[0] === 0 && decoded.pixels[4] === 255, "изменились чёрный или белый");
    }],
    ["GB7: двоичная маска", () => {
      const encoded = encodeGB7({ width: 2, height: 1, pixels: rgba([90, 90, 90, 0, 180, 180, 180, 255]) });
      const decoded = decodeGB7(encoded.bytes.buffer);
      assert(encoded.masked && encoded.bytes[5] === 1, "нет флага маски");
      assert(decoded.pixels[3] === 0 && decoded.pixels[7] === 255, "маска прочитана неверно");
    }],
    ["GB7: повреждённый файл отклоняется", () => {
      let failed = false;
      try { decodeGB7(new Uint8Array(12).buffer); } catch (error) { failed = error instanceof ImageFormatError; }
      assert(failed, "ошибка не обнаружена");
    }],
    ["Примеры: все кнопки создают автономные GB7", () => {
      ["gradient", "mask", "vertical"].forEach((key) => {
        const demo = createDemoImage(key);
        assert(demo.image.format === "gb7", `неверный формат ${key}`);
        assert(demo.pixels.length === demo.image.width * demo.image.height * 4, `неверный размер ${key}`);
      });
    }],
    ["CIELAB: чёрный и белый", () => {
      const black = rgbToLab(0, 0, 0);
      const white = rgbToLab(255, 255, 255);
      close(black.l, 0, 0.01, "L чёрного");
      close(white.l, 100, 0.01, "L белого");
      close(white.a, 0, 0.02, "a белого");
    }],
    ["CIELAB и HEX: красный", () => {
      const red = rgbToLab(255, 0, 0);
      close(red.l, 53.24, 0.05, "L красного");
      close(red.a, 80.09, 0.05, "a красного");
      assert(rgbToHex(255, 0, 0) === "#FF0000", "неверный HEX");
    }],
    ["Ближайший сосед: пиксели не смешиваются", () => {
      const source = rgba([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]);
      const output = resizeRgba(source, 2, 2, 4, 4, "nearest");
      assert(output[0] === 255 && output[1] === 0 && output[(3 * 4 + 3) * 4] === 255, "неверные блоки");
    }],
    ["Билинейная интерполяция: четыре соседа смешиваются", () => {
      const source = rgba([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255]);
      const output = resizeRgba(source, 2, 2, 3, 3, "bilinear");
      const center = (1 * 3 + 1) * 4;
      close(output[center], 128, 1, "красный центра");
      close(output[center + 1], 128, 1, "зелёный центра");
    }],
    ["Билинейная интерполяция: альфа-канал", () => {
      const output = resizeRgba(rgba([10, 10, 10, 0, 10, 10, 10, 255]), 2, 1, 3, 1, "bilinear");
      close(output[7], 128, 1, "альфа центра");
    }],
    ["Реестр интерполяции содержит два собственных метода", () => {
      assert(INTERPOLATORS.nearest && INTERPOLATORS.bilinear, "методы не зарегистрированы");
    }],
    ["Автомасштаб учитывает отступ и диапазон", () => {
      close(fitScale(1000, 500, 600, 500), 0.5, 0.001, "вписывание");
      assert(fitScale(10, 10, 1000, 1000) === 3, "верхний предел");
      assert(fitScale(10000, 10000, 200, 200) === 0.12, "нижний предел");
    }],
    ["Уровни: нейтральная LUT", () => {
      const lut = makeLut(neutralLevel(255));
      assert(lut[0] === 0 && lut[64] === 64 && lut[255] === 255, "LUT меняет значения");
    }],
    ["Уровни: гамма осветляет и затемняет", () => {
      const light = makeLut({ shadow: 0, gamma: 0.5, highlight: 255 });
      const dark = makeLut({ shadow: 0, gamma: 2, highlight: 255 });
      assert(light[128] > 128 && dark[128] < 128, "гамма работает неверно");
    }],
    ["Уровни: Master не меняет Alpha", () => {
      const output = processLevels(rgba([80, 120, 200, 77]), "rgba", { master: { shadow: 50, gamma: 1, highlight: 220 } });
      assert(output[3] === 77, "изменился alpha");
      assert(output[0] !== 80, "не изменился RGB");
    }],
    ["Уровни: скрытая прозрачность сохраняется", () => {
      const source = rgba([80, 120, 200, 77]);
      assert(processLevels(source, "rgb", { master: neutralLevel() })[3] === 77, "скрытая alpha потеряна");
    }],
    ["Уровни: отдельный Alpha", () => {
      const output = processLevels(rgba([80, 120, 200, 128]), "rgba", { master: neutralLevel(), alpha: { shadow: 128, gamma: 1, highlight: 255 } });
      assert(output[0] === 80 && output[3] === 0, "каналы не разделены");
    }],
    ["Гистограмма: Master и Alpha", () => {
      const pixels = rgba([0, 0, 0, 0, 255, 255, 255, 255]);
      const master = histogram(pixels, "master");
      const alpha = histogram(pixels, "alpha");
      assert(master[0] === 1 && master[255] === 1 && alpha[0] === 1 && alpha[255] === 1, "неверные столбцы");
    }],
    ["Фильтры: обязательные предустановки", () => {
      ["identity", "sharpen", "gaussian", "box", "prewittH", "prewittV"].forEach((key) => assert(FILTERS[key], `нет ${key}`));
    }],
    ["Фильтры: тождественное ядро", () => {
      const source = rgba([10, 20, 30, 255]);
      const output = applyFilter(source, 1, 1, { type: "kernel", matrix: [...FILTERS.identity.matrix], channels: [0, 1, 2], edge: "extend" });
      assert(output.every((value, index) => value === source[index]), "пиксель изменился");
    }],
    ["Фильтры: повышение резкости", () => {
      const source = new Uint8ClampedArray(3 * 3 * 4).fill(0);
      for (let index = 3; index < source.length; index += 4) source[index] = 255;
      source[(1 * 3 + 1) * 4] = 100;
      const output = applyFilter(source, 3, 3, { type: "kernel", matrix: [...FILTERS.sharpen.matrix], channels: [0], edge: "extend" });
      assert(output[(1 * 3 + 1) * 4] === 255, "центр не усилен");
    }],
    ["Фильтры: три способа заполнения края", () => {
      const source = rgba([90, 0, 0, 255]);
      const matrix = Array(9).fill(1 / 9);
      const black = applyFilter(source, 1, 1, { type: "kernel", matrix, channels: [0], edge: "black" });
      const white = applyFilter(source, 1, 1, { type: "kernel", matrix, channels: [0], edge: "white" });
      const extend = applyFilter(source, 1, 1, { type: "kernel", matrix, channels: [0], edge: "extend" });
      assert(black[0] === 10 && white[0] === 237 && extend[0] === 90, "стратегии не различаются");
    }],
    ["Медианный фильтр удаляет одиночный шум", () => {
      const source = new Uint8ClampedArray(3 * 3 * 4).fill(0);
      for (let index = 3; index < source.length; index += 4) source[index] = 255;
      source[(1 * 3 + 1) * 4] = 255;
      const output = applyFilter(source, 3, 3, { type: "median", matrix: [...FILTERS.median.matrix], channels: [0], edge: "extend" });
      assert(output[(1 * 3 + 1) * 4] === 0, "шум остался");
    }],
    ["Асинхронная фильтрация совпадает с обычной", async () => {
      const source = rgba([0, 0, 0, 255, 100, 0, 0, 255, 200, 0, 0, 255]);
      const options = { type: "kernel", matrix: [...FILTERS.gaussian.matrix], channels: [0], edge: "extend" };
      const regular = applyFilter(source, 3, 1, options);
      const asyncResult = await applyFilterInSlices(source, 3, 1, options, { rowsPerSlice: 1 });
      assert(regular.every((value, index) => value === asyncResult[index]), "результаты различаются");
    }],
  ];

  let passed = 0;
  const failures = [];
  for (const [name, test] of cases) {
    try {
      await test();
      passed += 1;
      report({ name, passed: true });
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      report({ name, passed: false, message: error.message });
    }
  }
  return { passed, total: cases.length, failures };
}
