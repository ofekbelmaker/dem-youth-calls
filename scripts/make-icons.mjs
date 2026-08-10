/**
 * מייצר את אייקוני האפליקציה כקבצי PNG, בלי תלויות חיצוניות.
 *
 * הסימן: טבעת התקדמות — החלק המלא הוא מה שכבר נוצר איתו קשר.
 * זה בדיוק מה שהאפליקציה עושה, וזה גם ניתן לציור בחישוב פשוט
 * במקום נתיבי SVG ידניים.
 *
 * הרצה:  node scripts/make-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/* ---------- קידוד PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // כל שורה מקבלת בית filter=0 בתחילתה
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- ציור הסימן ---------- */

const BG = [0x2b, 0x4c, 0xe0];          // כחול הפעולה
const FG = [0xff, 0xff, 0xff];
const PROGRESS = 0.72;                   // חלק הטבעת שמלא

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function drawIcon(size, { padded }) {
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;

  // באייקון maskable צריך שוליים — אנדרואיד חותך עד 20% מכל צד
  const scale = padded ? 0.62 : 0.78;
  const outer = (size * scale) / 2;
  const thickness = size * (padded ? 0.10 : 0.13);
  const inner = outer - thickness;

  const AA = 1.2; // רוחב מעבר לריכוך קצוות

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);

      // זווית מ-12 בכיוון השעון, 0..1
      let ang = Math.atan2(dx, -dy) / (Math.PI * 2);
      if (ang < 0) ang += 1;

      // כיסוי הטבעת: 1 בתוך העובי, דועך בקצוות
      const band =
        Math.min(1, Math.max(0, (r - inner) / AA + 0.5)) *
        Math.min(1, Math.max(0, (outer - r) / AA + 0.5));

      let color = BG;
      if (band > 0) {
        // החלק שהושלם אטום; השארית רמז חיוור על אותו רקע
        const done = ang <= PROGRESS;
        const alpha = band * (done ? 1 : 0.28);
        color = mix(BG, FG, alpha);
      }

      const i = (y * size + x) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = 255;
    }
  }

  return encodePng(size, size, buf);
}

/* ---------- כתיבה ---------- */

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", 192, { padded: false }],
  ["icon-512.png", 512, { padded: false }],
  ["icon-maskable-512.png", 512, { padded: true }],
  ["apple-touch-icon.png", 180, { padded: false }],
  ["favicon-32.png", 32, { padded: false }],
];

for (const [name, size, opts] of files) {
  writeFileSync(join(OUT, name), drawIcon(size, opts));
  console.log("wrote public/" + name);
}
