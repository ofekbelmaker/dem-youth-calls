import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* לא להופיע בשום מנוע חיפוש, גם אם מישהו קישר לאתר */
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
          /* לא לדלוף את הכתובת שלנו לאתרים שנפתחים מתוך האפליקציה
             — למשל כשלוחצים על כפתור וואטסאפ */
          { key: "Referrer-Policy", value: "no-referrer" },
          /* לא לאפשר הטמעה של האפליקציה בתוך מסגרת באתר אחר */
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
