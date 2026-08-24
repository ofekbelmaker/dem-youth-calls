import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * חיבור למסד — שרת בלבד.
 *
 * `server-only` בראש הקובץ הופך כל ניסיון לייבא אותו מקוד לקוח
 * לשגיאת בנייה. זו הערובה שהמפתח לא ידלוף לדפדפן.
 *
 * המפתח עוקף RLS, ולכן כל שאילתה כאן חייבת לסנן במפורש לפי הטלפן
 * המחובר. אין רשת ביטחון מתחת — הסינון הוא באחריות הקוד.
 *
 * החיבור נוצר בפנייה הראשונה ולא בייבוא הקובץ. ההבדל מתגלה רק
 * בבנייה: Next מריץ את כל המודולים כדי לאסוף מידע על העמודים, ואם
 * הבדיקה יושבת ברמת המודול היא נכשלת שם — לפני שיש בכלל בקשה.
 * כך נפלה כל בנייה של Preview ב-Vercel, שבו הסודות מוגדרים לייצור
 * בלבד. הבדיקה עצמה לא נחלשה: היא רק זזה לרגע השימוש.
 */

let client: SupabaseClient | null = null;

function connect(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

/* מתנהג כמו הלקוח עצמו — db.from(...) ו-db.rpc(...) בלי שינוי
   באף מקום אחר בקוד. */
export const db: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = connect();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
