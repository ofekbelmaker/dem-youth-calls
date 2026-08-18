"use client";

import { useState } from "react";
import { logContactAction } from "../actions";
import { timeAgo } from "@/lib/format";
import type { AwaitingItem } from "@/lib/queries";
import type { Outcome, Rsvp } from "@/lib/types";

/**
 * הספרייה: מי שנשלחה לו הודעה בוואטסאפ ועדיין לא ענה.
 *
 * הם ירדו מהמאגר המשותף ושמורים לטלפן הזה בלבד — ראה
 * supabase/awaiting-whatsapp.sql. המטרה כאן היא תיעוד רטרואקטיבי:
 * התשובה מגיעה שעה אחרי השיחה, והטלפן צריך מקום לרשום אותה.
 *
 * אין כאן "ממתין לוואטסאפ" כתוצאה אפשרית — מי שכבר ברשימה הזו
 * נמצא בדיוק במצב הזה, וכפתור שלא משנה כלום רק מבלבל.
 */
const OUTCOMES: { value: Outcome; label: string; kind: string }[] = [
  { value: "answered", label: "ענה", kind: "k-sig" },
  { value: "no_answer", label: "לא ענה", kind: "k-no" },
  { value: "callback_later", label: "שיחזרו אליו", kind: "k-no" },
  { value: "opted_out", label: "אל תפנו אליי", kind: "k-alert" },
];

const RSVPS: { value: Exclude<Rsvp, "unknown">; label: string; kind: string }[] = [
  { value: "yes", label: "כן", kind: "k-yes" },
  { value: "maybe", label: "אולי", kind: "k-maybe" },
  { value: "no", label: "לא", kind: "k-no" },
];

export default function AwaitingList({ items }: { items: AwaitingItem[] }) {
  /* מוסרים מקומית אחרי תיעוד, כדי שהרשימה לא תקפוץ בזמן שעובדים בה */
  const [resolved, setResolved] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const open = items.filter((i) => !resolved.includes(i.assignmentId));

  if (!open.length) {
    return (
      <div className="scroll">
        <p className="empty">
          אף אחד לא ממתין לתשובה.
          <br />
          מי שתסמן לו &quot;שלחתי וואטסאפ — ממתין&quot; יופיע כאן.
        </p>
      </div>
    );
  }

  return (
    <div className="scroll">
      <p className="wait-count">
        {open.length} ממתינים לתשובה. הם שמורים לך ולא יימסרו לטלפן אחר.
      </p>

      {open.map((item) => (
        <WaitingRow
          key={item.assignmentId}
          item={item}
          onDone={(name) => {
            setResolved((prev) => [...prev, item.assignmentId]);
            setToast(`${name} — תועד`);
            setTimeout(() => setToast(null), 2500);
          }}
        />
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function WaitingRow({
  item,
  onDone,
}: {
  item: AwaitingItem;
  onDone: (name: string) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rsvp, setRsvp] = useState<Exclude<Rsvp, "unknown"> | null>(null);
  const [needsRide, setNeedsRide] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsRsvp = outcome === "answered";
  const canSave = outcome !== null && (!needsRsvp || rsvp !== null) && !saving;

  async function save() {
    setSaving(true);
    try {
      await logContactAction({
        assignmentId: item.assignmentId,
        outcome: outcome!,
        rsvp: needsRsvp ? rsvp : null,
        needsRide: needsRsvp ? needsRide : false,
      });
      onDone(item.fullName);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="wait-item">
      <div className="wait-head">
        <h3>{item.fullName}</h3>
        {item.grade && <span className="sub">שכבה {item.grade}׳</span>}
        <span className="waiting-since">נשלח {timeAgo(item.waitingSince)}</span>
      </div>

      {item.note && <div className="sub">{item.note}</div>}

      <div className="reach">
        <a className="call" href={`tel:${item.phoneE164}`}>
          חייג
        </a>
        <a
          className="wa"
          href={`https://wa.me/${item.phoneE164.replace("+", "")}`}
          target="_top"
          rel="noopener"
        >
          וואטסאפ
        </a>
      </div>

      <div className="opts two">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`opt ${o.kind}`}
            aria-pressed={outcome === o.value}
            onClick={() => {
              setOutcome(o.value);
              if (o.value !== "answered") {
                setRsvp(null);
                setNeedsRide(false);
              }
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {needsRsvp && (
        <>
          <p className="ask">מגיע לפעולה?</p>
          <div className="opts three">
            {RSVPS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`opt ${r.kind}`}
                aria-pressed={rsvp === r.value}
                onClick={() => setRsvp(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ride"
            aria-pressed={needsRide}
            onClick={() => setNeedsRide((v) => !v)}
          >
            <span className="box" aria-hidden="true">
              {needsRide ? "✓" : ""}
            </span>
            צריך הסעה
          </button>
        </>
      )}

      {outcome && (
        <button type="button" className="save" disabled={!canSave} onClick={save}>
          {saving ? "שומר…" : "שמור"}
        </button>
      )}
    </div>
  );
}
