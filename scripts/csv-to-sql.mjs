/**
 * ממיר CSV של רשימת נרשמים לפקודות SQL מוכנות להדבקה בעורך של Supabase,
 * ומדפיס דוח בדיקה.
 *
 * מסלול עוקף לייבוא CSV מהדשבורד. הכל רץ מקומית — הנתונים לא עוזבים
 * את המחשב.
 *
 *   node scripts/csv-to-sql.mjs "C:\\Users\\belma\\Desktop\\נרשמים.csv"
 *
 * מזהה לבד את שורת הכותרות, בעברית או באנגלית, כולל שם מפוצל
 * לשם פרטי ושם משפחה. מזהה גם מפריד נקודה-פסיק שאקסל בעברית מייצר.
 */

import { readFileSync, writeFileSync } from "node:fs";

/* ------------------------------------------------------------------ */
/* קריאת CSV                                                           */
/* ------------------------------------------------------------------ */

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const counts = [
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/* ------------------------------------------------------------------ */
/* זיהוי עמודות                                                        */
/* ------------------------------------------------------------------ */

const ALIASES = {
  fullName: ["raw_name", "שם מלא", "שם"],
  firstName: ["שם פרטי", "first name", "first_name"],
  lastName: ["שם משפחה", "last name", "last_name"],
  phone: ["raw_phone", "טלפון", "נייד", "phone", "mobile"],
  grade: ["raw_grade", "שכבה", "כיתה", "grade"],
  city: ["raw_city", "יישוב", "ישוב", "עיר", "city"],
  school: ["raw_school", "בית ספר", 'ביה"ס', "school"],
  date: ["submitted_at", "תאריך", "חותמת זמן", "timestamp"],
};

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const out = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    out[key] = norm.findIndex((h) => names.some((n) => h === n.toLowerCase()));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* נרמול                                                               */
/* מדיניות זהה ל-normalize_il_phone() שבמסד, כדי שהדוח כאן ישקף        */
/* בדיוק את מה שיקרה שם.                                               */
/* ------------------------------------------------------------------ */

function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/[^0-9]/g, "");
  if (d.startsWith("00972")) d = d.slice(5);
  else if (d.startsWith("972")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.length < 8 || d.length > 9) return null;
  return "+972" + d;
}

/** "14.6.2026, 12:29:02" -> "2026-06-14 12:29:02" */
function normalizeDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(
    /(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", s = "0"] = m;
  const p = (v, n = 2) => String(v).padStart(n, "0");
  return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}:${p(s)}`;
}

/* ------------------------------------------------------------------ */

const input = process.argv[2];
if (!input) {
  console.error('שימוש: node scripts/csv-to-sql.mjs "נתיב\\לקובץ.csv"');
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(input, "utf8");
} catch (e) {
  console.error(`לא הצלחתי לקרוא את הקובץ: ${e.message}`);
  process.exit(1);
}
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

const delimiter = detectDelimiter(raw);
const rows = parseCsv(raw, delimiter);
if (rows.length < 2) {
  console.error("הקובץ ריק או מכיל רק שורת כותרות.");
  process.exit(1);
}

const col = findColumns(rows[0]);

const hasName = col.fullName !== -1 || col.firstName !== -1;
if (!hasName || col.phone === -1) {
  console.error("לא זיהיתי עמודות שם וטלפון. שורת הכותרות שנמצאה:");
  console.error("  " + rows[0].join(" | "));
  process.exit(1);
}

const pick = (r, i) => (i === -1 ? "" : (r[i] ?? "").trim());

const records = [];
const report = { blank: 0, badPhone: [], suspicious: [] };

for (const r of rows.slice(1)) {
  const name =
    col.fullName !== -1
      ? pick(r, col.fullName)
      : [pick(r, col.firstName), pick(r, col.lastName)]
          .filter(Boolean)
          .join(" ");

  const phoneRaw = pick(r, col.phone);
  if (!name && !phoneRaw) {
    report.blank++;
    continue;
  }

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    report.badPhone.push({ name, phoneRaw });
    continue;
  }

  /* שורות שנראות כמו בדיקה או ספאם — לא מוסרות, רק מסומנות */
  if (/בדיקה|test/i.test(name) || /^\+9725000000/.test(phone)) {
    report.suspicious.push({ name, phone, why: "נראה כמו רשומת בדיקה" });
  } else if (!/[\u0590-\u05FF]/.test(name)) {
    report.suspicious.push({ name, phone, why: "שם ללא אותיות עבריות" });
  }

  records.push({
    name,
    phoneRaw,
    phone,
    grade: pick(r, col.grade),
    city: pick(r, col.city),
    school: pick(r, col.school),
    date: normalizeDate(pick(r, col.date)),
  });
}

/* ספירת כפילויות לפי מספר מנורמל */
const byPhone = new Map();
for (const rec of records) {
  const list = byPhone.get(rec.phone) ?? [];
  list.push(rec);
  byPhone.set(rec.phone, list);
}
const dupGroups = [...byPhone.values()].filter((g) => g.length > 1);

/* ------------------------------------------------------------------ */
/* פלט                                                                 */
/* ------------------------------------------------------------------ */

const q = (v) =>
  !v || String(v).trim() === ""
    ? "null"
    : "'" + String(v).trim().replace(/'/g, "''") + "'";

const values = records.map(
  (r) =>
    `  (${q(r.name)}, ${q(r.phoneRaw)}, ${q(r.grade)}, ${q(r.city)}, ` +
    `${q(r.school)}, ${r.date ? `'${r.date}'` : "null"})`,
);

const sql =
  "-- נוצר על ידי scripts/csv-to-sql.mjs\n" +
  `-- ${values.length} שורות\n` +
  "-- להדביק בעורך ה-SQL של Supabase, ואז להמשיך עם supabase/import.sql\n\n" +
  "insert into import_staging\n" +
  "  (raw_name, raw_phone, raw_grade, raw_city, raw_school, submitted_at)\n" +
  "values\n" +
  values.join(",\n") +
  ";\n";

const out = input.replace(/\.csv$/i, "") + ".sql";
writeFileSync(out, sql, "utf8");

/* ------------------------------------------------------------------ */
/* דוח                                                                 */
/* ------------------------------------------------------------------ */

const line = (s = "") => console.log(s);

line();
line("═══ דוח ייבוא ═══");
line();
line(`שורות בקובץ (בלי כותרת):   ${rows.length - 1}`);
line(`שורות ריקות שדולגו:         ${report.blank}`);
line(`מספרי טלפון לא תקינים:      ${report.badPhone.length}`);
line(`שורות תקינות:               ${records.length}`);
line(`מתוכן כפילויות:             ${records.length - byPhone.size}`);
line(`── פעילים ייחודיים:         ${byPhone.size}`);

if (report.badPhone.length) {
  line();
  line("מספרים שנפסלו:");
  for (const b of report.badPhone) line(`  ${b.name} — "${b.phoneRaw}"`);
}

if (dupGroups.length) {
  line();
  line(`קבוצות כפילויות (${dupGroups.length}) — תישמר ההרשמה המוקדמת:`);
  for (const g of dupGroups) {
    const names = [...new Set(g.map((r) => r.name))].join(" / ");
    line(`  ${g.length}× ${names}`);
  }
}

if (report.suspicious.length) {
  line();
  line("שורות שכדאי שתסתכל עליהן לפני האישור:");
  for (const s of report.suspicious) line(`  ${s.name} — ${s.why}`);
}

line();
line(`הקובץ נשמר: ${out}`);
