import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * חיבור למסד — שרת בלבד.
 *
 * `server-only` בראש הקובץ הופך כל ניסיון לייבא אותו מקוד לקוח
 * לשגיאת בנייה. זו הערובה שהמפתח לא ידלוף לדפדפן.
 *
 * המפתח עוקף RLS, ולכן כל שאילתה כאן חייבת לסנן במפורש לפי הטלפן
 * המחובר. אין רשת ביטחון מתחת — הסינון הוא באחריות הקוד.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local",
  );
}

export const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
