"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCallers } from "@/lib/queries";
import { sessionCookieOptions } from "@/lib/cookies";
import {
  checkRate,
  clientKey,
  recordFailure,
  recordSuccess,
} from "@/lib/ratelimit";
import {
  ADMIN_COOKIE,
  createAdminValue,
  createGateValue,
  createSessionValue,
  GATE_COOKIE,
  GATE_MAX_AGE,
  isAccessCodeValid,
  isAdminCodeValid,
  logCodeAttempt,
  readGateLevel,
  SESSION_COOKIE,
} from "@/lib/session";

export type CodeState = { error: string | null };
export type NameState = { error: string | null };

/**
 * שלב 1 — הקוד.
 *
 * רשימת השמות לא נשלחת לדפדפן לפני שהשלב הזה עבר. מי שמגיע לכתובת
 * בלי קוד לא מקבל שום מידע על מי פעיל בתנועה.
 */
export async function verifyCodeAction(
  _prev: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const code = String(formData.get("code") ?? "");
  if (!code.trim()) return { error: "הקלד את קוד הכניסה" };

  const key = await clientKey();
  const rate = checkRate(key);
  if (rate.blocked) {
    return {
      error: `יותר מדי ניסיונות. נסה שוב בעוד ${rate.retryInMinutes} דקות.`,
    };
  }

  /* השהיה קטנה — מייקרת ניחוש בכוח גס בלי להפריע למשתמש אמיתי */
  await new Promise((r) => setTimeout(r, 400));

  await logCodeAttempt("כניסה", code, process.env.CALLER_ACCESS_CODE);

  /* שני קודים, שדה אחד:
     קוד הטלפנים פותח את תור השיחות בלבד.
     קוד הרכז פותח את שניהם — אין סיבה להכריח רכז להקליד פעמיים. */
  const asAdmin = isAdminCodeValid(code);
  const asCaller = isAccessCodeValid(code);

  if (!asCaller && !asAdmin) {
    recordFailure(key);
    return { error: "הקוד שגוי. בדוק מול מי ששלח לך את הקישור." };
  }

  recordSuccess(key);

  const store = await cookies();
  store.set(GATE_COOKIE, await createGateValue(asAdmin ? "admin" : "caller"), {
    ...(await sessionCookieOptions()),
    maxAge: GATE_MAX_AGE,
  });

  redirect("/enter");
}

/**
 * שלב 2 — בחירת השם.
 * דורש את עוגיית שלב הביניים, כלומר קוד תקף שהוקלד זה עתה.
 */
export async function chooseCallerAction(
  _prev: NameState,
  formData: FormData,
): Promise<NameState> {
  const store = await cookies();
  const level = await readGateLevel(store.get(GATE_COOKIE)?.value);
  if (!level) {
    redirect("/enter");
  }

  const callerId = String(formData.get("callerId") ?? "");
  const caller = (await getCallers()).find((c) => c.id === callerId);
  if (!caller) return { error: "בחר את השם שלך מהרשימה" };

  const options = await sessionCookieOptions();
  store.set(SESSION_COOKIE, await createSessionValue(caller.id), options);
  if (level === "admin") {
    store.set(ADMIN_COOKIE, await createAdminValue(), options);
  }
  store.delete(GATE_COOKIE);

  redirect(level === "admin" ? "/event" : "/");
}

/** חזרה משלב 2 לשלב 1 */
export async function restartEntryAction(): Promise<void> {
  const store = await cookies();
  store.delete(GATE_COOKIE);
  redirect("/enter");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  /* יציאה מנקה גם את הרשאת הרכז — אחרת החלפת שם הייתה משאירה
     גישה לדשבורד אצל מי שנכנס אחריו באותו מכשיר. */
  store.delete(SESSION_COOKIE);
  store.delete(ADMIN_COOKIE);
  store.delete(GATE_COOKIE);
  redirect("/enter");
}
