import type { Outcome, QueueItem, Rsvp } from "./types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  answered: "ענה",
  no_answer: "לא ענה",
  wrong_number: "מספר שגוי",
  callback_later: "שיחזרו אליו",
  opted_out: "ביקש לא לפנות",
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

/**
 * שדה datetime-local מחזיר שעה בלי אזור זמן — "2026-08-19T18:30".
 * הרכז מתכוון לשעון ישראל, תמיד: הפעולה מתקיימת בארץ.
 *
 * new Date() על מחרוזת כזו היה מפרש אותה לפי אזור הזמן של השרת,
 * ובענן זה UTC — פעולה של 18:30 הייתה נשמרת כ-21:30. לכן אזור
 * הזמן כתוב כאן במפורש ולא נשען על סביבת ההרצה.
 *
 * שתי איטרציות ולא אחת, כי ההיסט עצמו תלוי ברגע: בקיץ ישראל
 * ב-UTC+3 ובחורף ב-UTC+2. הראשונה מקרבת, השנייה מתקנת אם הניחוש
 * נפל בצד הלא נכון של מעבר שעון.
 */
const EVENT_TZ = "Asia/Jerusalem";

function tzOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  const wallClock = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24, // חצות מיוצג לעתים כ-24
    Number(p.minute),
    Number(p.second),
  );

  return wallClock - instant.getTime();
}

/** מחזיר ISO, או null אם המחרוזת אינה בצורה שהדפדפן שולח */
export function israelLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;

  const naive = Date.parse(local.length === 16 ? `${local}:00Z` : `${local}Z`);
  if (Number.isNaN(naive)) return null;

  let utc = naive;
  for (let i = 0; i < 2; i++) utc = naive - tzOffsetMs(new Date(utc));

  return new Date(utc).toISOString();
}

/**
 * אזור הזמן מפורש כאן מאותה סיבה שהוא מפורש בהמרה למעלה: העימוד
 * קורה בשרת, ובענן שעון השרת הוא UTC. בלי השורה הזו פעולה של 18:30
 * הייתה מוצגת לכולם כ-15:30.
 */
export function formatWhen(startsAt: string, location: string | null): string {
  const d = new Date(startsAt);
  const date = new Intl.DateTimeFormat("he-IL", {
    timeZone: EVENT_TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("he-IL", {
    timeZone: EVENT_TZ,
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
