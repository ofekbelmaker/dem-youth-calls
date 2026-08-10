"use client";

import { useActionState } from "react";
import { adminEnterAction, type AdminState } from "./actions";

const INITIAL: AdminState = { error: null };

export default function AdminForm() {
  const [state, formAction, pending] = useActionState(adminEnterAction, INITIAL);

  return (
    <form className="enter-form" action={formAction}>
      <label className="field">
        <span>קוד רכז</span>
        <input
          name="code"
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </label>

      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className="save" disabled={pending}>
        {pending ? "בודק…" : "פתח תצוגת רכז"}
      </button>
    </form>
  );
}
