/* global __dirname */
// Compile the existing code-native crayfish mark to Android's monochrome PNG.
// The full-color app icon is separate; the original Logo.png stays untouched.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const root = path.resolve(__dirname, "..");
async function main() {
  const original = fs.readFileSync(path.join(root, "src/components/icons/CrayfishIcon.js"), "utf8");
  const shapes = original.match(/<(?:Path|Circle)\s[\s\S]*?\/>/g);
  if (!shapes?.length) throw new Error("Existing crayfish vector mark is missing.");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64" fill="none">\n${shapes.map(shape => shape
    .replace(/<Path/g, "<path").replace(/<Circle/g, "<circle")
    .replace(/\{color\}/g, '"#FFFFFF"')
    .replace(/strokeWidth/g, "stroke-width").replace(/strokeLinecap/g, "stroke-linecap").replace(/strokeLinejoin/g, "stroke-linejoin")).join("\n")}\n</svg>\n`;
  const source = path.join(root, "assets/images/craythrive-notification-icon.svg");
  fs.writeFileSync(source, svg);
  fs.writeFileSync(path.join(root, "assets/images/craythrive-notification-icon.png"), renderMark(shapes));
  console.log("Prepared transparent white Android notification icon from CrayfishIcon.js.");
}
// Small deterministic stroke renderer for this repo's M/C/L/H/Z vector mark.
// Supersampling keeps the 96px white alpha mask smooth without an SVG binary.
function renderMark(shapes) {
  const size = 96, sample = 4, high = size * sample, scale = high / 64;
  const mask = new Uint8Array(high * high);
  function disk(x, y, radius) {
    x *= scale; y *= scale; radius *= scale;
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(high - 1, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(high - 1, Math.ceil(x + radius)); px++) {
        if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= radius ** 2) mask[py * high + px] = 255;
      }
    }
  }
  function line(from, to, radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) * scale));
    for (let i = 0; i <= steps; i++) disk(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps, radius);
  }
  for (const shape of shapes) {
    const attr = name => shape.match(new RegExp(`${name}="([^"]+)"`))?.[1];
    if (shape.startsWith("<Circle")) { disk(Number(attr("cx")), Number(attr("cy")), Number(attr("r"))); continue; }
    const pathData = attr("d");
    if (/[A-BD-GI-KN-Y]/i.test(pathData)) throw new Error("Unsupported path command; extend the mark compiler deliberately.");
    const tokens = pathData.match(/[MCLHZ]|-?\d+(?:\.\d+)?/g);
    const radius = Number(attr("strokeWidth")) / 2;
    let point = [0, 0], start = point, pos = 0;
    const number = () => Number(tokens[pos++]);
    while (pos < tokens.length) {
      const command = tokens[pos++];
      if (command === "M") { point = [number(), number()]; start = point; }
      else if (command === "L" || command === "H" || command === "Z") {
        const next = command === "Z" ? start : command === "H" ? [number(), point[1]] : [number(), number()];
        line(point, next, radius); point = next;
      } else if (command === "C") {
        const a = [number(), number()], b = [number(), number()], end = [number(), number()];
        for (let i = 0; i <= 128; i++) {
          const t = i / 128, u = 1 - t;
          disk(u ** 3 * point[0] + 3 * u ** 2 * t * a[0] + 3 * u * t ** 2 * b[0] + t ** 3 * end[0],
            u ** 3 * point[1] + 3 * u ** 2 * t * a[1] + 3 * u * t ** 2 * b[1] + t ** 3 * end[1], radius);
        }
        point = end;
      } else throw new Error(`Unsupported vector command ${command}`);
    }
  }
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let alpha = 0;
    for (let sy = 0; sy < sample; sy++) for (let sx = 0; sx < sample; sx++) alpha += mask[(y * sample + sy) * high + x * sample + sx];
    const offset = (y * size + x) * 4;
    png.data[offset] = png.data[offset + 1] = png.data[offset + 2] = 255;
    png.data[offset + 3] = Math.round(alpha / (sample * sample));
  }
  return PNG.sync.write(png);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
