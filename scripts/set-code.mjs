/**
 * שינוי קודי הכניסה בפקודה אחת, בלי לפתוח את הקובץ.
 *
 *   node scripts/set-code.mjs --caller "קוד לטלפנים"
 *   node scripts/set-code.mjs --admin "קוד לרכז"
 *   node scripts/set-code.mjs --caller "אחד" --admin "שניים"
 *   node scripts/set-code.mjs --logout-all
 *   node scripts/set-code.mjs --show
 *
 * שינוי קוד לבדו לא מנתק אף אחד — הקוד נבדק רק בכניסה הראשונה.
 * --logout-all מחליף את מפתח החתימה, וזה כן מנתק את כולם.
 *
 * הקובץ נכתב ב-UTF-8 בלי BOM, כדי שקודים בעברית יישארו קריאים.
 * הערות וסדר השורות נשמרים.
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- קריאת ארגומנטים ---------- */

function parseArgs(argv) {
  const out = {
    caller: null,
    admin: null,
    show: false,
    logoutAll: false,
    file: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--show") out.show = true;
    else if (a === "--logout-all") out.logoutAll = true;
    else if (a === "--caller") out.caller = argv[++i] ?? null;
    else if (a === "--admin") out.admin = argv[++i] ?? null;
    else if (a === "--file") out.file = argv[++i] ?? null;
    else {
      console.error(`ארגומנט לא מוכר: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const envPath = args.file ?? join(ROOT, ".env.local");

if (!existsSync(envPath)) {
  console.error(`הקובץ לא נמצא: ${envPath}`);
  console.error("העתק את .env.example ל-.env.local והרץ שוב.");
  process.exit(1);
}

const original = readFileSync(envPath, "utf8");

/* ---------- קריאת הערכים הנוכחיים ---------- */

function readValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

if (args.show) {
  for (const key of ["CALLER_ACCESS_CODE", "ADMIN_ACCESS_CODE"]) {
    console.log(`${key}=${readValue(original, key) ?? "(לא מוגדר)"}`);
  }
  process.exit(0);
}

if (args.caller === null && args.admin === null && !args.logoutAll) {
  console.error("לא צוין מה לשנות. דוגמאות:");
  console.error('  node scripts/set-code.mjs --caller "קוד חדש"');
  console.error("  node scripts/set-code.mjs --logout-all");
  process.exit(1);
}

/* ---------- בדיקות ---------- */

const nextCaller = args.caller ?? readValue(original, "CALLER_ACCESS_CODE");
const nextAdmin = args.admin ?? readValue(original, "ADMIN_ACCESS_CODE");

for (const [label, value] of [
  ["קוד הטלפנים", args.caller],
  ["קוד הרכז", args.admin],
]) {
  if (value === null) continue;
  if (!value.trim()) {
    console.error(`${label} ריק.`);
    process.exit(1);
  }
  if (value !== value.trim()) {
    console.error(`${label} מכיל רווח בתחילתו או בסופו. הסר אותו.`);
    process.exit(1);
  }
  if (value.includes("\n")) {
    console.error(`${label} מכיל שורה חדשה.`);
    process.exit(1);
  }
}

/* שני קודים זהים מבטלים את ההפרדה בין טלפן לרכז.
   ההשוואה חסרת רגישות לאותיות, בדיוק כמו בבדיקה בשרת. */
const norm = (v) => v.trim().toLocaleLowerCase("he");
if (nextCaller && nextAdmin && norm(nextCaller) === norm(nextAdmin)) {
  console.error("שני הקודים זהים. תצוגת הרכז לא תיפתח עם קוד כזה.");
  process.exit(1);
}

/* ---------- כתיבה ---------- */

function setValue(text, key, value) {
  if (value === null) return text;
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

let updated = original;
updated = setValue(updated, "CALLER_ACCESS_CODE", args.caller);
updated = setValue(updated, "ADMIN_ACCESS_CODE", args.admin);

/* החלפת מפתח החתימה פוסלת כל עוגייה קיימת — זה מה שמנתק את כולם */
if (args.logoutAll) {
  updated = setValue(
    updated,
    "SESSION_SECRET",
    randomBytes(32).toString("base64url"),
  );
}

if (updated === original) {
  console.log("שום דבר לא השתנה.");
  process.exit(0);
}

writeFileSync(envPath, updated, { encoding: "utf8" });

if (args.caller !== null) console.log("קוד הטלפנים עודכן.");
if (args.admin !== null) console.log("קוד הרכז עודכן.");
if (args.logoutAll) console.log("מפתח החתימה הוחלף — כל המכשירים נותקו.");

console.log("");
console.log("השינוי ייכנס לתוקף רק אחרי הפעלה מחדש של השרת:");
console.log("  npx next start -H 0.0.0.0 -p 3001");
console.log("");

if (args.logoutAll) {
  console.log("בכניסה הבאה כולם יקלידו קוד מחדש — כולל אתה,");
  console.log("וכולל תצוגת הרכז.");
} else {
  console.log("מי שכבר נכנס נשאר מחובר — הקוד נבדק רק בכניסה הראשונה.");
  console.log("כדי לנתק את כולם, הוסף --logout-all");
}
