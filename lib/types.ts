/**
 * הטיפוסים משקפים אחד-לאחד את התצוגות שבמסד:
 * my_queue, event_stats ו-caller_progress.
 * כשנחבר את Supabase, המימוש משתנה — הצורה לא.
 */

export type Outcome =
  | "answered"
  | "no_answer"
  | "wrong_number"
  | "callback_later"
  | "opted_out"
  | "awaiting_whatsapp";

export type Rsvp = "yes" | "no" | "maybe" | "unknown";

export type AssignmentState = "pending" | "done" | "skipped";

/** טלפן. המזהה הוא ה-uuid של הפרופיל במסד. */
export type Caller = {
  id: string;
  name: string;
};

export type EventInfo = {
  id: string;
  title: string;
  startsAt: string;   // ISO
  location: string | null;
  targetCount: number | null;
};

/** קמפיין ברשימת הקרובים במסך הרכז. isActive — זה שמוצג לטלפנים. */
export type UpcomingCampaign = EventInfo & {
  isActive: boolean;
  /** כמה שיחות ברשימה שלו. אפס = נוצר בלי מאגר ואי אפשר לחייג ממנו. */
  callCount: number;
};

/** שורה ב-my_queue */
export type QueueItem = {
  assignmentId: string;
  personId: string;
  fullName: string;
  phoneE164: string;
  grade: string | null;
  /** יישוב ובית ספר, כהקשר למתקשר */
  note: string | null;
  state: AssignmentState;
  lastOutcome: Outcome | null;
  lastRsvp: Rsvp | null;
  lastNeedsRide: boolean;
  /** הקשר היסטורי: הגיע ב-X מתוך Y הפעולות הקודמות */
  attendedCount: number;
  totalEvents: number;
};

/** מה שנרשם בסיום שיחה */
export type ContactDraft = {
  assignmentId: string;
  outcome: Outcome;
  rsvp: Rsvp | null;
  needsRide: boolean;
};

/** שורה ב-event_stats */
export type EventStats = {
  assigned: number;
  reached: number;
  answered: number;
  rsvpYes: number;
  rsvpMaybe: number;
  rsvpNo: number;
  needsRide: number;
};

/** שורה ב-caller_progress */
export type CallerProgress = {
  profileId: string;
  displayName: string;
  assigned: number;
  reached: number;
  rsvpYes: number;
  isSelf: boolean;
};
