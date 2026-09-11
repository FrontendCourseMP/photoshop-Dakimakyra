import { relativeLuminance } from "./color-space.js";

export const GAMMA_RANGE = Object.freeze({ minimum: 0.1, maximum: 9.9 });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function neutralLevel(maximum = 255) {
  return { shadow: 0, gamma: 1, highlight: maximum };
}

export function makeLut(settings, maximum = 255) {
  const shadow = clamp(Math.round(settings.shadow), 0, maximum - 1);
  const highlight = clamp(Math.round(settings.highlight), shadow + 1, maximum);
  const gamma = clamp(Number(settings.gamma) || 1, GAMMA_RANGE.minimum, GAMMA_RANGE.maximum);
  const span = highlight - shadow;
  const lut = new Uint8ClampedArray(256);
  for (let input = 0; input < 256; input += 1) {
    const level = (input / 255) * maximum;
    const normalized = clamp((level - shadow) / span, 0, 1);
    lut[input] = Math.round((normalized ** gamma) * 255);
  }
  return lut;
}

export function histogram(pixels, channel, maximum = 255) {
  const bins = new Uint32Array(maximum + 1);
  const component = { red: 0, gray: 0, green: 1, blue: 2, alpha: 3 }[channel];
  for (let index = 0; index < pixels.length; index += 4) {
    const ratio = channel === "master"
      ? relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2])
      : pixels[index + component] / 255;
    bins[Math.round(clamp(ratio, 0, 1) * maximum)] += 1;
  }
  return bins;
}

export function processLevels(pixels, model, settings, maximum = 255) {
  const output = new Uint8ClampedArray(pixels.length);
  const master = makeLut(settings.master || neutralLevel(maximum), maximum);
  const alpha = makeLut(settings.alpha || neutralLevel(maximum), maximum);
  const grayscale = model === "gray" || model === "gray-alpha";
  const carriesAlpha = model === "gray-alpha" || model === "rgba";
  const channelLuts = grayscale
    ? [makeLut(settings.gray || neutralLevel(maximum), maximum)]
    : ["red", "green", "blue"].map((name) => makeLut(settings[name] || neutralLevel(maximum), maximum));

  for (let index = 0; index < pixels.length; index += 4) {
    if (grayscale) {
      const value = channelLuts[0][master[pixels[index]]];
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
    } else {
      output[index] = channelLuts[0][master[pixels[index]]];
      output[index + 1] = channelLuts[1][master[pixels[index + 1]]];
      output[index + 2] = channelLuts[2][master[pixels[index + 2]]];
    }
    output[index + 3] = carriesAlpha ? alpha[pixels[index + 3]] : pixels[index + 3];
  }
  return output;
}

export function gammaFromMarker(marker, shadow, highlight) {
  const ratio = clamp((marker - shadow) / Math.max(1, highlight - shadow), 0, 1);
  return ratio <= 0.5
    ? GAMMA_RANGE.minimum * 10 ** (ratio * 2)
    : GAMMA_RANGE.maximum ** ((ratio - 0.5) * 2);
}

export function markerFromGamma(gamma, shadow, highlight) {
  const value = clamp(gamma, GAMMA_RANGE.minimum, GAMMA_RANGE.maximum);
  const ratio = value <= 1
    ? Math.log10(value / GAMMA_RANGE.minimum) / 2
    : 0.5 + Math.log(value) / Math.log(GAMMA_RANGE.maximum) / 2;
  return shadow + ratio * (highlight - shadow);
}
