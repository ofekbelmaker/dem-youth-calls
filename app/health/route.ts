import { NextResponse } from "next/server";

/**
 * אבחון זמני — להסרה מיד אחרי שהתקלה נפתרת.
 *
 * האתר מחזיר 500 בלי גוף, והדפדפן מציג עמוד כללי. הדף הזה הוא
 * הדרך היחידה לראות מה באמת נכשל בצד השרת בלי גישה ללוגים.
 *
 * מה הוא חושף: אילו שמות של משתני סביבה מוגדרים, ומה הודעת השגיאה
 * של החיבור למסד. לא ערכים ולא אורכים — אורך של קוד גישה הוא רמז
 * למי שמנחש אותו. מזהה הפרויקט של Supabase גלוי ממילא בריפו.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const names = [
    "SESSION_SECRET",
    "CALLER_ACCESS_CODE",
    "ADMIN_ACCESS_CODE",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const env: Record<string, string> = {};
  for (const n of names) {
    env[n] = process.env[n] ? "מוגדר" : "❌ חסר";
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const keyShape = !key
    ? "אין מפתח"
    : key.startsWith("eyJ") && key.split(".").length === 3
      ? "JWT — ניתן לגזור ממנו כתובת"
      : key.startsWith("sb_")
        ? "פורמט חדש sb_ — אי אפשר לגזור"
        : "לא מזוהה";

  /* הניסיון האמיתי: אותה פונקציה שהעמודים קוראים לה */
  let connection: string;
  try {
    const { db } = await import("@/lib/db");
    const { error } = await db.from("profiles").select("id").limit(1);
    connection = error ? `נכשל: ${error.message}` : "✅ עובד";
  } catch (e) {
    connection = `זרק: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(
    { env, keyShape, connection, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "לא ידוע" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
