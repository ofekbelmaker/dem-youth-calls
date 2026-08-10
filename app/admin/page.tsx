import Link from "next/link";
import AdminForm from "./AdminForm";

export const metadata = { title: "תצוגת רכז — טלפניה" };

export default function AdminPage() {
  return (
    <div className="scroll">
      <div className="enter">
        <h1>תצוגת רכז</h1>
        <p className="enter-lede">
          המסך הזה מציג את נתוני כל המתקשרים. הוא דורש קוד נפרד מקוד
          הכניסה הרגיל.
        </p>
        <AdminForm />
        <p className="fineprint">
          <Link href="/">חזרה לשיחות שלי</Link>
        </p>
      </div>
    </div>
  );
}
