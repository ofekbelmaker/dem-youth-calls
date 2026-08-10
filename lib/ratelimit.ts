import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * הגבלת קצב לניסיונות קוד.
 *
 * הספירה במסד ולא בזיכרון. בענן האפליקציה רצה כמופעים קצרי-חיים,
 * וספירה בזיכרון של מופע אחד לא נראית לאחרים ומתאפסת עם מחזורו —
 * כלומר היא כמעט חסרת ערך שם. המסד הוא הזיכרון המשותף היחיד.
 *
 * שתי שכבות:
 *   • לפי מקור — חוסם ניסיונות חוזרים מאותה כתובת.
 *   • גלובלי — מאט את כולם כשיש פרץ חריג, כי תוקף יכול להחליף
 *     כתובות. במכוון האטה ולא חסימה, כדי שלא יהיה אפשר לנעול
 *     את הטלפנים האמיתיים בערב פעולה.
 */

/** כשלונות מאותו מקור ב-15 דקות לפני חסימה */
const SOURCE_LIMIT = 5;
/** משך החסימה */
const BLOCK_MINUTES = 30;
/** כשלונות מכל המקורות ב-10 דקות שמפעילים האטה */
const GLOBAL_THRESHOLD = 25;

/** השהיה בסיסית — מייקרת ניחוש בלי להפריע למשתמש אמיתי */
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 6000;

export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export type RateDecision =
  | { blocked: true; retryInMinutes: number }
  | { blocked: false; delayMs: number };

export async function checkRate(key: string): Promise<RateDecision> {
  const { data, error } = await db.rpc("login_rate_state", { p_key: key });

  /* אם הבדיקה עצמה נכשלת, לא פותחים את הדלת לרווחה —
     משהים ומאפשרים, אבל לא מדלגים על ההשהיה */
  if (error || !data?.length) {
    return { blocked: false, delayMs: BASE_DELAY_MS };
  }

  const { from_source: fromSource, global } = data[0] as {
    from_source: number;
    global: number;
  };

  if (fromSource >= SOURCE_LIMIT) {
    return { blocked: true, retryInMinutes: BLOCK_MINUTES };
  }

  /* ההשהיה גדלה עם כל כישלון, ועוד יותר כשיש פרץ כללי */
  const surge = global >= GLOBAL_THRESHOLD ? 4 : 1;
  const delayMs = Math.min(
    MAX_DELAY_MS,
    BASE_DELAY_MS * (fromSource + 1) * surge,
  );

  return { blocked: false, delayMs };
}

export async function recordFailure(key: string): Promise<void> {
  await db.rpc("record_login_failure", { p_key: key });
}

export async function recordSuccess(key: string): Promise<void> {
  await db.rpc("clear_login_failures", { p_key: key });
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
