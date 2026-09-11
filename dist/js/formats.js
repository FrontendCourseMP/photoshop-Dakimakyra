const GB7_MAGIC = Object.freeze([0x47, 0x42, 0x37, 0x1d]);
const GB7_HEADER = 12;
const MAX_PIXELS = 64_000_000;

export class ImageFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageFormatError";
  }
}

function beginsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function detectFormat(bytes) {
  if (bytes.length >= 4 && beginsWith(bytes, GB7_MAGIC)) return "gb7";
  if (bytes.length >= 8 && beginsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytes.length >= 3 && beginsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  return null;
}

export function decodeGB7(buffer) {
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

export function encodeGB7(image) {
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

export function readRasterHeader(bytes, format) {
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
