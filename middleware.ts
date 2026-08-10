import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  isAdminSession,
  readSessionValue,
  SESSION_COOKIE,
} from "@/lib/session";

/**
 * שתי דלתות:
 *   • קוד הטלפנים פותח את כל האפליקציה.
 *   • קוד הרכז, נפרד, פותח בנוסף את /event.
 *
 * כאן נבדקת רק תקפות החתימה — בדיקה זולה שרצה על כל בקשה.
 * שהטלפן עדיין קיים במסד נבדק בשכבת העמוד, שם יש חיבור למסד.
 */
export async function middleware(req: NextRequest) {
  const callerId = await readSessionValue(
    req.cookies.get(SESSION_COOKIE)?.value,
  );

  const { pathname } = req.nextUrl;
  const onEnterPage = pathname === "/enter";

  if (!callerId && !onEnterPage) {
    return redirectTo(req, "/enter");
  }

  if (callerId && onEnterPage) {
    return redirectTo(req, "/");
  }

  if (pathname === "/event" || pathname === "/admin") {
    const isAdmin = await isAdminSession(req.cookies.get(ADMIN_COOKIE)?.value);
    if (pathname === "/event" && !isAdmin) return redirectTo(req, "/admin");
    if (pathname === "/admin" && isAdmin) return redirectTo(req, "/event");
  }

  return NextResponse.next();
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /* כל מסלול חוץ מנכסים סטטיים, קבצי ההתקנה של האפליקציה,
       ו-robots.txt שחייב להישאר נגיש לסורקים כדי שיהיה לו ערך */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|.*\\.png$).*)",
  ],
};
