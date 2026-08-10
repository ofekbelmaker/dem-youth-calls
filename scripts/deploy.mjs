/**
 * העלאה ל-Vercel בלי דו-שיח בטרמינל.
 *
 *   node scripts/deploy.mjs
 *
 * קורא את האסימון ואת משתני הסביבה מ-.env.local, מקשר פרויקט,
 * מעביר את הסודות להגדרות הענן, ומעלה לייצור.
 *
 * ערכי הסודות לעולם לא מודפסים למסך — רק שמות ואורכים.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const cfg = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();

const TOKEN = cfg("VERCEL_TOKEN");
if (!TOKEN) {
  console.error("חסר VERCEL_TOKEN ב-.env.local");
  process.exit(1);
}

const PROJECT = "dem-youth-calls";

/** משתנים שחייבים להיות בענן כדי שהאפליקציה תעבוד */
const REQUIRED = [
  "CALLER_ACCESS_CODE",
  "ADMIN_ACCESS_CODE",
  "SESSION_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function vercel(args, input) {
  return spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "vercel@latest", ...args, "--token", TOKEN],
    {
      cwd: ROOT,
      input,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
}

/* ---------- 1. קישור הפרויקט ---------- */

console.log("מקשר פרויקט…");
const link = vercel(["link", "--yes", "--project", PROJECT]);
if (link.status !== 0) {
  console.error(link.stdout);
  console.error(link.stderr);
  process.exit(1);
}
console.log("  מקושר: " + PROJECT);

/* ---------- 2. משתני סביבה ---------- */

console.log("\nמעביר משתני סביבה:");

for (const name of REQUIRED) {
  const value = cfg(name);
  if (!value) {
    console.error(`  ${name} — חסר ב-.env.local, עוצר`);
    process.exit(1);
  }

  /* מסירים ערך קודם כדי שהרצה חוזרת תעדכן ולא תיכשל */
  vercel(["env", "rm", name, "production", "--yes"]);

  const add = vercel(["env", "add", name, "production"], value + "\n");
  const ok = add.status === 0;
  console.log(`  ${ok ? "✓" : "✗"} ${name} (${value.length} תווים)`);
  if (!ok) {
    console.error(add.stderr.slice(0, 400));
    process.exit(1);
  }
}

/* אבחון הקודים כבוי בייצור */
vercel(["env", "rm", "DEBUG_CODES", "production", "--yes"]);
vercel(["env", "add", "DEBUG_CODES", "production"], "0\n");

/* ---------- 3. העלאה ---------- */

console.log("\nבונה ומעלה — זה לוקח כמה דקות…");
const deploy = vercel(["deploy", "--prod", "--yes"]);

const output = (deploy.stdout ?? "") + (deploy.stderr ?? "");
if (deploy.status !== 0) {
  console.error(output.slice(-2500));
  process.exit(1);
}

const url = output.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();

console.log("\n════════════════════════════════");
console.log(url ? "הכתובת: " + url : "הועלה, אך לא זוהתה כתובת בפלט:");
if (!url) console.log(output.slice(-1200));
console.log("════════════════════════════════");
