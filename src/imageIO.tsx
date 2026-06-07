import type { ImageFormat, PixelImage } from './types';
import { decodeGB7, encodeGB7, type GB7EncodeOptions } from './gb7';

function detectFormat(file: File, head: Uint8Array): ImageFormat {
  if (
    head.length >= 4 &&
    head[0] === 0x47 &&
    head[1] === 0x42 &&
    head[2] === 0x37 &&
    head[3] === 0x1d
  ) {
    return 'gb7';
  }
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return 'png';
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'jpeg';
  }
  const name = file.name.toLowerCase();
  if (name.endsWith('.gb7')) return 'gb7';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  return 'unknown';
}

async function decodeRaster(file: File, format: ImageFormat): Promise<PixelImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Не удалось получить 2D-контекст');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);

    let hasAlpha = false;
    if (format !== 'jpeg') {
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] !== 255) {
          hasAlpha = true;
          break;
        }
      }
    }

    const colorDepth = hasAlpha ? 32 : 24;
    return {
      width,
      height,
      data: new Uint8ClampedArray(imageData.data),
      meta: {
        format,
        colorDepth,
        colorDepthLabel: hasAlpha ? '32 бита (RGBA)' : '24 бита (RGB)',
        hasAlpha,
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось декодировать изображение'));
    img.src = url;
  });
}

export async function loadImageFile(file: File): Promise<PixelImage> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 8));
  const format = detectFormat(file, head);

  if (format === 'gb7') {
    return decodeGB7(buffer);
  }
  if (format === 'png' || format === 'jpeg') {
    return decodeRaster(file, format);
  }
  throw new Error('Этот формат файла не поддерживается');
}

function imageToCanvas(image: PixelImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось получить 2D-контекст');
  const imageData = new ImageData(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось создать файл'))),
      type,
      quality,
    );
  });
}

export async function encodeToBlob(
  image: PixelImage,
  format: 'png' | 'jpeg' | 'gb7',
  options?: { quality?: number; gb7?: GB7EncodeOptions },
): Promise<Blob> {
  if (format === 'gb7') {
    const bytes = encodeGB7(image, options?.gb7);
    return new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  }
  const canvas = imageToCanvas(image);
  if (format === 'png') {
    return canvasToBlob(canvas, 'image/png');
  }
  return canvasToBlob(canvas, 'image/jpeg', options?.quality ?? 0.92);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
