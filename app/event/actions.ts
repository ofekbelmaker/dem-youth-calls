"use server";

import { revalidatePath } from "next/cache";
import { israelLocalToIso } from "@/lib/format";
import {
  createCampaign,
  getActiveEvent,
  getCurrentCaller,
  getIsAdmin,
} from "@/lib/queries";

export type CampaignState = {
  error: string | null;
  created: {
    /** מזהה הקמפיין החדש. משמש גם כמפתח שמאפס את הטופס אחרי הצלחה. */
    id: string;
    title: string;
    assigned: number;
    isActive: boolean;
  } | null;
};

/* המצב ההתחלתי מוגדר אצל הרכיב ולא כאן: בקובץ "use server" כל
   ייצוא נעטף כהפניית שרת, ולכן קבוע שמיוצא מכאן היה מגיע ללקוח
   כפונקציה במקום כאובייקט. */

const MAX_TITLE = 80;
const MAX_LOCATION = 120;
const MAX_TARGET = 10_000;

export async function createCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  /* פעולת שרת ניתנת לקריאה ישירה ב-POST, בלי לעבור דרך המסך. שתי
     הבדיקות כאן הן ההגנה האמיתית — לא הניתוב ב-middleware. */
  const caller = await getCurrentCaller();
  if (!caller) return { error: "צריך להיכנס קודם", created: null };

  if (!(await getIsAdmin())) {
    return { error: "רק רכז יכול ליצור קמפיין", created: null };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "צריך שם לקמפיין", created: null };
  if (title.length > MAX_TITLE) {
    return { error: `השם ארוך מדי — עד ${MAX_TITLE} תווים`, created: null };
  }

  const when = String(formData.get("startsAt") ?? "").trim();
  if (!when) return { error: "צריך תאריך ושעה", created: null };

  const startsAt = israelLocalToIso(when);
  if (!startsAt) return { error: "התאריך אינו תקין", created: null };

  /* קמפיין בעבר לא ייבחר כפעיל כל עוד יש אחד עתידי, ולכן הוא נראה
     למי שיצר אותו כאילו לא נוצר כלום. עדיף לעצור כאן. */
  if (new Date(startsAt).getTime() <= Date.now()) {
    return { error: "התאריך כבר עבר", created: null };
  }

  const location = String(formData.get("location") ?? "").trim();
  if (location.length > MAX_LOCATION) {
    return { error: "המיקום ארוך מדי", created: null };
  }

  const rawTarget = String(formData.get("targetCount") ?? "").trim();
  let targetCount: number | null = null;
  if (rawTarget) {
    const n = Number(rawTarget);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TARGET) {
      return { error: "יעד ההגעה צריך להיות מספר שלם וחיובי", created: null };
    }
    targetCount = n;
  }

  let result: { id: string; assigned: number };
  try {
    result = await createCampaign(
      { title, startsAt, location: location || null, targetCount },
      caller.id,
    );
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "יצירת הקמפיין נכשלה",
      created: null,
    };
  }

  revalidatePath("/event");
  revalidatePath("/");

  /* נקרא אחרי היצירה, כי הקמפיין החדש הוא הפעיל רק אם הוא הקרוב
     ביותר. בלי זה רכז שיוצר קמפיין רחוק חושב שכלום לא קרה. */
  const active = await getActiveEvent();

  return {
    error: null,
    created: {
      id: result.id,
      title,
      assigned: result.assigned,
      isActive: active?.id === result.id,
    },
  };
}
