import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const out = '.tmp-gb7.mjs';
await build({
  entryPoints: ['src/gb7.tsx'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { decodeGB7, encodeGB7 } = await import(pathToFileURL(out).href + '?t=' + Date.now());

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) failures++;
}

function load(path) {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

const g = decodeGB7(load('samples/gradient-half-mask.gb7'));
check('gradient dims 32x32', g.width === 32 && g.height === 32);
check('gradient has mask', g.hasMask === true);
check('gradient meta depth 8', g.meta.colorDepth === 8);
check('gradient rgba length', g.data.length === 32 * 32 * 4);
check('gradient pixel is gray (r==g==b)', g.data[0] === g.data[1] && g.data[1] === g.data[2]);
const anyTransparent = (() => {
  for (let i = 3; i < g.data.length; i += 4) if (g.data[i] === 0) return true;
  return false;
})();
check('gradient has transparent pixels (half mask)', anyTransparent);

const v = decodeGB7(load('samples/vertical-kapibara.gb7'));
check('vertical dims 1080x1920', v.width === 1080 && v.height === 1920);
check('vertical no mask', v.hasMask === false);
check('vertical meta depth 7', v.meta.colorDepth === 7);
check('vertical all opaque', v.data[3] === 255 && v.data[v.data.length - 1] === 255);

const re = decodeGB7(encodeGB7(g, { includeMask: true }).buffer);
check('roundtrip dims preserved', re.width === g.width && re.height === g.height);
let maxGrayErr = 0;
let alphaMismatch = 0;
for (let i = 0; i < g.data.length; i += 4) {
  maxGrayErr = Math.max(maxGrayErr, Math.abs(re.data[i] - g.data[i]));
  if ((re.data[i + 3] === 0) !== (g.data[i + 3] === 0)) alphaMismatch++;
}
check('roundtrip gray error <= 2', maxGrayErr <= 2);
check('roundtrip mask preserved exactly', alphaMismatch === 0);

const enc = encodeGB7(v, { includeMask: false });
check('encoder signature', enc[0] === 0x47 && enc[1] === 0x42 && enc[2] === 0x37 && enc[3] === 0x1d);
check('encoder version 1', enc[4] === 0x01);
check('encoder mask flag 0', enc[5] === 0x00);
check('encoder size = 12 + w*h', enc.length === 12 + v.width * v.height);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
