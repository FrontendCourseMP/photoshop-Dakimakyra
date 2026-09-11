export const SCALE_LIMITS = Object.freeze({ minimum: 0.12, maximum: 3 });

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

export const INTERPOLATORS = Object.freeze({
  nearest: Object.freeze({ title: "Ближайший пиксель", note: "Быстро и без сглаживания. Подходит для пиксельной графики.", run: nearest }),
  bilinear: Object.freeze({ title: "Билинейный", note: "Смешивает четыре соседних пикселя и даёт плавные края.", run: bilinear }),
});

export function resizeRgba(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight, method = "bilinear") {
  assertImage(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight);
  const engine = INTERPOLATORS[method];
  if (!engine) throw new TypeError("Неизвестный алгоритм интерполяции.");
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return new Uint8ClampedArray(pixels);
  return engine.run(pixels, sourceWidth, sourceHeight, targetWidth, targetHeight);
}

export function fitScale(width, height, viewportWidth, viewportHeight, margin = 50) {
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const availableHeight = Math.max(1, viewportHeight - margin * 2);
  return Math.min(SCALE_LIMITS.maximum, Math.max(SCALE_LIMITS.minimum, Math.min(availableWidth / width, availableHeight / height)));
}

export function scaledSize(width, height, scale) {
  const safe = Math.min(SCALE_LIMITS.maximum, Math.max(SCALE_LIMITS.minimum, scale));
  return { width: Math.max(1, Math.round(width * safe)), height: Math.max(1, Math.round(height * safe)) };
}
