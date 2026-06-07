import type { PixelImage } from './types';

export type ChannelKey = 'r' | 'g' | 'b' | 'a' | 'gray';

export interface ChannelInfo {
  key: ChannelKey;
  label: string;
}

export interface ChannelMask {
  r: boolean;
  g: boolean;
  b: boolean;
  a: boolean;
  gray: boolean;
}

export const FULL_MASK: ChannelMask = { r: true, g: true, b: true, a: true, gray: true };

export function listChannels(image: PixelImage): ChannelInfo[] {
  const isGray = image.meta.format === 'gb7';
  const hasAlpha = image.meta.hasAlpha;

  if (isGray) {
    const list: ChannelInfo[] = [{ key: 'gray', label: 'Серый канал' }];
    if (hasAlpha) list.push({ key: 'a', label: 'Альфа' });
    return list;
  }

  const list: ChannelInfo[] = [
    { key: 'r', label: 'Красный' },
    { key: 'g', label: 'Зеленый' },
    { key: 'b', label: 'Синий' },
  ];
  if (hasAlpha) list.push({ key: 'a', label: 'Альфа' });
  return list;
}

export function buildChannelThumbnail(image: PixelImage, key: ChannelKey): ImageData {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];

    let or = 0;
    let og = 0;
    let ob = 0;
    let oa = 255;

    if (key === 'r') {
      or = r;
    } else if (key === 'g') {
      og = g;
    } else if (key === 'b') {
      ob = b;
    } else if (key === 'gray') {
      or = og = ob = r;
    } else if (key === 'a') {
      or = og = ob = a;
    }

    out[o] = or;
    out[o + 1] = og;
    out[o + 2] = ob;
    out[o + 3] = oa;
  }

  return new ImageData(out, width, height);
}

export function applyChannelMask(image: PixelImage, mask: ChannelMask): ImageData {
  const { width, height, data } = image;
  const isGray = image.meta.format === 'gb7';
  const out = new Uint8ClampedArray(width * height * 4);

  const onlyAlpha =
    mask.a && !mask.r && !mask.g && !mask.b && !mask.gray && image.meta.hasAlpha;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];

    if (onlyAlpha) {
      out[o] = a;
      out[o + 1] = a;
      out[o + 2] = a;
      out[o + 3] = 255;
      continue;
    }

    if (isGray) {
      const v = mask.gray ? r : 0;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = mask.a ? a : 255;
    } else {
      out[o] = mask.r ? r : 0;
      out[o + 1] = mask.g ? g : 0;
      out[o + 2] = mask.b ? b : 0;
      out[o + 3] = mask.a ? a : 255;
    }
  }

  return new ImageData(out, width, height);
}

export function defaultMask(): ChannelMask {
  return { r: true, g: true, b: true, a: true, gray: true };
}
