import type { PixelImage } from './types';

export type PaddingMode = 'black' | 'white' | 'replicate';
export type FilterMode = 'kernel' | 'median3';

export interface ChannelMaskRGBA {
  r: boolean;
  g: boolean;
  b: boolean;
  a: boolean;
}

export interface KernelPreset {
  key: string;
  label: string;
  description: string;
  values: number[];
  mode?: FilterMode;
}

export const KERNEL_SIZE = 3;

export const PRESETS: KernelPreset[] = [
  {
    key: 'identity',
    label: 'Тождественное отображение',
    description: 'Оставляет изображение без изменений (центр = 1, остальные = 0).',
    values: [
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ],
  },
  {
    key: 'sharpen',
    label: 'Повышение резкости',
    description: 'Усиливает разницу с соседями: подчёркивает контуры и текстуру.',
    values: [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0,
    ],
  },
  {
    key: 'gauss3',
    label: 'Фильтр Гаусса 3x3',
    description: 'Размытие по Гауссу (σ ≈ 1, ядро 1 2 1 / 2 4 2 / 1 2 1, делитель 16).',
    values: [
      1 / 16, 2 / 16, 1 / 16,
      2 / 16, 4 / 16, 2 / 16,
      1 / 16, 2 / 16, 1 / 16,
    ],
  },
  {
    key: 'box',
    label: 'Прямоугольное размытие',
    description: 'Усреднение по окрестности 3×3 (все коэффициенты = 1/9).',
    values: [
      1 / 9, 1 / 9, 1 / 9,
      1 / 9, 1 / 9, 1 / 9,
      1 / 9, 1 / 9, 1 / 9,
    ],
  },
  {
    key: 'prewittX',
    label: 'Прюитт по X',
    description: 'Оценивает горизонтальный градиент яркости (детектор вертикальных границ).',
    values: [
      -1, 0, 1,
      -1, 0, 1,
      -1, 0, 1,
    ],
  },
  {
    key: 'prewittY',
    label: 'Прюитт по Y',
    description: 'Оценивает вертикальный градиент яркости (детектор горизонтальных границ).',
    values: [
      -1, -1, -1,
      0, 0, 0,
      1, 1, 1,
    ],
  },
  {
    key: 'median3',
    label: 'Медианный фильтр 3x3',
    description: 'Нелинейный фильтр, убирает импульсный шум и сохраняет границы лучше усреднения.',
    values: [
      1, 1, 1,
      1, 1, 1,
      1, 1, 1,
    ],
    mode: 'median3',
  },
];

export function getPreset(key: string): KernelPreset | undefined {
  return PRESETS.find((p) => p.key === key);
}

export const PADDING_LABELS: Record<PaddingMode, string> = {
  black: 'Заполнение чёрным',
  white: 'Заполнение белым',
  replicate: 'Копирование края',
};

export interface ConvolveParams {
  src: Uint8ClampedArray;
  width: number;
  height: number;
  kernel: number[];
  ksize: number;
  padding: PaddingMode;
  channels: ChannelMaskRGBA;
  mode?: FilterMode;
}

function sampleWithPadding(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  padding: PaddingMode,
): [number, number, number, number] {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    if (padding === 'black') return [0, 0, 0, 255];
    if (padding === 'white') return [255, 255, 255, 255];
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const ci = (cy * width + cx) * 4;
    return [src[ci], src[ci + 1], src[ci + 2], src[ci + 3]];
  }
  const si = (y * width + x) * 4;
  return [src[si], src[si + 1], src[si + 2], src[si + 3]];
}

function applyKernelConvolution(params: ConvolveParams): Uint8ClampedArray {
  const { src, width, height, kernel, ksize, padding, channels } = params;
  const dst = new Uint8ClampedArray(src.length);
  const half = Math.floor(ksize / 2);
  const w = width;
  const h = height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;

      for (let ky = 0; ky < ksize; ky++) {
        const sy = y + ky - half;
        for (let kx = 0; kx < ksize; kx++) {
          const sx = x + kx - half;
          const k = kernel[ky * ksize + kx];
          if (k === 0) continue;
          const [r, g, b, a] = sampleWithPadding(src, w, h, sx, sy, padding);

          sumR += r * k;
          sumG += g * k;
          sumB += b * k;
          sumA += a * k;
        }
      }

      dst[di] = channels.r ? sumR : src[di];
      dst[di + 1] = channels.g ? sumG : src[di + 1];
      dst[di + 2] = channels.b ? sumB : src[di + 2];
      dst[di + 3] = channels.a ? sumA : src[di + 3];
    }
  }

  return dst;
}

function median9(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[4];
}

function applyMedian3(params: ConvolveParams): Uint8ClampedArray {
  const { src, width, height, padding, channels } = params;
  const dst = new Uint8ClampedArray(src.length);
  const rVals = new Array<number>(9);
  const gVals = new Array<number>(9);
  const bVals = new Array<number>(9);
  const aVals = new Array<number>(9);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      let idx = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const [r, g, b, a] = sampleWithPadding(src, width, height, x + kx, y + ky, padding);
          rVals[idx] = r;
          gVals[idx] = g;
          bVals[idx] = b;
          aVals[idx] = a;
          idx++;
        }
      }

      dst[di] = channels.r ? median9(rVals) : src[di];
      dst[di + 1] = channels.g ? median9(gVals) : src[di + 1];
      dst[di + 2] = channels.b ? median9(bVals) : src[di + 2];
      dst[di + 3] = channels.a ? median9(aVals) : src[di + 3];
    }
  }

  return dst;
}

export function convolve(params: ConvolveParams): Uint8ClampedArray {
  if (params.mode === 'median3') {
    return applyMedian3(params);
  }
  return applyKernelConvolution(params);
}

export function applyConvolution(
  image: PixelImage,
  kernel: number[],
  padding: PaddingMode,
  channels: ChannelMaskRGBA,
  mode: FilterMode = 'kernel',
): PixelImage {
  const data = convolve({
    src: image.data,
    width: image.width,
    height: image.height,
    kernel,
    ksize: KERNEL_SIZE,
    padding,
    channels,
    mode,
  });
  return { ...image, data };
}
