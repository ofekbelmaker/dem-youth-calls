import type { Outcome, QueueItem, Rsvp } from "./types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  answered: "ענה",
  no_answer: "לא ענה",
  wrong_number: "מספר שגוי",
  callback_later: "שיחזרו אליו",
  opted_out: "ביקש לא לפנות",
  awaiting_whatsapp: "ממתין לתשובה בוואטסאפ",
};

export const RSVP_LABEL: Record<Exclude<Rsvp, "unknown">, string> = {
  yes: "מגיע",
  maybe: "אולי",
  no: "לא מגיע",
};

export const RSVP_CLASS: Record<Exclude<Rsvp, "unknown">, string> = {
  yes: "yes",
  maybe: "maybe",
  no: "no",
};

/**
 * ההקשר שמופיע ליד כל שם. זה מה שמאפשר למתקשר להחליט למי להשקיע
 * דקה נוספת, במקום לקרוא רשימת שמות יבשה.
 */
export function historyChip(item: QueueItem): { cls: string; text: string } {
  const { attendedCount: came, totalEvents: total } = item;

  if (total === 0) return { cls: "warm", text: "פעיל חדש" };

  if (total === 1) {
    return came === 1
      ? { cls: "warm", text: "הגיע לפעולה האחרונה" }
      : { cls: "cold", text: "לא הגיע לפעולה האחרונה" };
  }

  if (came === 0) return { cls: "cold", text: `לא הגיע ל־${total} האחרונות` };
  if (came === total) return { cls: "warm", text: `הגיע לכל ${total} האחרונות` };

  return { cls: "warm", text: `הגיע ב־${came} מ־${total} האחרונות` };
}

export function formatWhen(startsAt: string, location: string | null): string {
  const d = new Date(startsAt);
  const date = new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return [date, time, location].filter(Boolean).join(" · ");
}

export function daysUntil(startsAt: string): number {
  const ms = new Date(startsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 864e5));
}

export function countdownText(startsAt: string): string {
  const d = daysUntil(startsAt);
  if (d === 0) return "היום";
  if (d === 1) return "מחר";
  return `בעוד ${d} ימים`;
}

export function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

/** "לפני 3 שעות" — כמה זמן ההודעה כבר ממתינה לתשובה */
export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "הרגע";
  if (mins < 60) return `לפני ${mins} דק׳`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;

  const days = Math.round(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}
