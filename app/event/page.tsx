import { redirect } from "next/navigation";
import {
  getActiveEvent,
  getCurrentCaller,
  getEventDashboard,
  getNeglected,
  getUpcomingCampaigns,
} from "@/lib/queries";
import { countdownText, formatWhen } from "@/lib/format";
import type { EventInfo } from "@/lib/types";
import NewCampaignForm from "./NewCampaignForm";

export const dynamic = "force-dynamic";

export default async function EventPage() {
  const caller = await getCurrentCaller();
  if (!caller) redirect("/auth/reset");

  const [event, upcoming] = await Promise.all([
    getActiveEvent(),
    getUpcomingCampaigns(),
  ]);

  /**
   * מבנה אחד לשני המצבים, במכוון.
   *
   * קודם היה כאן return מוקדם כשאין קמפיין, והתוצאה הייתה שרגע אחרי
   * יצירת הקמפיין הראשון המסך החליף מבנה, React הרכיב את הטופס מחדש,
   * והודעת ההצלחה — כמה שיחות נכנסו לרשימה — נעלמה בדיוק כשהיא הכי
   * נחוצה. עכשיו הטופס יושב באותה משבצת בשני המצבים ושורד את המעבר.
   */
  return (
    <>
      <header className="topbar">
        <div>
          <h1>{event ? event.title : "מסך רכז"}</h1>
          {event && (
            <div className="when">
              {formatWhen(event.startsAt, event.location)} ·{" "}
              <b>{countdownText(event.startsAt)}</b>
            </div>
          )}
        </div>
      </header>

      <div className="scroll">
        <div className="dash">
          {event ? (
            <Dashboard event={event} />
          ) : (
            <p className="empty">
              אין קמפיין פעיל.
              <br />
              צור אחד כדי שהטלפנים יוכלו להתחיל לחייג.
            </p>
          )}

          <NewCampaignForm
            key="new-campaign"
            upcoming={upcoming}
            startOpen={!event}
          />
        </div>
      </div>
    </>
  );
}

async function Dashboard({ event }: { event: EventInfo }) {
  const [{ stats, callers }, neglected] = await Promise.all([
    getEventDashboard(event.id),
    getNeglected(event.id),
  ]);

  const coverage = stats.assigned
    ? Math.round((stats.reached / stats.assigned) * 100)
    : 0;
  const answerRate = stats.reached
    ? Math.round((stats.answered / stats.reached) * 100)
    : 0;
  const active = callers.filter((c) => c.reached > 0);
  const idle = callers.filter((c) => c.reached === 0);
  const topReached = Math.max(1, ...active.map((c) => c.reached));

  return (
    <>
      <div className="headline">
        <div className="k">צפי הגעה</div>
        <div className="v">
          {stats.rsvpYes}{" "}
          {event.targetCount ? <small>מתוך יעד {event.targetCount}</small> : null}
        </div>
        <div className="note">
          {stats.rsvpMaybe} עוד באולי · {stats.needsRide} צריכים הסעה
        </div>
      </div>

      <div className="split">
        <div className="stat">
          <div className="k">כיסוי הרשימה</div>
          <div className="v">{coverage}%</div>
        </div>
        <div className="stat">
          <div className="k">שיעור מענה</div>
          <div className="v">{answerRate}%</div>
        </div>
      </div>

      <div className="split">
        <div className="stat">
          <div className="k">נוצר קשר</div>
          <div className="v">
            {stats.reached}
            <small style={{ fontSize: 15, color: "var(--ink-3)" }}>
              {" "}
              / {stats.assigned}
            </small>
          </div>
        </div>
        <div className="stat">
          <div className="k">אמרו שלא</div>
          <div className="v">{stats.rsvpNo}</div>
        </div>
      </div>

      {neglected.length > 0 && (
        <section className="panel">
          <h3>לא נוצר קשר</h3>
          <p className="fineprint" style={{ textAlign: "start", margin: 0 }}>
            כמה טלפנים דילגו עליהם ועדיין לא נוצר איתם קשר. שווה שתתקשר בעצמך.
          </p>
          <div className="neglected">
            {neglected.map((p) => (
              <a
                key={p.phoneE164}
                href={`tel:${p.phoneE164}`}
                className="neglected-row"
              >
                <span className="who">
                  <b>{p.fullName}</b>
                  {p.note && <small>{p.note}</small>}
                </span>
                <span className="count">
                  דולג {p.skipCount}× · {p.skippedBy} מתקשרים
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h3>מי תרם כמה</h3>
        {active.length === 0 ? (
          <p className="empty" style={{ padding: "20px 0" }}>
            עוד לא תועדה אף שיחה.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>מתקשר</th>
                <th>שיחות</th>
                <th>מגיעים</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.profileId}>
                  <td>{c.displayName}</td>
                  <td>{c.reached}</td>
                  <td>{c.rsvpYes}</td>
                  <td>
                    <div className="bar" role="img" aria-label={`${c.reached} שיחות`}>
                      <i style={{ width: `${(c.reached / topReached) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {idle.length > 0 && (
        <section className="panel">
          <h3>עוד לא התחילו</h3>
          <p className="fineprint" style={{ textAlign: "start" }}>
            {idle.map((c) => c.displayName).join(" · ")}
          </p>
        </section>
      )}
    </>
  );
}
