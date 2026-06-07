import { convolve, type ConvolveParams } from './convolution';

export interface WorkerRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  kernel: number[];
  ksize: number;
  padding: ConvolveParams['padding'];
  channels: ConvolveParams['channels'];
  mode?: ConvolveParams['mode'];
}

export interface WorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const { id, buffer, width, height, kernel, ksize, padding, channels, mode } = e.data;
  const src = new Uint8ClampedArray(buffer);
  const out = convolve({ src, width, height, kernel, ksize, padding, channels, mode });
  const outBuf = out.buffer as ArrayBuffer;
  const reply: WorkerResponse = { id, buffer: outBuf };
  (self as unknown as Worker).postMessage(reply, [outBuf]);
});
