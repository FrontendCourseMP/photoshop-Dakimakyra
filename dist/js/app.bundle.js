/* Автономная сборка Raster Room. Создаётся командой npm run build. */
(() => {
  "use strict";

/* dist/js/color-space.js */
function linearComponent(component) {
  const value = Math.min(255, Math.max(0, component)) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function labCurve(value) {
  const border = (6 / 29) ** 3;
  return value > border ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29;
}

function rgbToLab(red, green, blue) {
  const r = linearComponent(red);
  const g = linearComponent(green);
  const b = linearComponent(blue);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = labCurve(x);
  const fy = labCurve(y);
  const fz = labCurve(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function relativeLuminance(red, green, blue) {
  return 0.2126 * linearComponent(red) + 0.7152 * linearComponent(green) + 0.0722 * linearComponent(blue);
}

/* dist/js/formats.js */
const GB7_MAGIC = Object.freeze([0x47, 0x42, 0x37, 0x1d]);
const GB7_HEADER = 12;
const MAX_PIXELS = 64_000_000;

class ImageFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageFormatError";
  }
}

function beginsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function detectFormat(bytes) {
  if (bytes.length >= 4 && beginsWith(bytes, GB7_MAGIC)) return "gb7";
  if (bytes.length >= 8 && beginsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytes.length >= 3 && beginsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  return null;
}

function decodeGB7(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < GB7_HEADER) throw new ImageFormatError("В файле GB7 нет полного заголовка.");
  if (!beginsWith(bytes, GB7_MAGIC)) throw new ImageFormatError("Сигнатура GB7 не найдена.");
  if (bytes[4] !== 1) throw new ImageFormatError(`Версия GB7 ${bytes[4]} не поддерживается.`);
  if ((bytes[5] & 0xfe) !== 0) throw new ImageFormatError("В GB7 заняты зарезервированные биты флага.");

  const header = new DataView(buffer);
  const width = header.getUint16(6);
  const height = header.getUint16(8);
  const reserved = header.getUint16(10);
  const count = width * height;

  if (!width || !height) throw new ImageFormatError("Размер GB7 должен быть больше нуля.");
  if (reserved !== 0) throw new ImageFormatError("Зарезервированное поле GB7 должно быть нулевым.");
  if (count > MAX_PIXELS) throw new ImageFormatError("GB7 превышает ограничение в 64 мегапикселя.");
  if (bytes.length !== GB7_HEADER + count) {
    throw new ImageFormatError("Длина данных GB7 не совпадает с шириной и высотой.");
  }

  const masked = (bytes[5] & 1) === 1;
  const pixels = new Uint8ClampedArray(count * 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const source = bytes[GB7_HEADER + pixel];
    const gray = Math.round(((source & 0x7f) / 127) * 255);
    const target = pixel * 4;
    pixels[target] = gray;
    pixels[target + 1] = gray;
    pixels[target + 2] = gray;
    pixels[target + 3] = masked && (source & 0x80) === 0 ? 0 : 255;
  }

  return { width, height, pixels, masked, version: 1 };
}

function encodeGB7(image) {
  const { width, height, pixels } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ImageFormatError("Нельзя сохранить изображение без размера.");
  }
  if (width > 0xffff || height > 0xffff) {
    throw new ImageFormatError("Сторона GB7 не может превышать 65535 пикселей.");
  }
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new ImageFormatError("Массив пикселей не соответствует размеру изображения.");
  }

  let masked = false;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) {
      masked = true;
      break;
    }
  }

  const output = new Uint8Array(GB7_HEADER + width * height);
  output.set(GB7_MAGIC);
  output[4] = 1;
  output[5] = masked ? 1 : 0;
  const header = new DataView(output.buffer);
  header.setUint16(6, width);
  header.setUint16(8, height);
  header.setUint16(10, 0);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const light = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
    const gray = Math.round((light / 255) * 127);
    const visible = masked && pixels[index + 3] >= 128 ? 0x80 : 0;
    output[GB7_HEADER + pixel] = gray | visible;
  }

  return { bytes: output, masked };
}

function readRasterHeader(bytes, format) {
  return format === "png" ? readPngHeader(bytes) : readJpegHeader(bytes);
}

function readPngHeader(bytes) {
  if (bytes.length < 29) throw new ImageFormatError("Заголовок PNG повреждён.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const channelCount = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!width || !height || !channelCount) throw new ImageFormatError("Тип цвета PNG не поддерживается.");
  const totalDepth = colorType === 3 ? bitDepth : bitDepth * channelCount;
  return { width, height, bitDepth, colorType, channelCount, totalDepth };
}

function readJpegHeader(bytes) {
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let cursor = 2;
  while (cursor < bytes.length) {
    while (cursor < bytes.length && bytes[cursor] !== 0xff) cursor += 1;
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) break;
    const marker = bytes[cursor];
    cursor += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= bytes.length) break;
    const length = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (length < 2 || cursor + length > bytes.length) throw new ImageFormatError("Структура JPEG повреждена.");
    if (frames.has(marker)) {
      const bitDepth = bytes[cursor + 2];
      const height = (bytes[cursor + 3] << 8) | bytes[cursor + 4];
      const width = (bytes[cursor + 5] << 8) | bytes[cursor + 6];
      const channelCount = bytes[cursor + 7];
      return { width, height, bitDepth, channelCount, totalDepth: bitDepth * channelCount };
    }
    cursor += length;
  }
  throw new ImageFormatError("В JPEG не найден сегмент с размерами.");
}

/* dist/js/resample.js */
const SCALE_LIMITS = Object.freeze({ minimum: 0.12, maximum: 3 });

function assertImage(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isInteger(value) && value > 0)) {
    throw new TypeError("Размеры должны быть положительными целыми числами.");
  }
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== sourceWidth * sourceHeight * 4) {
    throw new TypeError("Неверный размер массива RGBA.");
  }
}

function nearest(pixels, sw, sh, tw, th) {
  const result = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / th));
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / tw));
      const from = (sy * sw + sx) * 4;
      const to = (y * tw + x) * 4;
      result[to] = pixels[from];
      result[to + 1] = pixels[from + 1];
      result[to + 2] = pixels[from + 2];
      result[to + 3] = pixels[from + 3];
    }
  }
  return result;
}

function bilinear(pixels, sw, sh, tw, th) {
  const result = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sourceY = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / th - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sh - 1, y0 + 1);
    const dy = sourceY - y0;
    for (let x = 0; x < tw; x += 1) {
      const sourceX = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / tw - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sw - 1, x0 + 1);
      const dx = sourceX - x0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      const to = (y * tw + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const upper = pixels[a + channel] * (1 - dx) + pixels[b + channel] * dx;
        const lower = pixels[c + channel] * (1 - dx) + pixels[d + channel] * dx;
        result[to + channel] = Math.round(upper * (1 - dy) + lower * dy);
      }
    }
  }
  return result;
}

const INTERPOLATORS = Object.freeze({
  nearest: Object.freeze({ title: "Ближайший пиксель", note: "Быстро и без сглаживания. Подходит для пиксельной графики.", run: nearest }),
  bilinear: Object.freeze({ title: "Билинейный", note: "Смешивает четыре соседних пикселя и даёт плавные края.", run: bilinear }),
});

function resizeRgba(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight, method = "bilinear") {
  assertImage(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight);
  const engine = INTERPOLATORS[method];
  if (!engine) throw new TypeError("Неизвестный алгоритм интерполяции.");
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return new Uint8ClampedArray(pixels);
  return engine.run(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight);
}

function fitScale(width, height, viewportWidth, viewportHeight, margin = 50) {
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const availableHeight = Math.max(1, viewportHeight - margin * 2);
  return Math.min(SCALE_LIMITS.maximum, Math.max(SCALE_LIMITS.minimum, Math.min(availableWidth / width, availableHeight / height)));
}

function scaledSize(width, height, scale) {
  const safe = Math.min(SCALE_LIMITS.maximum, Math.max(SCALE_LIMITS.minimum, scale));
  return { width: Math.max(1, Math.round(width * safe)), height: Math.max(1, Math.round(height * safe)) };
}

/* dist/js/levels-engine.js */
const GAMMA_RANGE = Object.freeze({ minimum: 0.1, maximum: 9.9 });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function neutralLevel(maximum = 255) {
  return { shadow: 0, gamma: 1, highlight: maximum };
}

function makeLut(settings, maximum = 255) {
  const shadow = clamp(Math.round(settings.shadow), 0, maximum - 1);
  const highlight = clamp(Math.round(settings.highlight), shadow + 1, maximum);
  const gamma = clamp(Number(settings.gamma) || 1, GAMMA_RANGE.minimum, GAMMA_RANGE.maximum);
  const span = highlight - shadow;
  const lut = new Uint8ClampedArray(256);
  for (let input = 0; input < 256; input += 1) {
    const level = (input / 255) * maximum;
    const normalized = clamp((level - shadow) / span, 0, 1);
    lut[input] = Math.round((normalized ** gamma) * 255);
  }
  return lut;
}

function histogram(pixels, channel, maximum = 255) {
  const bins = new Uint32Array(maximum + 1);
  const component = { red: 0, gray: 0, green: 1, blue: 2, alpha: 3 }[channel];
  for (let index = 0; index < pixels.length; index += 4) {
    const ratio = channel === "master"
      ? relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2])
      : pixels[index + component] / 255;
    bins[Math.round(clamp(ratio, 0, 1) * maximum)] += 1;
  }
  return bins;
}

function processLevels(pixels, model, settings, maximum = 255) {
  const output = new Uint8ClampedArray(pixels.length);
  const master = makeLut(settings.master || neutralLevel(maximum), maximum);
  const alpha = makeLut(settings.alpha || neutralLevel(maximum), maximum);
  const grayscale = model === "gray" || model === "gray-alpha";
  const carriesAlpha = model === "gray-alpha" || model === "rgba";
  const channelLuts = grayscale
    ? [makeLut(settings.gray || neutralLevel(maximum), maximum)]
    : ["red", "green", "blue"].map((name) => makeLut(settings[name] || neutralLevel(maximum), maximum));

  for (let index = 0; index < pixels.length; index += 4) {
    if (grayscale) {
      const value = channelLuts[0][master[pixels[index]]];
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
    } else {
      output[index] = channelLuts[0][master[pixels[index]]];
      output[index + 1] = channelLuts[1][master[pixels[index + 1]]];
      output[index + 2] = channelLuts[2][master[pixels[index + 2]]];
    }
    output[index + 3] = carriesAlpha ? alpha[pixels[index + 3]] : pixels[index + 3];
  }
  return output;
}

function gammaFromMarker(marker, shadow, highlight) {
  const ratio = clamp((marker - shadow) / Math.max(1, highlight - shadow), 0, 1);
  return ratio <= 0.5
    ? GAMMA_RANGE.minimum * 10 ** (ratio * 2)
    : GAMMA_RANGE.maximum ** ((ratio - 0.5) * 2);
}

function markerFromGamma(gamma, shadow, highlight) {
  const value = clamp(gamma, GAMMA_RANGE.minimum, GAMMA_RANGE.maximum);
  const ratio = value <= 1
    ? Math.log10(value / GAMMA_RANGE.minimum) / 2
    : 0.5 + Math.log(value) / Math.log(GAMMA_RANGE.maximum) / 2;
  return shadow + ratio * (highlight - shadow);
}

/* dist/js/image-filters.js */
const FILTERS = Object.freeze({
  identity: Object.freeze({ label: "Без изменений", type: "kernel", matrix: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]) }),
  sharpen: Object.freeze({ label: "Чёткие детали", type: "kernel", matrix: Object.freeze([0, -1, 0, -1, 5, -1, 0, -1, 0]) }),
  gaussian: Object.freeze({ label: "Мягкое размытие Гаусса", type: "kernel", matrix: Object.freeze([1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16]) }),
  box: Object.freeze({ label: "Равномерное размытие", type: "kernel", matrix: Object.freeze(Array(9).fill(1 / 9)) }),
  prewittH: Object.freeze({ label: "Прюитт: вертикальные границы", type: "kernel", matrix: Object.freeze([-1, 0, 1, -1, 0, 1, -1, 0, 1]) }),
  prewittV: Object.freeze({ label: "Прюитт: горизонтальные границы", type: "kernel", matrix: Object.freeze([-1, -1, -1, 0, 0, 0, 1, 1, 1]) }),
  median: Object.freeze({ label: "Медиана 3×3", type: "median", matrix: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]) }),
});

function verify(pixels, width, height, options) {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) throw new TypeError("Неверный RGBA-буфер.");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new TypeError("Неверный размер изображения.");
  if (!["kernel", "median"].includes(options?.type)) throw new TypeError("Неизвестный фильтр.");
  if (!["extend", "black", "white"].includes(options.edge)) throw new TypeError("Неизвестное заполнение края.");
  if (!Array.isArray(options.channels) || options.channels.length === 0) throw new TypeError("Не выбран ни один канал.");
  if (options.type === "kernel" && (!Array.isArray(options.matrix) || options.matrix.length !== 9 || options.matrix.some((value) => !Number.isFinite(value)))) {
    throw new TypeError("Ядро должно содержать девять чисел.");
  }
}

function sample(pixels, width, height, x, y, channel, edge) {
  if (x >= 0 && y >= 0 && x < width && y < height) return pixels[(y * width + x) * 4 + channel];
  if (edge === "extend") {
    const safeX = Math.max(0, Math.min(width - 1, x));
    const safeY = Math.max(0, Math.min(height - 1, y));
    return pixels[(safeY * width + safeX) * 4 + channel];
  }
  if (channel === 3) return edge === "black" ? 0 : 255;
  return edge === "white" ? 255 : 0;
}

function filterRows(source, output, width, height, options, fromY, toY) {
  const channels = [...new Set(options.channels)];
  for (let y = fromY; y < toY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      for (const channel of channels) {
        if (options.type === "median") {
          const values = [];
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) values.push(sample(source, width, height, x + dx, y + dy, channel, options.edge));
          }
          values.sort((a, b) => a - b);
          output[destination + channel] = values[4];
          continue;
        }
        let sum = 0;
        let cell = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += sample(source, width, height, x + dx, y + dy, channel, options.edge) * options.matrix[cell];
            cell += 1;
          }
        }
        output[destination + channel] = Math.round(sum);
      }
    }
  }
}

function applyFilter(pixels, width, height, options, report = null) {
  verify(pixels, width, height, options);
  const output = new Uint8ClampedArray(pixels);
  const block = Math.max(1, Math.ceil(height / 24));
  for (let row = 0; row < height; row += block) {
    const end = Math.min(height, row + block);
    filterRows(pixels, output, width, height, options, row, end);
    report?.(end / height);
  }
  return output;
}

async function applyFilterInSlices(pixels, width, height, options, controls = {}) {
  verify(pixels, width, height, options);
  const output = new Uint8ClampedArray(pixels);
  const block = Math.max(1, controls.rowsPerSlice || 8);
  for (let row = 0; row < height; row += block) {
    if (controls.cancelled?.()) return null;
    const end = Math.min(height, row + block);
    filterRows(pixels, output, width, height, options, row, end);
    controls.progress?.(end / height);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output;
}

/* dist/js/demo-images.js */
const DEMOS = Object.freeze({
  gradient: Object.freeze({ name: "gradient-demo.gb7", width: 512, height: 320 }),
  mask: Object.freeze({ name: "mask-demo.gb7", width: 640, height: 420 }),
  vertical: Object.freeze({ name: "vertical-demo.gb7", width: 720, height: 1080 }),
});

function gradientPixel(x, y, width, height) {
  const light = Math.round((x / Math.max(1, width - 1)) * 255);
  const visible = y > height * 0.18 && x + y * 0.8 > width * 0.24;
  return { light, alpha: visible ? 255 : 0 };
}

function maskPixel(x, y, width, height) {
  const dx = x - width / 2;
  const dy = y - height / 2;
  const distance = Math.hypot(dx, dy);
  const rings = (Math.floor(distance / 24) % 2) * 118;
  const checker = (Math.floor(x / 52) + Math.floor(y / 52)) % 2;
  const light = Math.min(255, 55 + rings + checker * 62);
  const visible = distance < Math.min(width, height) * 0.43 && !(Math.abs(dx) < 34 && Math.abs(dy) < 120);
  return { light, alpha: visible ? 255 : 0 };
}

function verticalPixel(x, y, width, height) {
  const wave = Math.sin(x / 28 + y / 73) * 38;
  const bands = (Math.floor(x / 90) % 2) * 52;
  const light = Math.max(0, Math.min(255, Math.round(28 + y / height * 150 + wave + bands)));
  const visible = y < height * 0.92 || x > width * 0.2;
  return { light, alpha: visible ? 255 : 0 };
}

const PAINTERS = Object.freeze({ gradient: gradientPixel, mask: maskPixel, vertical: verticalPixel });

function createDemoImage(key) {
  const definition = DEMOS[key];
  const paint = PAINTERS[key];
  if (!definition || !paint) throw new Error("Такого примера нет.");

  const pixels = new Uint8ClampedArray(definition.width * definition.height * 4);
  for (let y = 0; y < definition.height; y += 1) {
    for (let x = 0; x < definition.width; x += 1) {
      const index = (y * definition.width + x) * 4;
      const sample = paint(x, y, definition.width, definition.height);
      pixels[index] = sample.light;
      pixels[index + 1] = sample.light;
      pixels[index + 2] = sample.light;
      pixels[index + 3] = sample.alpha;
    }
  }

  const encoded = encodeGB7({ width: definition.width, height: definition.height, pixels });
  const decoded = decodeGB7(encoded.bytes.buffer);
  return {
    image: {
      name: definition.name,
      format: "gb7",
      label: "GrayBit-7",
      width: definition.width,
      height: definition.height,
      model: decoded.masked ? "gray-alpha" : "gray",
      depth: decoded.masked ? "7 бит + маска" : "7 бит",
      maxLevel: 127,
      fileSize: encoded.bytes.byteLength,
    },
    pixels: decoded.pixels,
  };
}

/* dist/js/view-modes.js */
const VIEW_MODES = Object.freeze({
  gray: { label: "Grayscale", channels: ["gray"] },
  "gray-alpha": { label: "Grayscale + Alpha", channels: ["gray", "alpha"] },
  rgb: { label: "RGB", channels: ["red", "green", "blue"] },
  rgba: { label: "RGB + Alpha", channels: ["red", "green", "blue", "alpha"] },
});

function grayValue(red, green, blue) {
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
}

// Режим просмотра не изменяет ни исходные пиксели, ни метаданные файла.
function projectChannels(source, mode, enabled = new Set(VIEW_MODES[mode].channels)) {
  const result = new Uint8ClampedArray(source.length);
  const keys = VIEW_MODES[mode].channels;
  const alpha = keys.includes("alpha") && enabled.has("alpha");
  const maskOnly = alpha && !keys.some((key) => key !== "alpha" && enabled.has(key));
  for (let i = 0; i < source.length; i += 4) {
    if (maskOnly) {
      result[i] = result[i + 1] = result[i + 2] = source[i + 3];
    } else if (keys.includes("gray")) {
      result[i] = result[i + 1] = result[i + 2] = enabled.has("gray") ? grayValue(source[i], source[i + 1], source[i + 2]) : 0;
    } else {
      result[i] = enabled.has("red") ? source[i] : 0;
      result[i + 1] = enabled.has("green") ? source[i + 1] : 0;
      result[i + 2] = enabled.has("blue") ? source[i + 2] : 0;
    }
    result[i + 3] = alpha && !maskOnly ? source[i + 3] : 255;
  }
  return result;
}

/* dist/js/tool-windows.js */
// Независимые окна: без backdrop и без блокировки остальной страницы.
class ToolWindows {
  constructor(entries, onActivate) {
    this.entries = entries;
    this.onActivate = onActivate;
    this.order = [];
    for (const [name, dialog] of Object.entries(entries)) {
      dialog.setAttribute("aria-modal", "false");
      const header = dialog.querySelector("header");
      const title = header.querySelector("h2");
      title.id = `${name}WindowTitle`;
      dialog.setAttribute("aria-labelledby", title.id);
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "fold-window";
      fold.textContent = "−";
      fold.setAttribute("aria-label", "Свернуть окно");
      fold.setAttribute("aria-expanded", "true");
      header.insertBefore(fold, header.querySelector(".close-dialog"));
      fold.addEventListener("click", () => {
        const folded = dialog.dataset.folded !== "true";
        dialog.dataset.folded = String(folded);
        fold.textContent = folded ? "+" : "−";
        fold.setAttribute("aria-label", folded ? "Развернуть окно" : "Свернуть окно");
        fold.setAttribute("aria-expanded", String(!folded));
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left, rect.top);
      });
      header.tabIndex = 0;
      header.title = "Перетащите окно за заголовок. Стрелки на клавиатуре тоже перемещают окно.";
      dialog.addEventListener("pointerdown", () => this.raise(name));
      dialog.addEventListener("focusin", () => this.raise(name));
      header.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;
        const rect = dialog.getBoundingClientRect();
        const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        header.setPointerCapture(event.pointerId);
        const move = (next) => this.place(dialog, next.clientX - offset.x, next.clientY - offset.y);
        const end = () => {
          header.removeEventListener("pointermove", move);
          header.removeEventListener("lostpointercapture", end);
        };
        header.addEventListener("pointermove", move);
        header.addEventListener("lostpointercapture", end);
        event.preventDefault();
      });
      header.addEventListener("keydown", (event) => {
        if (event.target !== header) return;
        const step = event.shiftKey ? 40 : 10;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left + delta[0], rect.top + delta[1]);
      });
    }
    window.addEventListener("resize", () => {
      Object.values(entries).filter((dialog) => dialog.open).forEach((dialog) => {
        const rect = dialog.getBoundingClientRect();
        this.place(dialog, rect.left, rect.top);
      });
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const name = this.order.findLast((item) => entries[item].open);
      if (name) {
        event.preventDefault();
        entries[name].dispatchEvent(new Event("cancel", { cancelable: true }));
      }
    });
  }

  place(dialog, x, y) {
    dialog.style.left = `${Math.max(8, Math.min(x, innerWidth - dialog.offsetWidth - 8))}px`;
    dialog.style.top = `${Math.max(8, Math.min(y, innerHeight - dialog.offsetHeight - 8))}px`;
  }

  raise(name) {
    this.order = this.order.filter((item) => item !== name);
    this.order.push(name);
    this.order.forEach((item, index) => { this.entries[item].style.zIndex = String(30 + index); });
    this.onActivate(name);
  }

  open(name) {
    const dialog = this.entries[name];
    if (!dialog.open) {
      dialog.dataset.folded = "false";
      const fold = dialog.querySelector(".fold-window");
      fold.textContent = "−";
      fold.setAttribute("aria-label", "Свернуть окно");
      fold.setAttribute("aria-expanded", "true");
      dialog.show();
      const slot = Object.keys(this.entries).indexOf(name);
      this.place(dialog, 24 + slot * Math.min(340, innerWidth / 4), 105 + slot * 36);
    }
    this.raise(name);
  }
}

/* dist/js/app.js */
const byId = (id) => document.getElementById(id);
const ui = Object.freeze({
  openButton: byId("openButton"), filePicker: byId("filePicker"), saveButton: byId("saveButton"), welcomeOpen: byId("welcomeOpen"),
  fileName: byId("fileName"), formatValue: byId("formatValue"), sizeValue: byId("sizeValue"), depthValue: byId("depthValue"), zoomValue: byId("zoomValue"),
  dropZone: byId("dropZone"), dropMessage: byId("dropMessage"), canvasZone: byId("canvasZone"), canvasHolder: byId("canvasHolder"), welcomeCard: byId("welcomeCard"), canvas: byId("artboard"), stageHint: byId("stageHint"),
  pickerTool: byId("pickerTool"), levelsTool: byId("levelsTool"), resizeTool: byId("resizeTool"), filterTool: byId("filterTool"),
  zoomSlider: byId("zoomSlider"), zoomOutput: byId("zoomOutput"), zoomDown: byId("zoomDown"), zoomUp: byId("zoomUp"), fitButton: byId("fitButton"),
  channelsNote: byId("channelsNote"), channelCards: byId("channelCards"), enableAllChannels: byId("enableAllChannels"),
  modeCards: byId("modeCards"), modeNote: byId("modeNote"), previewLabel: byId("previewLabel"),
  pixelEmpty: byId("pixelEmpty"), pixelResult: byId("pixelResult"), colorPatch: byId("colorPatch"), hexValue: byId("hexValue"), coordinateValue: byId("coordinateValue"), rgbValue: byId("rgbValue"), labValue: byId("labValue"),
  exportFormat: byId("exportFormat"), exportNote: byId("exportNote"), exportButton: byId("exportButton"), statusText: byId("statusText"), toast: byId("toast"),
  levelsDialog: byId("levelsDialog"), levelsForm: byId("levelsForm"), levelTarget: byId("levelTarget"), logHistogram: byId("logHistogram"), levelHistogram: byId("levelHistogram"), histogramMiddle: byId("histogramMiddle"), histogramMaximum: byId("histogramMaximum"),
  shadowSlider: byId("shadowSlider"), gammaSlider: byId("gammaSlider"), highlightSlider: byId("highlightSlider"), shadowNumber: byId("shadowNumber"), gammaNumber: byId("gammaNumber"), highlightNumber: byId("highlightNumber"), levelsPreview: byId("levelsPreview"), levelsReset: byId("levelsReset"), levelsCancel: byId("levelsCancel"), levelsApply: byId("levelsApply"),
  resizeDialog: byId("resizeDialog"), resizeForm: byId("resizeForm"), pixelsBefore: byId("pixelsBefore"), pixelsAfter: byId("pixelsAfter"), resizeUnits: byId("resizeUnits"), resizeWidth: byId("resizeWidth"), resizeHeight: byId("resizeHeight"), lockRatio: byId("lockRatio"), resizeMethod: byId("resizeMethod"), methodHelp: byId("methodHelp"), resizeError: byId("resizeError"), resizeCancel: byId("resizeCancel"),
  filterDialog: byId("filterDialog"), filterForm: byId("filterForm"), filterPreset: byId("filterPreset"), kernelGrid: byId("kernelGrid"), kernelSum: byId("kernelSum"), filterDescription: byId("filterDescription"), filterAll: byId("filterAll"), filterChannels: byId("filterChannels"), edgeMode: byId("edgeMode"), filterProgress: byId("filterProgress"), filterProgressBar: byId("filterProgressBar"), filterProgressText: byId("filterProgressText"), filterError: byId("filterError"), filterPreview: byId("filterPreview"), filterReset: byId("filterReset"), filterCancel: byId("filterCancel"), filterApply: byId("filterApply"),
});

const context = ui.canvas.getContext("2d", { alpha: true });
const work = {
  image: null,
  pixels: null,
  previewOwner: null,
  viewModel: "rgba",
  revision: 0,
  loadTicket: 0,
  activeChannels: new Set(),
  zoom: 1,
  zoomMode: "fit",
  interpolation: "bilinear",
  tool: "view",
  renderFrame: 0,
  toastTimer: 0,
  levels: null,
  resize: null,
  filter: null,
  dragCounter: 0,
};

const windows = new ToolWindows({ levels: ui.levelsDialog, resize: ui.resizeDialog, filter: ui.filterDialog }, (name) => {
  if ((name === "levels" || name === "filter") && work[name]) {
    work.previewOwner = name;
    requestCanvas();
  }
});

function previewPixels() {
  const owner = work.previewOwner;
  const enabled = owner === "levels" ? ui.levelsPreview.checked : owner === "filter" && ui.filterPreview.checked;
  return enabled ? work[owner]?.preview : null;
}

function releasePreview(name) {
  if (work.previewOwner === name) work.previewOwner = ["levels", "filter"].find((key) => work[key]) || null;
  requestCanvas();
}

function discardTools() {
  if (work.levels) cancelAnimationFrame(work.levels.frame);
  stopFilterJob();
  work.levels = work.filter = work.resize = null;
  work.previewOwner = null;
  [ui.levelsDialog, ui.filterDialog, ui.resizeDialog].forEach((dialog) => dialog.close());
}

// Применённая коррекция становится основой всех оставшихся открытых окон.
function savePixels(pixels) {
  work.pixels = new Uint8ClampedArray(pixels);
  work.revision += 1;
  if (work.levels) {
    work.levels.base = work.pixels;
    work.levels.preview = null;
    drawHistogram();
    refreshLevelsPreview(false);
  }
  if (work.filter) {
    const interrupted = work.filter.applying;
    stopFilterJob();
    Object.assign(work.filter, { base: work.pixels, width: work.image.width, height: work.image.height, revision: work.revision, preview: null, last: null, signature: "" });
    scheduleFilterPreview(false);
    if (interrupted) notify("Документ изменён. Проверьте фильтр и нажмите «Применить» снова.");
  }
  buildChannelDeck();
  buildModeCards();
  resetPixelCard();
  requestCanvas();
}

const CHANNELS = Object.freeze({
  gray: { title: "Яркость", short: "Y" },
  red: { title: "Красный", short: "R" },
  green: { title: "Зелёный", short: "G" },
  blue: { title: "Синий", short: "B" },
  alpha: { title: "Прозрачность", short: "A" },
});

const MODEL_CHANNELS = Object.freeze({
  gray: ["gray"],
  "gray-alpha": ["gray", "alpha"],
  rgb: ["red", "green", "blue"],
  rgba: ["red", "green", "blue", "alpha"],
});

const LEVEL_LABELS = Object.freeze({ master: "Master", gray: "Яркость", red: "Красный", green: "Зелёный", blue: "Синий", alpha: "Alpha" });

const FILTER_NOTES = Object.freeze({
  identity: "Тождественное ядро не изменяет изображение.",
  sharpen: "Повышает локальный контраст и подчёркивает мелкие детали.",
  gaussian: "Размывает мягко, сохраняя больший вес у центрального пикселя.",
  box: "Усредняет девять соседних пикселей с одинаковым весом.",
  prewittH: "Выделяет вертикально направленные перепады яркости.",
  prewittV: "Выделяет горизонтально направленные перепады яркости.",
  median: "Заменяет компонент медианой окрестности и убирает одиночный шум.",
  custom: "Пользовательское ядро из девяти коэффициентов.",
});

function setStatus(message) {
  ui.statusText.textContent = message;
}

function notify(message, error = false) {
  window.clearTimeout(work.toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.toggle("error", error);
  ui.toast.classList.add("visible");
  work.toastTimer = window.setTimeout(() => ui.toast.classList.remove("visible"), 2600);
}

function setImageControls(enabled) {
  [ui.saveButton, ui.pickerTool, ui.levelsTool, ui.resizeTool, ui.filterTool, ui.zoomSlider, ui.zoomDown, ui.zoomUp, ui.fitButton, ui.enableAllChannels, ui.exportButton]
    .forEach((control) => { control.disabled = !enabled; });
}

function formatBytes(value) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / 1024 ** 2).toFixed(1)} МБ`;
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

function modelChannels() {
  return work.image ? VIEW_MODES[work.viewModel].channels : [];
}

function visualPixels(source = previewPixels() || work.pixels) {
  return projectChannels(source, work.viewModel, work.activeChannels);
}

function buildModeCards() {
  ui.modeNote.hidden = false;
  ui.modeCards.replaceChildren();
  const ratio = Math.min(120 / work.image.width, 58 / work.image.height);
  const width = Math.max(1, Math.round(work.image.width * ratio));
  const height = Math.max(1, Math.round(work.image.height * ratio));
  const small = resizeRgba(work.pixels, work.image.width, work.image.height, width, height, "nearest");
  Object.entries(VIEW_MODES).forEach(([mode, info], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mode = mode;
    button.setAttribute("aria-pressed", String(work.viewModel === mode));
    button.setAttribute("aria-label", `${index + 1} ${info.label}`);
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 58;
    canvas.setAttribute("aria-hidden", "true");
    canvas.getContext("2d").putImageData(new ImageData(projectChannels(small, mode), width, height), Math.floor((120 - width) / 2), Math.floor((58 - height) / 2));
    const label = document.createElement("span");
    label.textContent = `${index + 1} · ${info.label}`;
    button.append(canvas, label);
    button.addEventListener("click", () => {
      if (work.viewModel === mode) return;
      work.viewModel = mode;
      work.activeChannels = new Set(info.channels);
      ui.modeCards.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.mode === mode)));
      buildChannelDeck();
      requestCanvas();
      setStatus(`Режим просмотра: ${info.label}`);
    });
    ui.modeCards.append(button);
  });
}

function safeZoom(requested) {
  const bounded = Math.min(SCALE_LIMITS.maximum, Math.max(SCALE_LIMITS.minimum, requested));
  if (!work.image) return bounded;
  const pixelsLimit = Math.sqrt(64_000_000 / (work.image.width * work.image.height));
  return Math.max(SCALE_LIMITS.minimum, Math.min(bounded, pixelsLimit));
}

function drawCanvas() {
  work.renderFrame = 0;
  if (!work.image || !work.pixels) return;
  ui.previewLabel.textContent = previewPixels() ? `Предпросмотр: ${work.previewOwner === "levels" ? "уровни" : "фильтр"}` : "Сохранённые изменения";
  const display = scaledSize(work.image.width, work.image.height, work.zoom);
  const rendered = resizeRgba(visualPixels(), work.image.width, work.image.height, display.width, display.height, work.interpolation);
  ui.canvas.width = display.width;
  ui.canvas.height = display.height;
  ui.canvas.classList.toggle("pixels", work.interpolation === "nearest");
  context.putImageData(new ImageData(rendered, display.width, display.height), 0, 0);
  ui.canvasHolder.style.width = `${Math.max(ui.canvasZone.clientWidth, display.width + 100)}px`;
  ui.canvasHolder.style.height = `${Math.max(ui.canvasZone.clientHeight, display.height + 100)}px`;
}

function requestCanvas() {
  if (!work.renderFrame) work.renderFrame = requestAnimationFrame(drawCanvas);
}

function setZoom(value, mode = "manual") {
  if (!work.image) return;
  work.zoom = safeZoom(Number(value));
  work.zoomMode = mode;
  const percent = Math.round(work.zoom * 100);
  ui.zoomSlider.value = String(percent);
  ui.zoomOutput.textContent = `${percent}%`;
  ui.zoomValue.textContent = `${percent}%`;
  requestCanvas();
}

function fitDocument() {
  if (!work.image) return;
  setZoom(fitScale(work.image.width, work.image.height, ui.canvasZone.clientWidth, ui.canvasZone.clientHeight), "fit");
}

function isolateForPreview(source, key) {
  const output = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    let value = source[index];
    if (key === "gray") value = grayValue(source[index], source[index + 1], source[index + 2]);
    if (key === "red") value = source[index];
    if (key === "green") value = source[index + 1];
    if (key === "blue") value = source[index + 2];
    if (key === "alpha") value = source[index + 3];
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}

function channelPreview(canvas, key) {
  const maxWidth = 150;
  const maxHeight = 66;
  const scale = Math.min(maxWidth / work.image.width, maxHeight / work.image.height);
  const width = Math.max(1, Math.round(work.image.width * scale));
  const height = Math.max(1, Math.round(work.image.height * scale));
  const preview = resizeRgba(isolateForPreview(work.pixels, key), work.image.width, work.image.height, width, height, "bilinear");
  canvas.width = maxWidth;
  canvas.height = maxHeight;
  const previewContext = canvas.getContext("2d");
  previewContext.fillStyle = "#17162f";
  previewContext.fillRect(0, 0, maxWidth, maxHeight);
  previewContext.putImageData(new ImageData(preview, width, height), Math.floor((maxWidth - width) / 2), Math.floor((maxHeight - height) / 2));
}

function syncChannelButtons() {
  ui.channelCards.querySelectorAll("button").forEach((button) => {
    const active = work.activeChannels.has(button.dataset.channel);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${CHANNELS[button.dataset.channel].title}, канал ${active ? "включён" : "выключен"}`);
    button.querySelector("em").textContent = active ? "вкл" : "выкл";
  });
}

function buildChannelDeck() {
  ui.channelCards.replaceChildren();
  ui.channelsNote.hidden = true;
  modelChannels().forEach((key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-button";
    button.dataset.channel = key;
    button.setAttribute("aria-pressed", "true");
    button.setAttribute("aria-label", `${CHANNELS[key].title}, канал включён`);
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = `${CHANNELS[key].short} · ${CHANNELS[key].title}`;
    const state = document.createElement("em");
    state.textContent = "вкл";
    label.append(name, state);
    button.append(canvas, label);
    button.addEventListener("click", () => {
      if (work.activeChannels.has(key)) work.activeChannels.delete(key); else work.activeChannels.add(key);
      syncChannelButtons();
      requestCanvas();
      setStatus(`Активные каналы: ${[...work.activeChannels].map((item) => CHANNELS[item].short).join(" + ") || "нет"}`);
    });
    ui.channelCards.append(button);
    channelPreview(canvas, key);
  });
  syncChannelButtons();
}

function resetPixelCard() {
  ui.pixelResult.hidden = true;
  ui.pixelEmpty.hidden = false;
}

function commitImage(image, pixels) {
  discardTools();
  work.revision += 1;
  work.image = image;
  work.pixels = new Uint8ClampedArray(pixels);
  work.viewModel = image.model;
  work.interpolation = "bilinear";
  work.activeChannels = new Set(MODEL_CHANNELS[image.model]);
  work.tool = "view";
  ui.pickerTool.setAttribute("aria-pressed", "false");
  ui.canvas.classList.remove("picker");
  ui.welcomeCard.hidden = true;
  ui.canvasHolder.classList.add("visible");
  ui.fileName.textContent = image.name;
  ui.formatValue.textContent = image.label;
  ui.sizeValue.textContent = `${image.width} × ${image.height} px`;
  ui.depthValue.textContent = image.depth;
  ui.stageHint.textContent = `${formatBytes(image.fileSize)} · ${image.model.toUpperCase()}`;
  buildChannelDeck();
  buildModeCards();
  resetPixelCard();
  setImageControls(true);
  setStatus(`${image.name} открыт`);
  requestAnimationFrame(fitDocument);
}

function modelForRaster(format, header, pixels) {
  if (format === "jpeg") return header.channelCount === 1 ? "gray" : "rgb";
  if (header.colorType === 4) return "gray-alpha";
  if (header.colorType === 6) return "rgba";
  const gray = header.colorType === 0;
  // tRNS может добавлять прозрачность даже PNG без отдельного Alpha-канала.
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) return gray ? "gray-alpha" : "rgba";
  }
  return gray ? "gray" : "rgb";
}

async function rasterPixels(file, buffer, header) {
  const blob = new Blob([buffer], { type: file.type || "application/octet-stream" });
  let drawable;
  if ("createImageBitmap" in window) drawable = await createImageBitmap(blob);
  else {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    await image.decode();
    drawable = image;
    URL.revokeObjectURL(url);
  }
  const canvas = document.createElement("canvas");
  canvas.width = header.width;
  canvas.height = header.height;
  const rasterContext = canvas.getContext("2d", { willReadFrequently: true });
  rasterContext.drawImage(drawable, 0, 0);
  drawable.close?.();
  return rasterContext.getImageData(0, 0, header.width, header.height).data;
}

async function openImageFile(file) {
  if (!file) return;
  const ticket = ++work.loadTicket;
  try {
    setStatus("Читаю изображение…");
    const buffer = await file.arrayBuffer();
    if (ticket !== work.loadTicket) return;
    const bytes = new Uint8Array(buffer);
    const format = detectFormat(bytes);
    if (!format) throw new ImageFormatError("Поддерживаются только PNG, JPG и GB7.");

    if (format === "gb7") {
      const decoded = decodeGB7(buffer);
      commitImage({ name: file.name, format, label: "GrayBit-7", width: decoded.width, height: decoded.height, model: decoded.masked ? "gray-alpha" : "gray", depth: decoded.masked ? "7 бит + маска" : "7 бит", maxLevel: 127, fileSize: file.size }, decoded.pixels);
      return;
    }

    const header = readRasterHeader(bytes, format);
    const pixels = await rasterPixels(file, buffer, header);
    if (ticket !== work.loadTicket) return;
    const depth = format === "png" && header.colorType === 3 ? `${header.bitDepth} бит, палитра` : `${header.totalDepth} бит (${header.bitDepth} на канал)`;
    commitImage({ name: file.name, format, label: format === "png" ? "PNG" : "JPEG", width: header.width, height: header.height, model: modelForRaster(format, header, pixels), depth, maxLevel: 255, fileSize: file.size }, pixels);
  } catch (error) {
    if (ticket !== work.loadTicket) return;
    setStatus("Изображение не открыто");
    notify(error.message || "Не удалось прочитать файл.", true);
  } finally {
    ui.filePicker.value = "";
  }
}

function openSample(name) {
  work.loadTicket += 1;
  try {
    const demo = createDemoImage(name);
    commitImage(demo.image, demo.pixels);
  } catch (error) {
    notify(error.message || "Не удалось создать пример.", true);
  }
}

function activatePicker() {
  if (!work.image) return;
  work.tool = work.tool === "picker" ? "view" : "picker";
  const active = work.tool === "picker";
  ui.pickerTool.setAttribute("aria-pressed", String(active));
  ui.canvas.classList.toggle("picker", active);
  setStatus(active ? "Пипетка включена" : "Пипетка выключена");
}

function pickPixel(event) {
  if (work.tool !== "picker" || !work.image || event.button !== 0) return;
  const rect = ui.canvas.getBoundingClientRect();
  const borderX = ui.canvas.clientLeft * rect.width / ui.canvas.offsetWidth;
  const borderY = ui.canvas.clientTop * rect.height / ui.canvas.offsetHeight;
  const x = Math.min(work.image.width - 1, Math.max(0, Math.floor(((event.clientX - rect.left - borderX) / (rect.width - 2 * borderX)) * work.image.width)));
  const y = Math.min(work.image.height - 1, Math.max(0, Math.floor(((event.clientY - rect.top - borderY) / (rect.height - 2 * borderY)) * work.image.height)));
  const index = (y * work.image.width + x) * 4;
  const source = previewPixels() || work.pixels;
  const pixel = projectChannels(source.subarray(index, index + 4), work.viewModel, work.activeChannels);
  const [red, green, blue] = pixel;
  const lab = rgbToLab(red, green, blue);
  const hex = rgbToHex(red, green, blue);
  ui.pixelEmpty.hidden = true;
  ui.pixelResult.hidden = false;
  ui.colorPatch.style.background = hex;
  ui.hexValue.textContent = hex;
  ui.coordinateValue.textContent = `X ${x}, Y ${y}`;
  ui.rgbValue.textContent = `${red}, ${green}, ${blue}`;
  ui.labValue.textContent = `L* ${lab.l.toFixed(1)}, a* ${lab.a.toFixed(1)}, b* ${lab.b.toFixed(1)}`;
  setStatus(`Пиксель ${x}, ${y}: RGB ${red}, ${green}, ${blue}`);
}

function createExportCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = work.image.width;
  canvas.height = work.image.height;
  canvas.getContext("2d").putImageData(new ImageData(visualPixels(work.pixels), work.image.width, work.image.height), 0, 0);
  return canvas;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Браузер не создал файл.")), type, quality));
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function exportImage() {
  if (!work.image) return;
  try {
    const format = ui.exportFormat.value;
    const name = baseName(work.image.name);
    let blob;
    let extension;
    if (format === "gb7") {
      const encoded = encodeGB7({ width: work.image.width, height: work.image.height, pixels: visualPixels(work.pixels) });
      blob = new Blob([encoded.bytes], { type: "application/octet-stream" });
      extension = "gb7";
    } else if (format === "jpeg") {
      const visible = createExportCanvas();
      const flat = document.createElement("canvas");
      flat.width = visible.width;
      flat.height = visible.height;
      const flatContext = flat.getContext("2d");
      flatContext.fillStyle = "white";
      flatContext.fillRect(0, 0, flat.width, flat.height);
      flatContext.drawImage(visible, 0, 0);
      blob = await canvasBlob(flat, "image/jpeg", 0.92);
      extension = "jpg";
    } else {
      blob = await canvasBlob(createExportCanvas(), "image/png");
      extension = "png";
    }
    triggerDownload(blob, `${name}.${extension}`);
    setStatus(`${name}.${extension} сохранён`);
  } catch (error) {
    notify(error.message, true);
  }
}

function updateExportCopy() {
  const format = ui.exportFormat.value;
  const notes = { png: "PNG сохраняет полупрозрачные пиксели без потерь.", jpeg: "JPG уменьшает размер файла и заменяет прозрачность белым.", gb7: "GB7 переводит изображение в 128 оттенков серого и двоичную маску." };
  ui.exportNote.textContent = notes[format];
  ui.exportButton.textContent = `Скачать ${format === "jpeg" ? "JPG" : format.toUpperCase()}`;
}

function levelKeys() {
  return ["master", ...MODEL_CHANNELS[work.image.model]];
}

function currentLevelSettings() {
  return work.levels.settings[ui.levelTarget.value];
}

function drawHistogram() {
  if (!work.levels) return;
  const target = ui.levelTarget.value;
  const bins = histogram(work.levels.base, target, work.image.maxLevel);
  const canvas = ui.levelHistogram;
  const graph = canvas.getContext("2d");
  graph.clearRect(0, 0, canvas.width, canvas.height);
  graph.fillStyle = "#17162f";
  graph.fillRect(0, 0, canvas.width, canvas.height);
  const values = Array.from(bins, (count) => ui.logHistogram.checked ? Math.log1p(count) : count);
  const peak = Math.max(1, ...values);
  const palette = { master: "#ffd75e", gray: "#f8f7ff", red: "#ff784c", green: "#39d4b4", blue: "#8fa8ff", alpha: "#ffffff" };
  graph.fillStyle = palette[target];
  const barWidth = canvas.width / bins.length;
  values.forEach((value, index) => {
    const height = (value / peak) * (canvas.height - 12);
    graph.fillRect(index * barWidth, canvas.height - height, Math.max(1, barWidth), height);
  });
}

function syncLevelControls() {
  const settings = currentLevelSettings();
  const maximum = work.image.maxLevel;
  const marker = markerFromGamma(settings.gamma, settings.shadow, settings.highlight);
  [ui.shadowSlider, ui.gammaSlider, ui.highlightSlider].forEach((control) => { control.max = String(maximum); });
  ui.shadowSlider.value = String(settings.shadow);
  ui.gammaSlider.value = String(marker);
  ui.highlightSlider.value = String(settings.highlight);
  ui.shadowNumber.value = String(settings.shadow);
  ui.gammaNumber.value = settings.gamma.toFixed(2);
  ui.highlightNumber.value = String(settings.highlight);
  ui.shadowNumber.max = String(settings.highlight - 1);
  ui.highlightNumber.min = String(settings.shadow + 1);
}

function refreshLevelsPreview(claim = true) {
  if (!work.levels) return;
  const session = work.levels;
  if (claim) work.previewOwner = "levels";
  cancelAnimationFrame(session.frame || 0);
  if (!ui.levelsPreview.checked) {
    session.preview = null;
    requestCanvas();
    return;
  }
  session.frame = requestAnimationFrame(() => {
    if (work.levels !== session) return;
    session.preview = processLevels(session.base, work.image.model, session.settings, work.image.maxLevel);
    requestCanvas();
  });
}

function setShadow(value) {
  const settings = currentLevelSettings();
  settings.shadow = Math.min(settings.highlight - 1, Math.max(0, Math.round(Number(value) || 0)));
  syncLevelControls();
  refreshLevelsPreview();
}

function setHighlight(value) {
  const settings = currentLevelSettings();
  settings.highlight = Math.max(settings.shadow + 1, Math.min(work.image.maxLevel, Math.round(Number(value) || work.image.maxLevel)));
  syncLevelControls();
  refreshLevelsPreview();
}

function setGamma(value) {
  const settings = currentLevelSettings();
  settings.gamma = Math.min(GAMMA_RANGE.maximum, Math.max(GAMMA_RANGE.minimum, Number(value) || 1));
  syncLevelControls();
  refreshLevelsPreview();
}

function setGammaMarker(value) {
  const settings = currentLevelSettings();
  settings.gamma = gammaFromMarker(Number(value), settings.shadow, settings.highlight);
  syncLevelControls();
  refreshLevelsPreview();
}

function openLevels() {
  if (!work.image) return;
  if (ui.levelsDialog.open) return windows.open("levels");
  const settings = Object.fromEntries(levelKeys().map((key) => [key, neutralLevel(work.image.maxLevel)]));
  work.levels = { base: work.pixels, settings, frame: 0, preview: null };
  ui.levelTarget.replaceChildren(...levelKeys().map((key) => new Option(LEVEL_LABELS[key], key)));
  ui.levelTarget.value = "master";
  ui.logHistogram.checked = false;
  ui.levelsPreview.checked = true;
  ui.histogramMiddle.textContent = String(Math.round(work.image.maxLevel / 2));
  ui.histogramMaximum.textContent = String(work.image.maxLevel);
  syncLevelControls();
  drawHistogram();
  windows.open("levels");
  refreshLevelsPreview();
}

function resetLevels() {
  if (!work.levels) return;
  work.levels.settings = Object.fromEntries(levelKeys().map((key) => [key, neutralLevel(work.image.maxLevel)]));
  syncLevelControls();
  refreshLevelsPreview();
  setStatus("Параметры уровней сброшены");
}

function cancelLevels() {
  if (!work.levels) return;
  cancelAnimationFrame(work.levels.frame || 0);
  work.levels = null;
  ui.levelsDialog.close();
  releasePreview("levels");
  setStatus("Изменения уровней отменены");
}

function applyLevels(event) {
  event.preventDefault();
  if (!work.levels) return;
  const pixels = processLevels(work.levels.base, work.image.model, work.levels.settings, work.image.maxLevel);
  cancelAnimationFrame(work.levels.frame);
  work.levels = null;
  ui.levelsDialog.close();
  releasePreview("levels");
  savePixels(pixels);
  setStatus("Уровни применены");
  notify("Тоновая коррекция применена");
}

function formatPixelCount(count) {
  return count >= 1_000_000 ? `${(count / 1_000_000).toFixed(2)} Мп` : `${count.toLocaleString("ru-RU")} пикс.`;
}

function resizeDimensions(units = work.resize.units) {
  const widthValue = Number(ui.resizeWidth.value);
  const heightValue = Number(ui.resizeHeight.value);
  if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue) || widthValue <= 0 || heightValue <= 0) return null;
  if (units === "percent") return { width: Math.max(1, Math.round(work.image.width * widthValue / 100)), height: Math.max(1, Math.round(work.image.height * heightValue / 100)) };
  if (!Number.isInteger(widthValue) || !Number.isInteger(heightValue)) return null;
  return { width: Math.round(widthValue), height: Math.round(heightValue) };
}

function validateResize() {
  const result = resizeDimensions();
  let message = "";
  if (!result) message = "Введите положительные значения; в пикселях нужны целые числа.";
  else if (result.width > 16384 || result.height > 16384) message = "Максимальная сторона: 16 384 пикселя.";
  else if (result.width * result.height > 64_000_000) message = "Максимальный размер: 64 мегапикселя.";
  ui.resizeError.hidden = !message;
  ui.resizeError.textContent = message;
  ui.pixelsAfter.textContent = result ? formatPixelCount(result.width * result.height) : "—";
  return message ? null : result;
}

function writeResizeDimensions(width, height) {
  if (ui.resizeUnits.value === "percent") {
    ui.resizeWidth.value = String(Number(((width / work.image.width) * 100).toFixed(2)));
    ui.resizeHeight.value = String(Number(((height / work.image.height) * 100).toFixed(2)));
  } else {
    ui.resizeWidth.value = String(width);
    ui.resizeHeight.value = String(height);
  }
  validateResize();
}

function openResize() {
  if (!work.image) return;
  if (ui.resizeDialog.open) return windows.open("resize");
  work.resize = { units: "pixels", width: work.image.width, height: work.image.height };
  ui.resizeUnits.value = "pixels";
  ui.resizeWidth.max = ui.resizeHeight.max = "16384";
  ui.resizeWidth.step = ui.resizeHeight.step = "1";
  ui.lockRatio.checked = true;
  ui.resizeMethod.value = work.interpolation;
  ui.pixelsBefore.textContent = formatPixelCount(work.image.width * work.image.height);
  writeResizeDimensions(work.image.width, work.image.height);
  updateMethodHelp();
  windows.open("resize");
}

function linkedResize(axis) {
  if (!work.resize || !ui.lockRatio.checked) return validateResize();
  const value = Number(axis === "width" ? ui.resizeWidth.value : ui.resizeHeight.value);
  if (!Number.isFinite(value) || value <= 0) return validateResize();
  if (ui.resizeUnits.value === "percent") {
    if (axis === "width") ui.resizeHeight.value = String(value); else ui.resizeWidth.value = String(value);
  } else {
    const ratio = work.image.width / work.image.height;
    if (axis === "width") ui.resizeHeight.value = String(Math.max(1, Math.round(value / ratio)));
    else ui.resizeWidth.value = String(Math.max(1, Math.round(value * ratio)));
  }
  validateResize();
}

function changeResizeUnits() {
  const last = resizeDimensions() || { width: work.image.width, height: work.image.height };
  work.resize.units = ui.resizeUnits.value;
  const percent = ui.resizeUnits.value === "percent";
  ui.resizeWidth.max = ui.resizeHeight.max = percent ? "1000" : "16384";
  ui.resizeWidth.step = ui.resizeHeight.step = percent ? "0.1" : "1";
  writeResizeDimensions(last.width, last.height);
}

function updateMethodHelp() {
  ui.methodHelp.dataset.tip = INTERPOLATORS[ui.resizeMethod.value].note;
}

function cancelResize() {
  work.resize = null;
  ui.resizeDialog.close();
  setStatus("Изменение размера отменено");
}

async function applyResize(event) {
  event.preventDefault();
  if (!work.resize) return;
  const size = validateResize();
  if (!size) return;
  const method = ui.resizeMethod.value;
  const session = work.resize;
  const document = work.image;
  ui.resizeDialog.close();
  setStatus("Изменяю размер…");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (work.resize !== session || work.image !== document) return;
  try {
    const pixels = resizeRgba(work.pixels, work.image.width, work.image.height, size.width, size.height, method);
    work.image.width = size.width;
    work.image.height = size.height;
    work.interpolation = method;
    work.resize = null;
    ui.sizeValue.textContent = `${size.width} × ${size.height} px`;
    ui.stageHint.textContent = `${formatBytes(work.image.fileSize)} · ${work.image.model.toUpperCase()}`;
    savePixels(pixels);
    setZoom(work.zoom);
    setStatus(`Новый размер: ${size.width} × ${size.height} px`);
    notify("Размер изображения изменён");
  } catch (error) {
    notify(error.message, true);
  }
}

function filterDefinitions() {
  const grayscale = work.image.model === "gray" || work.image.model === "gray-alpha";
  const definitions = grayscale
    ? [{ key: "gray", label: "Яркость", components: [0, 1, 2] }]
    : [{ key: "red", label: "Красный", components: [0] }, { key: "green", label: "Зелёный", components: [1] }, { key: "blue", label: "Синий", components: [2] }];
  if (work.image.model === "gray-alpha" || work.image.model === "rgba") {
    definitions.push({ key: "alpha", label: "Alpha", components: [3] });
  }
  return definitions;
}

function fillFilterChannels() {
  ui.filterChannels.replaceChildren();
  filterDefinitions().forEach((definition) => {
    const label = document.createElement("label");
    label.className = "check-card";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.dataset.components = definition.components.join(",");
    input.addEventListener("change", () => { syncFilterAll(); scheduleFilterPreview(); });
    label.append(input, document.createTextNode(definition.label));
    ui.filterChannels.append(label);
  });
  syncFilterAll();
}

function channelChecks() {
  return [...ui.filterChannels.querySelectorAll("input")];
}

function syncFilterAll() {
  const checks = channelChecks();
  const active = checks.filter((input) => input.checked).length;
  ui.filterAll.checked = active === checks.length;
  ui.filterAll.indeterminate = active > 0 && active < checks.length;
}

function filterOptions() {
  const channels = [...new Set(channelChecks().filter((input) => input.checked).flatMap((input) => input.dataset.components.split(",").map(Number)))];
  const median = ui.filterPreset.value === "median";
  const matrix = [...ui.kernelGrid.querySelectorAll("input")].map((input) => Number(input.value));
  if (!channels.length) return { error: "Выберите хотя бы один канал." };
  if (!median && matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)) return { error: "Коэффициенты должны быть числами от −100 до 100." };
  return { value: { type: median ? "median" : "kernel", matrix, channels, edge: ui.edgeMode.value } };
}

function filterSignature(options) {
  return JSON.stringify(options);
}

function updateKernelSum() {
  if (ui.filterPreset.value === "median") {
    ui.kernelSum.textContent = "Медиана";
    return;
  }
  const values = [...ui.kernelGrid.querySelectorAll("input")].map((input) => Number(input.value));
  ui.kernelSum.textContent = values.every(Number.isFinite) ? `Сумма: ${Number(values.reduce((sum, value) => sum + value, 0).toFixed(4))}` : "Сумма: —";
}

function setFilterPreset(key, preview = true) {
  const preset = FILTERS[key] || FILTERS.identity;
  ui.filterPreset.value = key;
  [...ui.kernelGrid.querySelectorAll("input")].forEach((input, index) => {
    input.value = String(Number(preset.matrix[index].toFixed(6)));
    input.disabled = preset.type === "median";
  });
  ui.filterDescription.textContent = FILTER_NOTES[key];
  updateKernelSum();
  if (preview) scheduleFilterPreview();
}

function showFilterError(message = "") {
  ui.filterError.hidden = !message;
  ui.filterError.textContent = message;
}

function setFilterApplying(applying) {
  if (work.filter) work.filter.applying = applying;
  ui.filterForm.querySelectorAll("input, select, button").forEach((control) => {
    if (control.id === "filterCancel" || control.dataset.close || control.classList.contains("fold-window")) return;
    control.disabled = applying || (control.closest("#kernelGrid") && ui.filterPreset.value === "median");
  });
  ui.filterApply.textContent = applying ? "Обработка…" : "Применить";
}

function filterJobCurrent(session, job) {
  return work.filter === session && session.job === job && session.revision === work.revision;
}

function failFilter(session, job, message) {
  if (!filterJobCurrent(session, job)) return;
  stopFilterJob();
  showFilterError(message);
}

function stopFilterJob(hide = true) {
  if (!work.filter) return;
  clearTimeout(work.filter.timer);
  work.filter.timer = 0;
  work.filter.job += 1;
  work.filter.worker?.terminate();
  work.filter.worker = null;
  setFilterApplying(false);
  if (hide) ui.filterProgress.hidden = true;
}

function filterProgress(value) {
  const percent = Math.round(value * 100);
  ui.filterProgress.hidden = false;
  ui.filterProgressBar.value = percent;
  ui.filterProgressText.textContent = `${percent}%`;
}

function finishFilter(session, job, mode, options, pixels) {
  if (!filterJobCurrent(session, job)) return;
  session.worker?.terminate();
  session.worker = null;
  ui.filterProgress.hidden = true;
  session.last = pixels;
  session.signature = filterSignature(options);
  setFilterApplying(false);
  if (mode === "apply") {
    stopFilterJob();
    work.filter = null;
    ui.filterDialog.close();
    releasePreview("filter");
    savePixels(pixels);
    setStatus("Фильтр применён");
    notify("Фильтрация завершена");
  } else if (ui.filterPreview.checked) {
    session.preview = pixels;
    requestCanvas();
  }
}

async function filterFallback(session, job, mode, options) {
  try {
    const pixels = await applyFilterInSlices(session.base, session.width, session.height, options, {
      rowsPerSlice: 7,
      cancelled: () => !filterJobCurrent(session, job),
      progress: (value) => { if (filterJobCurrent(session, job)) filterProgress(value); },
    });
    if (pixels) finishFilter(session, job, mode, options, pixels);
  } catch (error) {
    failFilter(session, job, error.message);
  }
}

function runFilter(mode, options) {
  const session = work.filter;
  if (!session) return;
  stopFilterJob(false);
  setFilterApplying(mode === "apply");
  const job = session.job;
  filterProgress(0);
  if (window.location.protocol === "file:" || !("Worker" in window)) {
    filterFallback(session, job, mode, options);
    return;
  }
  try {
    const worker = new Worker("./js/filter.worker.js", { type: "module" });
    session.worker = worker;
    worker.addEventListener("message", ({ data }) => {
      if (!filterJobCurrent(session, job) || data.job !== job) return;
      if (data.kind === "progress") filterProgress(data.value);
      if (data.kind === "complete") finishFilter(session, job, mode, options, new Uint8ClampedArray(data.buffer));
      if (data.kind === "failure") failFilter(session, job, data.message);
    });
    worker.addEventListener("error", () => {
      if (!filterJobCurrent(session, job)) return;
      worker.terminate();
      session.worker = null;
      filterFallback(session, job, mode, options);
    }, { once: true });
    const copy = new Uint8ClampedArray(session.base);
    worker.postMessage({ job, buffer: copy.buffer, width: session.width, height: session.height, options }, [copy.buffer]);
  } catch {
    filterFallback(session, job, mode, options);
  }
}

function scheduleFilterPreview(claim = true) {
  if (!work.filter || work.filter.applying) return;
  if (claim) work.previewOwner = "filter";
  stopFilterJob();
  work.filter.preview = null;
  requestCanvas();
  if (!ui.filterPreview.checked) {
    showFilterError();
    return;
  }
  const result = filterOptions();
  showFilterError(result.error || "");
  if (result.error) return;
  const session = work.filter;
  session.timer = setTimeout(() => { if (work.filter === session) runFilter("preview", result.value); }, 160);
}

function openFilter() {
  if (!work.image) return;
  if (ui.filterDialog.open) return windows.open("filter");
  work.filter = { base: work.pixels, width: work.image.width, height: work.image.height, revision: work.revision, preview: null, applying: false, timer: 0, worker: null, job: 0, last: null, signature: "" };
  fillFilterChannels();
  ui.edgeMode.value = "extend";
  ui.filterPreview.checked = true;
  ui.filterProgress.hidden = true;
  showFilterError();
  setFilterPreset("identity", false);
  setFilterApplying(false);
  windows.open("filter");
  scheduleFilterPreview();
}

function resetFilter() {
  if (!work.filter) return;
  channelChecks().forEach((input) => { input.checked = true; });
  syncFilterAll();
  ui.edgeMode.value = "extend";
  ui.filterPreview.checked = true;
  setFilterPreset("identity");
  setStatus("Параметры фильтра сброшены");
}

function cancelFilter() {
  if (!work.filter) return;
  stopFilterJob();
  work.filter = null;
  ui.filterDialog.close();
  releasePreview("filter");
  setStatus("Фильтрация отменена");
}

function applyFilterChanges(event) {
  event.preventDefault();
  if (!work.filter || work.filter.applying) return;
  const result = filterOptions();
  showFilterError(result.error || "");
  if (result.error) return;
  if (work.filter.last && work.filter.signature === filterSignature(result.value)) {
    stopFilterJob();
    finishFilter(work.filter, work.filter.job, "apply", result.value, work.filter.last);
  }
  else runFilter("apply", result.value);
}

function prepareFilterPresets() {
  Object.entries(FILTERS).forEach(([key, preset]) => ui.filterPreset.add(new Option(preset.label, key)));
  ui.filterPreset.add(new Option("Свои коэффициенты", "custom"));
}

function editingField() {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
}

ui.openButton.addEventListener("click", () => ui.filePicker.click());
ui.welcomeOpen.addEventListener("click", () => ui.filePicker.click());
ui.filePicker.addEventListener("change", () => openImageFile(ui.filePicker.files[0]));
document.querySelectorAll("[data-sample]").forEach((button) => button.addEventListener("click", () => openSample(button.dataset.sample)));
ui.dropZone.addEventListener("dragenter", (event) => { event.preventDefault(); work.dragCounter += 1; ui.dropMessage.classList.add("visible"); });
ui.dropZone.addEventListener("dragover", (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; });
ui.dropZone.addEventListener("dragleave", () => { work.dragCounter -= 1; if (work.dragCounter <= 0) { work.dragCounter = 0; ui.dropMessage.classList.remove("visible"); } });
ui.dropZone.addEventListener("drop", (event) => { event.preventDefault(); work.dragCounter = 0; ui.dropMessage.classList.remove("visible"); openImageFile(event.dataTransfer.files[0]); });

ui.pickerTool.addEventListener("click", activatePicker);
ui.canvas.addEventListener("mousedown", pickPixel);
ui.levelsTool.addEventListener("click", openLevels);
ui.resizeTool.addEventListener("click", openResize);
ui.filterTool.addEventListener("click", openFilter);
ui.zoomSlider.addEventListener("input", () => setZoom(Number(ui.zoomSlider.value) / 100));
ui.zoomDown.addEventListener("click", () => setZoom(work.zoom - 0.1));
ui.zoomUp.addEventListener("click", () => setZoom(work.zoom + 0.1));
ui.fitButton.addEventListener("click", fitDocument);
ui.enableAllChannels.addEventListener("click", () => { work.activeChannels = new Set(modelChannels()); syncChannelButtons(); requestCanvas(); setStatus("Все каналы включены"); });
ui.exportFormat.addEventListener("change", updateExportCopy);
ui.exportButton.addEventListener("click", exportImage);
ui.saveButton.addEventListener("click", exportImage);

ui.levelTarget.addEventListener("change", () => { syncLevelControls(); drawHistogram(); });
ui.logHistogram.addEventListener("change", drawHistogram);
ui.shadowSlider.addEventListener("input", () => setShadow(ui.shadowSlider.value));
ui.shadowNumber.addEventListener("input", () => setShadow(ui.shadowNumber.value));
ui.highlightSlider.addEventListener("input", () => setHighlight(ui.highlightSlider.value));
ui.highlightNumber.addEventListener("input", () => setHighlight(ui.highlightNumber.value));
ui.gammaSlider.addEventListener("input", () => setGammaMarker(ui.gammaSlider.value));
ui.gammaNumber.addEventListener("input", () => setGamma(ui.gammaNumber.value));
ui.levelsPreview.addEventListener("change", refreshLevelsPreview);
ui.levelsReset.addEventListener("click", resetLevels);
ui.levelsCancel.addEventListener("click", cancelLevels);
ui.levelsForm.addEventListener("submit", applyLevels);

ui.resizeWidth.addEventListener("input", () => linkedResize("width"));
ui.resizeHeight.addEventListener("input", () => linkedResize("height"));
ui.resizeUnits.addEventListener("change", changeResizeUnits);
ui.lockRatio.addEventListener("change", validateResize);
ui.resizeMethod.addEventListener("change", updateMethodHelp);
ui.resizeCancel.addEventListener("click", cancelResize);
ui.resizeForm.addEventListener("submit", applyResize);

ui.filterPreset.addEventListener("change", () => setFilterPreset(ui.filterPreset.value));
ui.kernelGrid.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => { ui.filterPreset.value = "custom"; ui.filterDescription.textContent = FILTER_NOTES.custom; updateKernelSum(); scheduleFilterPreview(); }));
ui.filterAll.addEventListener("change", () => { channelChecks().forEach((input) => { input.checked = ui.filterAll.checked; }); syncFilterAll(); scheduleFilterPreview(); });
ui.edgeMode.addEventListener("change", scheduleFilterPreview);
ui.filterPreview.addEventListener("change", scheduleFilterPreview);
ui.filterReset.addEventListener("click", resetFilter);
ui.filterCancel.addEventListener("click", cancelFilter);
ui.filterForm.addEventListener("submit", applyFilterChanges);

document.querySelector('[data-close="levels"]').addEventListener("click", cancelLevels);
document.querySelector('[data-close="resize"]').addEventListener("click", cancelResize);
document.querySelector('[data-close="filter"]').addEventListener("click", cancelFilter);
[ui.levelsDialog, ui.resizeDialog, ui.filterDialog].forEach((dialog) => dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (dialog === ui.levelsDialog) cancelLevels();
  if (dialog === ui.resizeDialog) cancelResize();
  if (dialog === ui.filterDialog) cancelFilter();
}));

window.addEventListener("resize", () => { if (work.image && work.zoomMode === "fit") fitDocument(); });
window.addEventListener("keydown", (event) => {
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === "o") { event.preventDefault(); ui.filePicker.click(); }
  if (command && event.key.toLowerCase() === "s" && work.image) { event.preventDefault(); exportImage(); }
  if (editingField() || command) return;
  if (event.key.toLowerCase() === "i") activatePicker();
  if (event.key.toLowerCase() === "l") openLevels();
  if (event.key.toLowerCase() === "r") openResize();
  if (event.key.toLowerCase() === "f") openFilter();
});

prepareFilterPresets();
updateExportCopy();
setImageControls(false);
})();
