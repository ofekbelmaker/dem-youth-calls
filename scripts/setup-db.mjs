/**
 * הקמה ראשונית של המסד: מעביר את רשימת הטלפנים מהקוד לטבלה,
 * יוצר פעולה, ומחלק את הפעילים בין המתקשרים.
 *
 *   node scripts/setup-db.mjs
 *
 * בטוח להרצה חוזרת: טלפן שכבר קיים לא ייווצר שוב, ומשימות
 * מוגנות באילוץ ייחודיות.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- חיבור ---------- */

const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const cfg = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();

const URL_BASE = cfg("NEXT_PUBLIC_SUPABASE_URL");
const KEY = cfg("SUPABASE_SERVICE_ROLE_KEY");

if (!URL_BASE || !KEY) {
  console.error("חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local");
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ---------- הטלפנים ---------- */

/**
 * שמות הטלפנים.
 *
 * ריק בכוונה: הרשימה האמיתית חיה בטבלת profiles במסד, ואין סיבה
 * שהיא תשב בקוד מקור. הסקריפט הזה שימש להקמה ראשונית בלבד —
 * להוספת טלפן חדש עדיף Table Editor.
 *
 * למי שמקים סביבה חדשה: מלא כאן שמות זמניים, או השאר ריק והוסף
 * ידנית אחר כך.
 */
const CALLERS = [];

/* ---------- הרצה ---------- */

console.log("מתחבר…");

const existing = await rest("profiles?select=id,display_name,role");
const existingNames = new Set(existing.map((p) => p.display_name));

const toCreate = CALLERS.filter((n) => !existingNames.has(n)).map((name) => ({
  display_name: name,
  role: "guide",
}));

if (toCreate.length) {
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify(toCreate),
    headers: { Prefer: "return=minimal" },
  });
  console.log(`נוצרו ${toCreate.length} טלפנים`);
} else {
  console.log("כל הטלפנים כבר קיימים");
}

const profiles = await rest("profiles?select=id,display_name&order=created_at");
console.log(`סה״כ טלפנים: ${profiles.length}`);

/* ---------- הפעולה ---------- */

let events = await rest("events?select=id,title,starts_at&order=starts_at.desc");

if (!events.length) {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 10);
  startsAt.setHours(18, 30, 0, 0);

  await rest("events", {
    method: "POST",
    body: JSON.stringify({
      title: "פעולת פתיחת שנה",
      description: "מפגש שכבות + הרצאה",
      starts_at: startsAt.toISOString(),
      location: "בית התנועה, תל אביב",
      target_count: 60,
      assignment_strategy: "pool",
    }),
    headers: { Prefer: "return=minimal" },
  });
  events = await rest("events?select=id,title,starts_at&order=starts_at.desc");
  console.log(`נוצרה פעולה: ${events[0].title}`);
} else {
  console.log(`פעולה קיימת: ${events[0].title}`);
}

const eventId = events[0].id;

/* ---------- מי מתקשר בפעולה ---------- */

const already = await rest(
  `event_callers?select=profile_id&event_id=eq.${eventId}`,
);
const alreadyIds = new Set(already.map((r) => r.profile_id));

const newCallers = profiles
  .filter((p) => !alreadyIds.has(p.id))
  .map((p) => ({ event_id: eventId, profile_id: p.id }));

if (newCallers.length) {
  await rest("event_callers", {
    method: "POST",
    body: JSON.stringify(newCallers),
    headers: { Prefer: "return=minimal" },
  });
  console.log(`${newCallers.length} מתקשרים שויכו לפעולה`);
}

/* ---------- חלוקת המשימות ---------- */

const before = await rest(
  `assignments?select=id&event_id=eq.${eventId}`,
  { headers: { Prefer: "count=exact", Range: "0-0" } },
);
void before;

const created = await fetch(`${URL_BASE}/rest/v1/rpc/generate_assignments`, {
  method: "POST",
  headers,
  body: JSON.stringify({ p_event_id: eventId }),
});

if (!created.ok) {
  console.error("חלוקת המשימות נכשלה: " + (await created.text()).slice(0, 300));
  process.exit(1);
}

console.log(`נוצרו ${await created.text()} משימות חדשות`);

/* ---------- סיכום ---------- */

async function count(table, filter = "") {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*${filter}`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  return (res.headers.get("content-range") ?? "").split("/")[1] ?? "?";
}

console.log("");
console.log("── מצב המסד ──");
console.log(`  פעילים:    ${await count("people")}`);
console.log(`  טלפנים:    ${await count("profiles")}`);
console.log(`  פעולות:    ${await count("events")}`);
console.log(`  משימות:    ${await count("assignments")}`);

const perCaller = await rest(
  `assignments?select=assigned_to&event_id=eq.${eventId}`,
);
const tally = new Map();
for (const a of perCaller) {
  tally.set(a.assigned_to, (tally.get(a.assigned_to) ?? 0) + 1);
}
const counts = [...tally.values()];
if (counts.length) {
  console.log(
    `  לכל מתקשר: ${Math.min(...counts)}–${Math.max(...counts)} שיחות`,
  );
}
