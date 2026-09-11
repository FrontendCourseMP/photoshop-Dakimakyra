export const VIEW_MODES = Object.freeze({
  gray: { label: "Grayscale", channels: ["gray"] },
  "gray-alpha": { label: "Grayscale + Alpha", channels: ["gray", "alpha"] },
  rgb: { label: "RGB", channels: ["red", "green", "blue"] },
  rgba: { label: "RGB + Alpha", channels: ["red", "green", "blue", "alpha"] },
});

export function grayValue(red, green, blue) {
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
}

// Режим просмотра не изменяет ни исходные пиксели, ни метаданные файла.
export function projectChannels(source, mode, enabled = new Set(VIEW_MODES[mode].channels)) {
  const result = new Uint8ClampedArray(source.length);
  const keys = VIEW_MODES[mode].channels;
  const alpha = keys.includes("alpha") && enabled.has("alpha");
  const maskOnly = alpha && !keys.some((key) => key !== "alpha" && enabled.has(key));
  for (let i = 0; i < source.length; i += 4) {
    if (maskOnly) {
      result[i] = result[i + 1] = result[i + 2] = source[i + 3];
    } else if (keys.includes("gray")) {
      result[i] = result[i + 1] = result[i + 2] = enabled.has("gray") ? grayValue(source[i], source[i + 1], source[i + 2]) : 0;
    } else {
      result[i] = enabled.has("red") ? source[i] : 0;
      result[i + 1] = enabled.has("green") ? source[i + 1] : 0;
      result[i + 2] = enabled.has("blue") ? source[i + 2] : 0;
    }
    result[i + 3] = alpha && !maskOnly ? source[i + 3] : 255;
  }
  return result;
}
