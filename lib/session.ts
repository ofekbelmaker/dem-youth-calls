/**
 * זיהוי הטלפן.
 *
 * מודל האבטחה, במפורש:
 *   • קוד הגישה הוא הדלת. הוא נבדק בשרת בלבד ולעולם לא נשלח לדפדפן.
 *   • בחירת השם היא תיוג, לא אימות. טלפן יכול לבחור שם של אחר.
 *     זו החלטה מודעת — בהקשר של תנועת נוער אין למי להרוויח מזה.
 *
 * העוגייה חתומה ב-HMAC כדי שלא יהיה אפשר לזייף אותה בלי הקוד.
 * נעשה שימוש ב-Web Crypto ולא ב-node:crypto, כדי שזה יעבוד גם
 * ב-middleware שרץ ב-edge runtime.
 */

export const SESSION_COOKIE = "dyc_caller";
export const ADMIN_COOKIE = "dyc_admin";
/** שלב ביניים: הקוד אומת, השם עוד לא נבחר */
export const GATE_COOKIE = "dyc_gate";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 120; // 120 יום
export const GATE_MAX_AGE = 60 * 15; // רבע שעה לבחור שם

/** הערך שנחתם בעוגיית הרכז. קבוע — מה שמגן הוא החתימה. */
const ADMIN_MARK = "coordinator";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(sig));
}

/** השוואה בזמן קבוע — לא מדליפה כמה תווים התאימו */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** בונה ערך עוגייה חתום עבור מזהה טלפן */
export async function createSessionValue(callerId: string): Promise<string> {
  return `${callerId}.${await sign(callerId)}`;
}

/** מחזיר את מזהה הטלפן אם החתימה תקפה, אחרת null */
export async function readSessionValue(
  raw: string | undefined | null,
): Promise<string | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const callerId = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);
  const expected = await sign(callerId);

  return timingSafeEqual(provided, expected) ? callerId : null;
}

/**
 * ניקוי קוד לפני השוואה.
 *
 * הקוד מוקלד בטלפון, לרוב בידיים ממהרות: מקלדות מוסיפות רווח בסוף,
 * הדבקה גוררת רווח בהתחלה, ואות ראשונה גדולה היא ברירת מחדל נפוצה.
 * הסלחנות הזו מוזילה את הניחוש בכמה סיביות — זניח מול קוד שממילא
 * מסתובב בין שנים-עשר אנשים.
 */
function normalizeCode(value: string): string {
  return value.trim().toLocaleLowerCase("he");
}

/**
 * אבחון זמני, נדלק עם DEBUG_CODES=1.
 * מדפיס ללוג השרת מספיק כדי להשוות, בלי להדפיס את הקוד עצמו.
 */
export async function logCodeAttempt(
  label: string,
  input: string,
  expected: string | undefined,
): Promise<void> {
  if (process.env.DEBUG_CODES !== "1") return;

  const fp = async (v: string) => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    return toBase64Url(new Uint8Array(d)).slice(0, 8);
  };

  const gotRaw = input;
  const got = normalizeCode(input);
  const want = expected ? normalizeCode(expected) : "(לא מוגדר)";

  console.log(
    `[CODE ${label}] ` +
      `התקבל: אורך גולמי ${gotRaw.length}, אורך מנוקה ${got.length}, ` +
      `טביעה ${await fp(got)} | ` +
      `מצופה: אורך ${want.length}, טביעה ${expected ? await fp(want) : "-"} | ` +
      `תואם: ${got === want}`,
  );
}

/** בדיקת קוד הגישה. רץ בשרת בלבד. */
export function isAccessCodeValid(input: string): boolean {
  const expected = process.env.CALLER_ACCESS_CODE;
  if (!expected) return false;
  return timingSafeEqual(normalizeCode(input), normalizeCode(expected));
}

/* ---------- תצוגת רכז ---------- */

/**
 * דלת שנייה, נפרדת. הקוד הזה לא זהה לקוד הטלפנים — אחרת כל מי
 * שיכול להתקשר היה יכול גם לראות את הדשבורד.
 */
export function isAdminCodeValid(input: string): boolean {
  const expected = process.env.ADMIN_ACCESS_CODE;
  const caller = process.env.CALLER_ACCESS_CODE;
  if (!expected) return false;
  /* אם מישהו הגדיר בטעות את שני הקודים זהים, אין כאן הפרדה אמיתית.
     ההשוואה על הערך המנוקה — אחרת הבדל באות גדולה היה נראה כהפרדה. */
  if (caller && normalizeCode(expected) === normalizeCode(caller)) return false;
  return timingSafeEqual(normalizeCode(input), normalizeCode(expected));
}

export async function createAdminValue(): Promise<string> {
  return `${ADMIN_MARK}.${await sign(ADMIN_MARK)}`;
}

/* ---------- שלב הביניים ---------- */

export type GateLevel = "caller" | "admin";

/**
 * מונפק אחרי אימות הקוד ולפני בחירת השם. זה מה שמאפשר לא להציג
 * את רשימת השמות לאף אחד שלא הוכיח שיש לו קוד.
 */
export async function createGateValue(level: GateLevel): Promise<string> {
  const mark = `gate:${level}`;
  return `${mark}.${await sign(mark)}`;
}

export async function readGateLevel(
  raw: string | undefined | null,
): Promise<GateLevel | null> {
  const value = await readSessionValue(raw);
  if (value === "gate:admin") return "admin";
  if (value === "gate:caller") return "caller";
  return null;
}

export async function isAdminSession(
  raw: string | undefined | null,
): Promise<boolean> {
  return (await readSessionValue(raw)) === ADMIN_MARK;
}
