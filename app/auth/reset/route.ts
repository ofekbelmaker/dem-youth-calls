import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, GATE_COOKIE, SESSION_COOKIE } from "@/lib/session";

/**
 * מנקה זהות ומחזיר למסך הכניסה.
 *
 * נדרש כי עוגייה יכולה להיות חתומה כדין ועדיין להצביע על טלפן שכבר
 * לא קיים — למשל אחרי שהרשימה עברה לmasד. בלי המסלול הזה נוצרת
 * לולאה: השער מכניס, העמוד מגלה שאין טלפן ומחזיר לשער.
 *
 * עוגיות אפשר למחוק רק בתשובת HTTP, ולכן זה route ולא עמוד.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/enter";
  url.search = "";

  const res = NextResponse.redirect(url);
  for (const name of [SESSION_COOKIE, ADMIN_COOKIE, GATE_COOKIE]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
