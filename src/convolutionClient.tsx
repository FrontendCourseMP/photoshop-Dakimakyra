import ConvolutionWorker from './convolution.worker?worker';
import type { WorkerRequest, WorkerResponse } from './convolution.worker';
import type { ChannelMaskRGBA, FilterMode, PaddingMode } from './convolution';
import type { PixelImage } from './types';
import { KERNEL_SIZE } from './convolution';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (buf: ArrayBuffer) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new ConvolutionWorker();
  w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const { id, buffer } = e.data;
    const cb = pending.get(id);
    if (cb) {
      pending.delete(id);
      cb(buffer);
    }
  });
  worker = w;
  return w;
}

export function convolveImage(
  image: PixelImage,
  kernel: number[],
  padding: PaddingMode,
  channels: ChannelMaskRGBA,
  mode: FilterMode = 'kernel',
): Promise<PixelImage> {
  const w = ensureWorker();
  const id = nextId++;
  const copy = new Uint8ClampedArray(image.data);
  const buffer = copy.buffer;
  const req: WorkerRequest = {
    id,
    buffer,
    width: image.width,
    height: image.height,
    kernel,
    ksize: KERNEL_SIZE,
    padding,
    channels,
    mode,
  };
  return new Promise<PixelImage>((resolve) => {
    pending.set(id, (outBuf) => {
      const data = new Uint8ClampedArray(outBuf);
      resolve({ ...image, data });
    });
    w.postMessage(req, [buffer]);
  });
}

export function cancelAllPending(): void {
  pending.clear();
}
