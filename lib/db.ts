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

/**
 * כתובת הפרויקט מתוך המפתח עצמו.
 *
 * מפתח service_role הוא JWT, ובמטען שלו יושב `ref` — מזהה הפרויקט
 * שממנו נבנית הכתובת. כלומר הכתובת אינה מידע נוסף: היא כבר נמצאת
 * במפתח, ולהגדיר אותה בנפרד זה להזמין את המצב שבו אחת מהשתיים
 * קיימת והשנייה לא. זה בדיוק מה שהפיל את הייצור.
 *
 * מחזיר null כשהמפתח אינו JWT — למשל מפתחות sb_secret_ החדשים של
 * Supabase, או התקנה עצמאית שכתובתה אינה supabase.co. בשני המקרים
 * חוזרים לדרוש את המשתנה המפורש.
 */
function deriveUrl(key: string): string | null {
  const payload = key.split(".")[1];
  if (!payload) return null;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const ref = JSON.parse(json)?.ref;
    return typeof ref === "string" && /^[a-z0-9]+$/.test(ref)
      ? `https://${ref}.supabase.co`
      : null;
  } catch {
    return null;
  }
}

function connect(): SupabaseClient {
  if (client) return client;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("חסר SUPABASE_SERVICE_ROLE_KEY בסביבת הריצה");
  }

  /* המשתנה המפורש קודם — הוא הדרך לעקוף את הגזירה בהתקנה עצמאית.
     שים לב שהוא NEXT_PUBLIC_ מסיבות היסטוריות בלבד: הקובץ הזה
     server-only, והכתובת לא נחוצה בדפדפן. */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || deriveUrl(key);
  if (!url) {
    throw new Error(
      "לא ניתן לגזור את כתובת Supabase מהמפתח. הגדר NEXT_PUBLIC_SUPABASE_URL.",
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
