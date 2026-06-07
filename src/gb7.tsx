import type { PixelImage } from './types';

export const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d] as const;
export const GB7_VERSION = 0x01;

export class GB7FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GB7FormatError';
  }
}

function gray7to8(g7: number): number {
  return Math.round((g7 * 255) / 127);
}

function gray8to7(g8: number): number {
  return Math.round((g8 * 127) / 255);
}

export interface GB7DecodeResult extends PixelImage {
  hasMask: boolean;
}

export function decodeGB7(buffer: ArrayBuffer): GB7DecodeResult {
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 12) {
    throw new GB7FormatError('Файл слишком мал для заголовка GB7');
  }
  for (let i = 0; i < GB7_SIGNATURE.length; i++) {
    if (bytes[i] !== GB7_SIGNATURE[i]) {
      throw new GB7FormatError('Неверная сигнатура файла GB7');
    }
  }

  const version = bytes[4];
  if (version !== GB7_VERSION) {
    throw new GB7FormatError(`Неподдерживаемая версия GB7: ${version}`);
  }

  const flags = bytes[5];
  const hasMask = (flags & 0x01) === 1;
  const width = (bytes[6] << 8) | bytes[7];
  const height = (bytes[8] << 8) | bytes[9];

  if (width === 0 || height === 0) {
    throw new GB7FormatError('Некорректные размеры изображения в GB7');
  }

  const pixelCount = width * height;
  const expected = 12 + pixelCount;
  if (bytes.length < expected) {
    throw new GB7FormatError(
      `Размер данных GB7 не совпадает с заголовком: ожидалось ${expected}, получено ${bytes.length}`,
    );
  }

  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const raw = bytes[12 + i];
    const gray = gray7to8(raw & 0x7f);
    const maskBit = (raw >> 7) & 0x01;
    const alpha = hasMask ? (maskBit === 1 ? 255 : 0) : 255;
    const o = i * 4;
    data[o] = gray;
    data[o + 1] = gray;
    data[o + 2] = gray;
    data[o + 3] = alpha;
  }

  return {
    width,
    height,
    data,
    hasMask,
    meta: {
      format: 'gb7',
      colorDepth: hasMask ? 8 : 7,
      colorDepthLabel: hasMask
        ? '8 бит (7 серый + 1 маска)'
        : '7 бит (оттенки серого)',
      hasAlpha: hasMask,
    },
  };
}

export interface GB7EncodeOptions {
  includeMask?: boolean;
  alphaThreshold?: number;
}

export function encodeGB7(image: PixelImage, options: GB7EncodeOptions = {}): Uint8Array {
  const { width, height, data } = image;
  const includeMask = options.includeMask ?? image.meta.hasAlpha;
  const alphaThreshold = options.alphaThreshold ?? 128;

  const pixelCount = width * height;
  const out = new Uint8Array(12 + pixelCount);

  out[0] = GB7_SIGNATURE[0];
  out[1] = GB7_SIGNATURE[1];
  out[2] = GB7_SIGNATURE[2];
  out[3] = GB7_SIGNATURE[3];
  out[4] = GB7_VERSION;
  out[5] = includeMask ? 0x01 : 0x00;
  out[6] = (width >> 8) & 0xff;
  out[7] = width & 0xff;
  out[8] = (height >> 8) & 0xff;
  out[9] = height & 0xff;
  out[10] = 0x00;
  out[11] = 0x00;

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const luma = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    let byte = gray8to7(luma) & 0x7f;
    if (includeMask) {
      const opaque = data[o + 3] >= alphaThreshold;
      if (opaque) byte |= 0x80;
    }
    out[12 + i] = byte;
  }

  return out;
}
