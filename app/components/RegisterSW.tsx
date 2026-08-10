"use client";

import { useEffect } from "react";

/**
 * רושם את ה-service worker, שהוא מה שהופך את האתר לאפליקציה שאפשר
 * להתקין. רק בבנייה לייצור — בפיתוח הוא רק היה מגיש קבצים מטמון ישנים.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* אין SW — האפליקציה עדיין עובדת, פשוט לא ניתנת להתקנה */
    });
  }, []);

  return null;
}
