import type { PixelImage } from './types';
import type { LevelsTarget } from './levels';

export function computeHistogram(image: PixelImage, target: LevelsTarget): number[] {
  const hist = new Array(256).fill(0);
  const data = image.data;
  const n = image.width * image.height;

  if (target === 'master') {
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const lum = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
      hist[lum]++;
    }
  } else {
    const idx = { r: 0, g: 1, b: 2, a: 3 }[target];
    for (let i = 0; i < n; i++) {
      hist[data[i * 4 + idx]]++;
    }
  }

  return hist;
}

export function drawHistogram(
  ctx: CanvasRenderingContext2D,
  hist: number[],
  width: number,
  height: number,
  color: string,
  logScale: boolean,
): void {
  ctx.fillStyle = '#1e1117';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#5a2b38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();

  const transformed = logScale ? hist.map((v) => Math.log(1 + v)) : hist;
  let max = 0;
  for (const v of transformed) if (v > max) max = v;
  if (max === 0) return;

  const barWidth = width / 256;
  ctx.fillStyle = color;
  for (let i = 0; i < 256; i++) {
    const h = (transformed[i] / max) * (height - 2);
    if (h <= 0) continue;
    ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth), h);
  }
}
