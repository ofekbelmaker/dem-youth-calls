"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieOptions } from "@/lib/cookies";
import { getCurrentCaller } from "@/lib/queries";
import {
  checkRate,
  clientKey,
  recordFailure,
  recordSuccess,
  wait,
} from "@/lib/ratelimit";
import {
  ADMIN_COOKIE,
  createAdminValue,
  isAdminCodeValid,
  logCodeAttempt,
} from "@/lib/session";

export type AdminState = { error: string | null };

export async function adminEnterAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  /* פעולות שרת ניתנות לקריאה ישירה, בלי לעבור דרך המסך. לכן הבדיקה
     שהמשתמש כבר מזוהה כטלפן חוזרת כאן ולא נשענת על השער בלבד. */
  const caller = await getCurrentCaller();
  if (!caller) return { error: "צריך להיכנס קודם עם קוד הכניסה" };

  const code = String(formData.get("code") ?? "");
  if (!code.trim()) return { error: "הקלד את קוד הרכז" };

  /* אותה הגבלה כמו במסך הכניסה. קוד הרכז ניתן לניחוש באותה מידה,
     ועד עכשיו הוא היה מוגן רק בהשהיה קבועה. */
  const key = "admin:" + (await clientKey());
  const rate = await checkRate(key);
  if (rate.blocked) {
    return {
      error: `יותר מדי ניסיונות. נסה שוב בעוד ${rate.retryInMinutes} דקות.`,
    };
  }
  await wait(rate.delayMs);

  await logCodeAttempt("רכז", code, process.env.ADMIN_ACCESS_CODE);

  if (!isAdminCodeValid(code)) {
    await recordFailure(key);
    return { error: "הקוד שגוי." };
  }

  await recordSuccess(key);

  const store = await cookies();
  store.set(ADMIN_COOKIE, await createAdminValue(), await sessionCookieOptions());

  redirect("/event");
}

export async function adminSignOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/");
}
