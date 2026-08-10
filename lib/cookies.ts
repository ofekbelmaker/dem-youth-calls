import { headers } from "next/headers";
import { SESSION_MAX_AGE } from "./session";

/**
 * אפשרויות העוגייה, נגזרות מהפרוטוקול של הבקשה בפועל.
 *
 * הדגל Secure אומר לדפדפן "שמור אותי רק בחיבור מוצפן". אם נסמן אותו
 * בזמן הגשה ב-HTTP רגיל — למשל בבדיקה מהטלפון מול כתובת ברשת
 * המקומית — הדפדפן פשוט לא ישמור את העוגייה, והמשתמש יוחזר למסך
 * הכניסה בלי שום הודעת שגיאה.
 *
 * לכן ההחלטה נגזרת מ-x-forwarded-proto, שכל שרת חזית מציב (Vercel
 * ביניהם). כשאין כותרת כזו אנחנו מוגשים ישירות ב-HTTP, ואז לא
 * מסמנים Secure.
 */
export async function sessionCookieOptions() {
  const proto = (await headers()).get("x-forwarded-proto");
  const isHttps = proto?.split(",")[0].trim() === "https";

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  } as const;
}
