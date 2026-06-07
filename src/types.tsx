export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  meta: ImageMeta;
}

export type ImageFormat = 'png' | 'jpeg' | 'gb7' | 'unknown';

export interface ImageMeta {
  format: ImageFormat;
  colorDepth: number;
  colorDepthLabel: string;
  hasAlpha: boolean;
}

export type ToolMode = 'hand' | 'eyedropper';

export interface PixelSample {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}
