import type { PixelImage } from './types';

export interface LevelsParams {
  black: number;
  white: number;
  gamma: number;
}

export type LevelsTarget = 'master' | 'r' | 'g' | 'b' | 'a';

export interface AllLevels {
  master: LevelsParams;
  r: LevelsParams;
  g: LevelsParams;
  b: LevelsParams;
  a: LevelsParams;
}

export const TARGETS: { key: LevelsTarget; label: string }[] = [
  { key: 'master', label: 'Master (RGB)' },
  { key: 'r', label: 'Красный' },
  { key: 'g', label: 'Зелёный' },
  { key: 'b', label: 'Синий' },
  { key: 'a', label: 'Альфа' },
];

export const DEFAULT_PARAMS: LevelsParams = { black: 0, white: 255, gamma: 1.0 };

export function defaultAllLevels(): AllLevels {
  return {
    master: { ...DEFAULT_PARAMS },
    r: { ...DEFAULT_PARAMS },
    g: { ...DEFAULT_PARAMS },
    b: { ...DEFAULT_PARAMS },
    a: { ...DEFAULT_PARAMS },
  };
}

export function isIdentity(p: LevelsParams): boolean {
  return p.black === 0 && p.white === 255 && Math.abs(p.gamma - 1.0) < 1e-6;
}

export function isAllIdentity(levels: AllLevels): boolean {
  return (
    isIdentity(levels.master) &&
    isIdentity(levels.r) &&
    isIdentity(levels.g) &&
    isIdentity(levels.b) &&
    isIdentity(levels.a)
  );
}

export function buildLut(p: LevelsParams): Uint8Array {
  const lut = new Uint8Array(256);
  const range = p.white - p.black;
  const invGamma = 1 / p.gamma;
  for (let i = 0; i < 256; i++) {
    if (range <= 0) {
      lut[i] = i < p.black ? 0 : 255;
      continue;
    }
    const n = (i - p.black) / range;
    if (n <= 0) lut[i] = 0;
    else if (n >= 1) lut[i] = 255;
    else lut[i] = Math.round(Math.pow(n, invGamma) * 255);
  }
  return lut;
}

export function midRelToGamma(midRel: number): number {
  const r = Math.max(0.001, Math.min(0.999, midRel));
  const g = Math.log(r) / Math.log(0.5);
  return Math.max(0.1, Math.min(9.9, g));
}

export function gammaToMidRel(gamma: number): number {
  const g = Math.max(0.1, Math.min(9.9, gamma));
  return Math.pow(0.5, g);
}

export function applyAllLevels(image: PixelImage, levels: AllLevels): PixelImage {
  if (isAllIdentity(levels)) {
    return image;
  }
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);

  const masterLut = isIdentity(levels.master) ? null : buildLut(levels.master);
  const rLut = isIdentity(levels.r) ? null : buildLut(levels.r);
  const gLut = isIdentity(levels.g) ? null : buildLut(levels.g);
  const bLut = isIdentity(levels.b) ? null : buildLut(levels.b);
  const aLut = isIdentity(levels.a) ? null : buildLut(levels.a);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    let r = data[o];
    let g = data[o + 1];
    let b = data[o + 2];
    let a = data[o + 3];

    if (masterLut) {
      r = masterLut[r];
      g = masterLut[g];
      b = masterLut[b];
    }
    if (rLut) r = rLut[r];
    if (gLut) g = gLut[g];
    if (bLut) b = bLut[b];
    if (aLut) a = aLut[a];

    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }

  return { width, height, data: out, meta: image.meta };
}
