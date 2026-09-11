export const FILTERS = Object.freeze({
  identity: Object.freeze({ label: "Без изменений", type: "kernel", matrix: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]) }),
  sharpen: Object.freeze({ label: "Чёткие детали", type: "kernel", matrix: Object.freeze([0, -1, 0, -1, 5, -1, 0, -1, 0]) }),
  gaussian: Object.freeze({ label: "Мягкое размытие Гаусса", type: "kernel", matrix: Object.freeze([1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16]) }),
  box: Object.freeze({ label: "Равномерное размытие", type: "kernel", matrix: Object.freeze(Array(9).fill(1 / 9)) }),
  prewittH: Object.freeze({ label: "Прюитт: вертикальные границы", type: "kernel", matrix: Object.freeze([-1, 0, 1, -1, 0, 1, -1, 0, 1]) }),
  prewittV: Object.freeze({ label: "Прюитт: горизонтальные границы", type: "kernel", matrix: Object.freeze([-1, -1, -1, 0, 0, 0, 1, 1, 1]) }),
  median: Object.freeze({ label: "Медиана 3×3", type: "median", matrix: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]) }),
});

function verify(pixels, width, height, options) {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) throw new TypeError("Неверный RGBA-буфер.");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new TypeError("Неверный размер изображения.");
  if (!["kernel", "median"].includes(options?.type)) throw new TypeError("Неизвестный фильтр.");
  if (!["extend", "black", "white"].includes(options.edge)) throw new TypeError("Неизвестное заполнение края.");
  if (!Array.isArray(options.channels) || options.channels.length === 0) throw new TypeError("Не выбран ни один канал.");
  if (options.type === "kernel" && (!Array.isArray(options.matrix) || options.matrix.length !== 9 || options.matrix.some((value) => !Number.isFinite(value)))) {
    throw new TypeError("Ядро должно содержать девять чисел.");
  }
}

function sample(pixels, width, height, x, y, channel, edge) {
  if (x >= 0 && y >= 0 && x < width && y < height) return pixels[(y * width + x) * 4 + channel];
  if (edge === "extend") {
    const safeX = Math.max(0, Math.min(width - 1, x));
    const safeY = Math.max(0, Math.min(height - 1, y));
    return pixels[(safeY * width + safeX) * 4 + channel];
  }
  if (channel === 3) return edge === "black" ? 0 : 255;
  return edge === "white" ? 255 : 0;
}

function filterRows(source, output, width, height, options, fromY, toY) {
  const channels = [...new Set(options.channels)];
  for (let y = fromY; y < toY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      for (const channel of channels) {
        if (options.type === "median") {
          const values = [];
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) values.push(sample(source, width, height, x + dx, y + dy, channel, options.edge));
          }
          values.sort((a, b) => a - b);
          output[destination + channel] = values[4];
          continue;
        }
        let sum = 0;
        let cell = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += sample(source, width, height, x + dx, y + dy, channel, options.edge) * options.matrix[cell];
            cell += 1;
          }
        }
        output[destination + channel] = Math.round(sum);
      }
    }
  }
}

export function applyFilter(pixels, width, height, options, report = null) {
  verify(pixels, width, height, options);
  const output = new Uint8ClampedArray(pixels);
  const block = Math.max(1, Math.ceil(height / 24));
  for (let row = 0; row < height; row += block) {
    const end = Math.min(height, row + block);
    filterRows(pixels, output, width, height, options, row, end);
    report?.(end / height);
  }
  return output;
}

export async function applyFilterInSlices(pixels, width, height, options, controls = {}) {
  verify(pixels, width, height, options);
  const output = new Uint8ClampedArray(pixels);
  const block = Math.max(1, controls.rowsPerSlice || 8);
  for (let row = 0; row < height; row += block) {
    if (controls.cancelled?.()) return null;
    const end = Math.min(height, row + block);
    filterRows(pixels, output, width, height, options, row, end);
    controls.progress?.(end / height);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output;
}
