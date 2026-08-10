import { headers } from "next/headers";

/**
 * הגבלת קצב לניסיונות קוד.
 *
 * הקוד משותף לכל הטלפנים, ולכן הוא קצר וזכיר — מה שהופך ניחוש
 * אוטומטי לאיום ממשי ברגע שסורק מוצא את הכתובת. ההגבלה כאן לא
 * מונעת ניחוש, היא מייקרת אותו בסדרי גודל.
 *
 * הספירה בזיכרון התהליך. בהרצה מקומית זה מדויק; בפריסה עם כמה
 * מופעים כל אחד סופר לעצמו, כלומר ההגבלה רופפת יותר אבל עדיין
 * חוסמת התקפה מהירה. אם נגיע לעומס אמיתי, זה עובר למסד.
 */

const WINDOW_MS = 10 * 60 * 1000; // חלון של עשר דקות
const MAX_ATTEMPTS = 8; // ניסיונות כושלים לפני חסימה
const BLOCK_MS = 15 * 60 * 1000; // משך החסימה

type Entry = { failures: number; firstAt: number; blockedUntil: number };

const attempts = new Map<string, Entry>();

/** מנקה רשומות ישנות כדי שהמפה לא תגדל בלי גבול */
function sweep(now: number): void {
  for (const [key, e] of attempts) {
    if (e.blockedUntil < now && now - e.firstAt > WINDOW_MS) attempts.delete(key);
  }
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export type RateState =
  | { blocked: false }
  | { blocked: true; retryInMinutes: number };

export function checkRate(key: string): RateState {
  const now = Date.now();
  sweep(now);

  const entry = attempts.get(key);
  if (!entry) return { blocked: false };

  if (entry.blockedUntil > now) {
    return {
      blocked: true,
      retryInMinutes: Math.max(1, Math.ceil((entry.blockedUntil - now) / 60000)),
    };
  }

  return { blocked: false };
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstAt: now, blockedUntil: 0 });
    return;
  }

  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.failures = 0;
    entry.firstAt = now;
  }
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}
