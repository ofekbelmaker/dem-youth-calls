import { redirect } from "next/navigation";
import AwaitingList from "./AwaitingList";
import { getActiveEvent, getAwaiting, getCurrentCaller } from "@/lib/queries";

/* הרשימה משתנה תוך כדי ערב חיוג — אין מה לשמור במטמון */
export const dynamic = "force-dynamic";

export default async function WaitingPage() {
  const caller = await getCurrentCaller();
  if (!caller) redirect("/auth/reset");

  const event = await getActiveEvent();
  if (!event) {
    return (
      <div className="scroll">
        <p className="empty">אין פעולה פעילה.</p>
      </div>
    );
  }

  const items = await getAwaiting(caller.id, event.id);
  return <AwaitingList items={items} />;
}
