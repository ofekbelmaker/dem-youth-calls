/**
 * Service worker.
 *
 * שתי מטרות: להפוך את האתר לניתן להתקנה, ולתת לו לעלות גם כשהקליטה
 * גרועה — מצב נפוץ כשמתקשרים מהרחוב.
 *
 * אסטרטגיה:
 *   • נכסי build של Next (עם hash בשם) — מהמטמון, הם לעולם לא משתנים.
 *   • כל השאר — מהרשת, ובנפילה מהמטמון.
 *
 * שים לב: המטמון לא כולל נתונים. תיעוד שיחות במצב לא מקוון יטופל
 * בהמשך דרך תור כתיבה, לא כאן.
 */

const CACHE = "dyc-v1";
const PRECACHE = ["/", "/event", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // נכסים עם hash בשם — בטוח לשרת מהמטמון
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
  );
});
