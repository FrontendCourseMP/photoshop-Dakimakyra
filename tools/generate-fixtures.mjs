import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { encodeGB7 } from "../dist/js/formats.js";

const width = 360;
const height = 240;
const rgba = new Uint8ClampedArray(width * height * 4);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const band = Math.floor((x + y * 0.65) / 38) % 4;
    const palette = [
      [77, 62, 255],
      [255, 112, 55],
      [36, 213, 162],
      [255, 213, 73],
    ][band];
    const distance = Math.hypot(x - width * 0.68, y - height * 0.46);
    const circle = distance < 58;
    rgba[offset] = circle ? 242 : Math.round(palette[0] * (0.6 + x / width * 0.4));
    rgba[offset + 1] = circle ? 245 : Math.round(palette[1] * (0.65 + y / height * 0.35));
    rgba[offset + 2] = circle ? 255 : palette[2];
    rgba[offset + 3] = circle ? Math.round(Math.max(0.15, distance / 58) * 255) : 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? (0xedb88320 ^ (result >>> 1)) : (result >>> 1);
  return result >>> 0;
});

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

function chunk(type, payload) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, payload])) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return Buffer.concat([uint32(payload.length), name, payload, uint32((crc ^ 0xffffffff) >>> 0)]);
}

function pngBuffer() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    rows[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, row + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL("../dist/test-images/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/test-images/color-bands-alpha.png", import.meta.url), pngBuffer());
const grayBit = encodeGB7({ width, height, pixels: rgba });
writeFileSync(new URL("../dist/test-images/color-bands-mask.gb7", import.meta.url), grayBit.bytes);
console.log(`Созданы PNG и GB7: ${width} × ${height}`);
