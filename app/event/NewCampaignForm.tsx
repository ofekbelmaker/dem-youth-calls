"use client";

import { useActionState } from "react";
import { createCampaignAction, type CampaignState } from "./actions";
import { formatWhen } from "@/lib/format";
import type { UpcomingCampaign } from "@/lib/types";

const INITIAL: CampaignState = { error: null, created: null };

export default function NewCampaignForm({
  upcoming,
  startOpen,
}: {
  upcoming: UpcomingCampaign[];
  startOpen: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createCampaignAction,
    INITIAL,
  );

  return (
    <details className="campaign" open={startOpen || state.created !== null}>
      <summary>קמפיין חדש</summary>

      {upcoming.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>קמפיין</th>
              <th>מתי</th>
              <th>שיחות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{formatWhen(c.startsAt, c.location)}</td>
                <td>{c.callCount}</td>
                <td>{c.isActive && <span className="tag self">פעיל</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* המפתח מאפס את השדות אחרי יצירה מוצלחת, כדי שלחיצה נוספת
          לא תיצור את אותו קמפיין פעמיים */}
      <form key={state.created?.id ?? "new"} className="enter-form" action={formAction}>
        <label className="field">
          <span>שם הקמפיין</span>
          <input name="title" type="text" maxLength={80} required />
        </label>

        <label className="field">
          <span>מתי</span>
          <input name="startsAt" type="datetime-local" required />
        </label>

        <div className="split">
          <label className="field">
            <span>איפה</span>
            <input name="location" type="text" maxLength={120} />
          </label>

          <label className="field">
            <span>יעד הגעה</span>
            <input name="targetCount" type="number" min={1} max={10000} step={1} />
          </label>
        </div>

        {state.error && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}

        {state.created && (
          <p className="field-ok" role="status">
            נוצר <b>{state.created.title}</b> עם {state.created.assigned} שיחות
            ברשימה.
            {state.created.isActive
              ? " הטלפנים מחייגים אליו מעכשיו."
              : " יש קמפיין קרוב יותר, ולכן הוא עדיין לא זה שמוצג לטלפנים."}
          </p>
        )}

        <button type="submit" className="save" disabled={pending}>
          {pending ? "יוצר…" : "צור קמפיין"}
        </button>

        <p className="fineprint">
          הרשימה נבנית מכל הפעילים שמותר לפנות אליהם, ומי שנרשם בטופס
          מכאן והלאה נכנס אליה לבד.
        </p>
      </form>
    </details>
  );
}
