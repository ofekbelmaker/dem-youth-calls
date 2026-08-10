"use server";

import { revalidatePath } from "next/cache";
import {
  getActiveEvent,
  getCurrentCaller,
  getNextCard,
  getProgress,
  insertContact,
  releaseAssignment,
  type CardState,
  type Progress,
} from "@/lib/queries";
import type { ContactDraft } from "@/lib/types";

const EMPTY: CardState = { card: null, done: 0, total: 0, mine: 0 };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** מביא את הפעיל הבא ותופס אותו. exclude — מי שדילגתי עליו בסבב הזה. */
export async function nextCardAction(exclude: string[]): Promise<CardState> {
  const caller = await getCurrentCaller();
  const event = await getActiveEvent();
  if (!caller || !event) return EMPTY;

  /* הרשימה מגיעה מהלקוח, ולכן היא מוגבלת ומסוננת לפני שהיא נכנסת
     לשאילתה — כדי שלא יהיה אפשר לשלוח מערך ענק או ערכים שאינם מזהים */
  const safe = exclude
    .filter((id) => typeof id === "string" && UUID.test(id))
    .slice(0, 200);

  return getNextCard(caller.id, event.id, safe);
}

/** רק המונים — בלי לקחת כרטיס חדש */
export async function progressAction(): Promise<Progress> {
  const caller = await getCurrentCaller();
  const event = await getActiveEvent();
  if (!caller || !event) return { done: 0, total: 0, mine: 0 };
  return getProgress(caller.id, event.id);
}

/** מוותר על הכרטיס הנוכחי ומחזיר אותו למאגר */
export async function skipAction(assignmentId: string): Promise<void> {
  const caller = await getCurrentCaller();
  if (!caller) return;
  await releaseAssignment(caller.id, assignmentId);
}

/** מתעד שיחה. הכתיבה מושהית בצד הלקוח, כאן היא כבר סופית. */
export async function logContactAction(draft: ContactDraft): Promise<void> {
  const caller = await getCurrentCaller();
  if (!caller) throw new Error("לא מחובר");

  await insertContact(caller.id, draft);
  revalidatePath("/event");
}
