'use strict';
// Generates build/icon.png (1024x1024) with no image dependencies.
// electron-builder turns it into .icns / .ico automatically.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const S = 1024, SS = 3; // 3x3 supersampling

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inTriangle = (px, py, a, b, c) => {
  const d = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p = [px, py];
  const d1 = d(p, a, b), d2 = d(p, b, c), d3 = d(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

function shade(x, y) {
  // returns [r,g,b,a]
  if (!inRoundRect(x, y, 0, 0, S, S, 228)) return [0, 0, 0, 0];
  const folder = inRoundRect(x, y, 190, 300, 470, 430, 34) || inRoundRect(x, y, 190, 372, 834, 812, 52)
              || inRoundRect(x, y, 190, 334, 300, 760, 0); // straightens the seam on the left edge
  const play = inTriangle(x, y, [452, 508], [452, 706], [636, 607]);
  if (play && folder) return [255, 255, 255, 255];
  if (folder) {
    const t = (y - 300) / 512;                       // blue gradient down the folder
    return [Math.round(90 - 20 * t), Math.round(168 - 40 * t), Math.round(255 - 30 * t), 255];
  }
  const t = y / S;                                    // dark background gradient
  return [Math.round(35 - 15 * t), Math.round(40 - 17 * t), Math.round(50 - 20 * t), 255];
}

const raw = Buffer.alloc(S * (S * 4 + 1));
let o = 0;
for (let y = 0; y < S; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const p = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
      r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
    }
    const n = SS * SS;
    raw[o++] = a ? Math.round(r / a) : 0;
    raw[o++] = a ? Math.round(g / a) : 0;
    raw[o++] = a ? Math.round(b / a) : 0;
    raw[o++] = Math.round(a / n);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
