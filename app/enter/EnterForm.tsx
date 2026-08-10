"use client";

import { useActionState } from "react";
import {
  chooseCallerAction,
  restartEntryAction,
  verifyCodeAction,
  type CodeState,
  type NameState,
} from "./actions";
import type { Caller } from "@/lib/types";

const NO_ERROR = { error: null };

/** שלב 1 — קוד בלבד. שום מידע על התנועה לא מוצג כאן. */
export function CodeStep() {
  const [state, formAction, pending] = useActionState<CodeState, FormData>(
    verifyCodeAction,
    NO_ERROR,
  );

  return (
    <form className="enter-form" action={formAction}>
      <label className="field">
        <span>קוד כניסה</span>
        <input
          name="code"
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
        />
      </label>

      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="save" disabled={pending}>
        {pending ? "בודק…" : "המשך"}
      </button>

      <p className="fineprint">
        אם אין לך קוד, פנה למי ששלח לך את הקישור.
      </p>
    </form>
  );
}

/** שלב 2 — בחירת השם. נגיש רק אחרי קוד תקף. */
export function NameStep({
  callers,
  isAdmin,
}: {
  callers: Caller[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<NameState, FormData>(
    chooseCallerAction,
    NO_ERROR,
  );

  return (
    <>
      <form className="enter-form" action={formAction}>
        {isAdmin && <p className="badge-admin">קוד רכז — הדשבורד ייפתח גם כן</p>}

        <label className="field">
          <span>מי מתקשר?</span>
          <select name="callerId" defaultValue="" required>
            <option value="" disabled>
              בחר את השם שלך
            </option>
            {callers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {state.error && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" className="save" disabled={pending}>
          {pending ? "נכנס…" : "כניסה"}
        </button>

        <p className="fineprint">
          הכניסה נשמרת במכשיר הזה. לא תצטרך להקליד את הקוד שוב.
        </p>
      </form>

      <form action={restartEntryAction}>
        <button type="submit" className="linkish">
          הקלדתי קוד שגוי — חזרה
        </button>
      </form>
    </>
  );
}
