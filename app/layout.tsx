import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "./components/TabBar";
import RegisterSW from "./components/RegisterSW";
import Link from "next/link";
import { signOutAction } from "./enter/actions";
import { adminSignOutAction } from "./admin/actions";
import {
  getActiveEvent,
  getAwaitingCount,
  getCurrentCaller,
  getIsAdmin,
} from "@/lib/queries";

export const metadata: Metadata = {
  title: "טלפניה — נוער הדמוקרטים",
  description: "תור השיחות לקראת פעולה, תיעוד תוצאות, ומעקב הגעה בזמן אמת.",
  manifest: "/manifest.webmanifest",
  applicationName: "טלפניה",
  appleWebApp: {
    capable: true,
    title: "טלפניה",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171a22" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [caller, isAdmin] = await Promise.all([
    getCurrentCaller(),
    getIsAdmin(),
  ]);

  /* המונה על הלשונית. נטען כאן ולא במסך עצמו, כי כל התועלת שלו היא
     להיראות דווקא כשנמצאים במקום אחר. */
  let waitingCount = 0;
  if (caller) {
    const event = await getActiveEvent();
    if (event) waitingCount = await getAwaitingCount(caller.id, event.id);
  }

  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="app">
          {caller && (
            <div className="whoami">
              <span>
                מחובר כ־<b>{caller.name}</b>
              </span>
              <div className="whoami-actions">
                {isAdmin ? (
                  <form action={adminSignOutAction}>
                    <button type="submit">צא מתצוגת רכז</button>
                  </form>
                ) : (
                  <Link href="/admin">תצוגת רכז</Link>
                )}
                <form action={signOutAction}>
                  <button type="submit">החלף</button>
                </form>
              </div>
            </div>
          )}

          {children}

          {/* הטלפן מקבל שתי לשוניות, הרכז גם את "הפעולה" */}
          {caller && <TabBar isAdmin={isAdmin} waitingCount={waitingCount} />}
        </div>
        <RegisterSW />
      </body>
    </html>
  );
}
