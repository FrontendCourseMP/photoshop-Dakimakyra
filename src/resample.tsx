import type { PixelImage } from './types';

export type ResampleAlgorithm = 'bilinear' | 'nearest';

export interface AlgorithmInfo {
  key: ResampleAlgorithm;
  label: string;
  description: string;
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    key: 'bilinear',
    label: 'Билинейная плавная',
    description:
      'Усредняет четыре ближайших пикселя источника с весами по расстоянию. Даёт мягкий результат без ступенек на границах. Подходит для фотографий и плавных переходов. Используется по умолчанию.',
  },
  {
    key: 'nearest',
    label: 'Ближайший сосед быстрый',
    description:
      'Копирует значение ближайшего пикселя источника. Быстрый, сохраняет резкость и исходную палитру, но даёт ступенчатые края на наклонных линиях. Подходит для пиксель-арта и масок.',
  },
];

export function getAlgorithmInfo(key: ResampleAlgorithm): AlgorithmInfo {
  return ALGORITHMS.find((a) => a.key === key) ?? ALGORITHMS[0];
}

function resampleNearest(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * yRatio));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * xRatio));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

function resampleBilinear(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xRatio = dw > 1 ? (sw - 1) / (dw - 1) : 0;
  const yRatio = dh > 1 ? (sh - 1) / (dh - 1) : 0;

  for (let y = 0; y < dh; y++) {
    const sy = y * yRatio;
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    const wy0 = 1 - fy;
    const wy1 = fy;

    for (let x = 0; x < dw; x++) {
      const sx = x * xRatio;
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const wx0 = 1 - fx;
      const wx1 = fx;

      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const di = (y * dw + x) * 4;

      const w00 = wx0 * wy0;
      const w01 = wx1 * wy0;
      const w10 = wx0 * wy1;
      const w11 = wx1 * wy1;

      for (let c = 0; c < 4; c++) {
        out[di + c] =
          src[i00 + c] * w00 +
          src[i01 + c] * w01 +
          src[i10 + c] * w10 +
          src[i11 + c] * w11;
      }
    }
  }
  return out;
}

const RESAMPLERS: Record<
  ResampleAlgorithm,
  (s: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) => Uint8ClampedArray
> = {
  nearest: resampleNearest,
  bilinear: resampleBilinear,
};

export function resampleImage(
  src: PixelImage,
  dstW: number,
  dstH: number,
  algorithm: ResampleAlgorithm = 'bilinear',
): PixelImage {
  if (dstW < 1 || dstH < 1) {
    throw new Error('Размер должен быть не меньше 1 пикселя');
  }
  if (dstW === src.width && dstH === src.height) {
    return src;
  }
  const fn = RESAMPLERS[algorithm] ?? resampleBilinear;
  const data = fn(src.data, src.width, src.height, dstW, dstH);
  return { width: dstW, height: dstH, data, meta: src.meta };
}

export function megapixels(w: number, h: number): number {
  return (w * h) / 1_000_000;
}
