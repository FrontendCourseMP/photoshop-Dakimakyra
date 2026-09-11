function linearComponent(component) {
  const value = Math.min(255, Math.max(0, component)) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function labCurve(value) {
  const border = (6 / 29) ** 3;
  return value > border ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29;
}

export function rgbToLab(red, green, blue) {
  const r = linearComponent(red);
  const g = linearComponent(green);
  const b = linearComponent(blue);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = labCurve(x);
  const fy = labCurve(y);
  const fz = labCurve(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function relativeLuminance(red, green, blue) {
  return 0.2126 * linearComponent(red) + 0.7152 * linearComponent(green) + 0.0722 * linearComponent(blue);
}
