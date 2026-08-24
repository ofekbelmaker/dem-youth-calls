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
import { existsSync, readFileSync } from "node:fs";
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

/* מזהי הפרויקט מוזנים ל-CLI כמשתני סביבה במקום להישען על חיפוש
   הגדרות בענן. בלעדיהם הפקודות נופלות ב-"Could not retrieve Project
   Settings" כשהפרויקט יושב תחת צוות והאסימון לא רואה את רשימת
   הצוותים — וזו נפילה על הרשאת קריאה, לא על יכולת ההעלאה עצמה. */
const linked = existsSync(join(ROOT, ".vercel", "project.json"))
  ? JSON.parse(readFileSync(join(ROOT, ".vercel", "project.json"), "utf8"))
  : {};

function vercel(args, input) {
  return spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "vercel@latest", ...args, "--token", TOKEN],
    {
      cwd: ROOT,
      input,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...(linked.orgId ? { VERCEL_ORG_ID: linked.orgId } : {}),
        ...(linked.projectId ? { VERCEL_PROJECT_ID: linked.projectId } : {}),
      },
    },
  );
}

/* ---------- 1. קישור הפרויקט ---------- */

/* אם .vercel/project.json כבר קיים, הפרויקט מקושר ואין מה לעשות.
   הדילוג הוא לא ייעול: אסימון מוגבל-פרויקט נכשל דווקא ב-link
   ומצליח ב-deploy, וקישור מחדש היה עוצר העלאה תקינה לחלוטין. */
if (existsSync(join(ROOT, ".vercel", "project.json"))) {
  console.log("הפרויקט כבר מקושר — מדלג על הקישור");
} else {
  console.log("מקשר פרויקט…");
  const link = vercel(["link", "--yes", "--project", PROJECT]);
  if (link.status !== 0) {
    console.error(link.stdout);
    console.error(link.stderr);
    process.exit(1);
  }
  console.log("  מקושר: " + PROJECT);
}

/* ---------- 2. משתני סביבה ---------- */

let envFailed = false;
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
  console.log(`  ${ok ? "✓" : "⚠"} ${name} (${value.length} תווים)`);
  if (!ok) envFailed = true;
}

/* כישלון כאן אינו עוצר את ההעלאה. אסימון מוגבל-פרויקט אינו רשאי
   לכתוב משתני סביבה אך רשאי להעלות, והערכים שכבר בענן נשארים
   כפי שהם — כלומר ההעלאה תקינה. מה שכן: אם שינית קוד גישה, הוא
   לא עבר, ותצטרך לעדכן אותו ידנית בממשק של Vercel. */
if (envFailed) {
  console.log(
    "\n  ⚠ לא ניתן היה לכתוב משתני סביבה — האסימון כנראה מוגבל-פרויקט.",
  );
  console.log("    הערכים שכבר בענן נשמרים, וההעלאה ממשיכה.");
  console.log("    אם שינית קוד גישה — עדכן אותו ידנית בהגדרות הפרויקט.");
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
