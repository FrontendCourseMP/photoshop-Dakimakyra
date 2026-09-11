import { decodeGB7, encodeGB7 } from "./formats.js";

const DEMOS = Object.freeze({
  gradient: Object.freeze({ name: "gradient-demo.gb7", width: 512, height: 320 }),
  mask: Object.freeze({ name: "mask-demo.gb7", width: 640, height: 420 }),
  vertical: Object.freeze({ name: "vertical-demo.gb7", width: 720, height: 1080 }),
});

function gradientPixel(x, y, width, height) {
  const light = Math.round((x / Math.max(1, width - 1)) * 255);
  const visible = y > height * 0.18 && x + y * 0.8 > width * 0.24;
  return { light, alpha: visible ? 255 : 0 };
}

function maskPixel(x, y, width, height) {
  const dx = x - width / 2;
  const dy = y - height / 2;
  const distance = Math.hypot(dx, dy);
  const rings = (Math.floor(distance / 24) % 2) * 118;
  const checker = (Math.floor(x / 52) + Math.floor(y / 52)) % 2;
  const light = Math.min(255, 55 + rings + checker * 62);
  const visible = distance < Math.min(width, height) * 0.43 && !(Math.abs(dx) < 34 && Math.abs(dy) < 120);
  return { light, alpha: visible ? 255 : 0 };
}

function verticalPixel(x, y, width, height) {
  const wave = Math.sin(x / 28 + y / 73) * 38;
  const bands = (Math.floor(x / 90) % 2) * 52;
  const light = Math.max(0, Math.min(255, Math.round(28 + y / height * 150 + wave + bands)));
  const visible = y < height * 0.92 || x > width * 0.2;
  return { light, alpha: visible ? 255 : 0 };
}

const PAINTERS = Object.freeze({ gradient: gradientPixel, mask: maskPixel, vertical: verticalPixel });

export function createDemoImage(key) {
  const definition = DEMOS[key];
  const paint = PAINTERS[key];
  if (!definition || !paint) throw new Error("Такого примера нет.");

  const pixels = new Uint8ClampedArray(definition.width * definition.height * 4);
  for (let y = 0; y < definition.height; y += 1) {
    for (let x = 0; x < definition.width; x += 1) {
      const index = (y * definition.width + x) * 4;
      const sample = paint(x, y, definition.width, definition.height);
      pixels[index] = sample.light;
      pixels[index + 1] = sample.light;
      pixels[index + 2] = sample.light;
      pixels[index + 3] = sample.alpha;
    }
  }

  const encoded = encodeGB7({ width: definition.width, height: definition.height, pixels });
  const decoded = decodeGB7(encoded.bytes.buffer);
  return {
    image: {
      name: definition.name,
      format: "gb7",
      label: "GrayBit-7",
      width: definition.width,
      height: definition.height,
      model: decoded.masked ? "gray-alpha" : "gray",
      depth: decoded.masked ? "7 бит + маска" : "7 бит",
      maxLevel: 127,
      fileSize: encoded.bytes.byteLength,
    },
    pixels: decoded.pixels,
  };
}
