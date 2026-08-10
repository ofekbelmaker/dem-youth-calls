import { redirect } from "next/navigation";
import CallCard from "./components/CallCard";
import { getActiveEvent, getCurrentCaller } from "@/lib/queries";

/* הנתונים משתנים תוך כדי ערב חיוג — אין מה לשמור במטמון */
export const dynamic = "force-dynamic";

export default async function CallPage() {
  const caller = await getCurrentCaller();
  if (!caller) redirect("/auth/reset");

  const event = await getActiveEvent();
  if (!event) {
    return (
      <div className="scroll">
        <p className="empty">
          אין פעולה פעילה.
          <br />
          רכז צריך ליצור פעולה לפני שאפשר להתחיל לחייג.
        </p>
      </div>
    );
  }

  /* הכרטיס עצמו נמשך מהלקוח, כדי שהתפיסה תקרה בפעולה מפורשת
     ולא כתופעת לוואי של רינדור */
  return <CallCard event={event} />;
}
