import { cookies } from "next/headers";
import { getCallers } from "@/lib/queries";
import { GATE_COOKIE, readGateLevel } from "@/lib/session";
import { CodeStep, NameStep } from "./EnterForm";

export const metadata = { title: "כניסה — טלפניה" };
export const dynamic = "force-dynamic";

export default async function EnterPage() {
  const store = await cookies();
  const level = await readGateLevel(store.get(GATE_COOKIE)?.value);
  /* רשימת השמות נשלפת רק אחרי שהקוד אומת */
  const callers = level ? await getCallers() : [];

  return (
    <div className="scroll">
      <div className="enter">
        <div className="enter-mark" aria-hidden="true" />
        <h1>טלפניה</h1>

        {level ? (
          <>
            <p className="enter-lede">בחר את השם שלך כדי להתחיל.</p>
            <NameStep callers={callers} isAdmin={level === "admin"} />
          </>
        ) : (
          <>
            <p className="enter-lede">
              המערכת פתוחה למי שקיבל קוד כניסה. אם יש לך קוד רכז, הקלד
              אותו כאן — הוא יפתח גם את השיחות וגם את הדשבורד.
            </p>
            <CodeStep />
          </>
        )}
      </div>
    </div>
  );
}
