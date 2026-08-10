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

/** מביא את הפעיל הבא ותופס אותו. exclude — מי שדילגתי עליו בסבב הזה. */
export async function nextCardAction(exclude: string[]): Promise<CardState> {
  const caller = await getCurrentCaller();
  const event = await getActiveEvent();
  if (!caller || !event) return EMPTY;

  return getNextCard(caller.id, event.id, exclude);
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
