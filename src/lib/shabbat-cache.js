/**
 * shabbat-cache — מטמון החלטת "אסור במלאכה" (שבת/יום טוב) מול Hebcal.
 *
 * הלוגיקה מופרדת מ-src/proxy.js כדי שתהיה ניתנת לבדיקה: היא רצה לפני כל דף
 * וכל API באתר, וטעות בה משמעותה או אתר פתוח בשבת או אתר חסום סתם.
 * הבדיקות: src/lib/shabbat-cache.test.mjs
 *
 * מדיניות המטמון:
 *  • ערך בתוקף (עד ttlMs) מוחזר מיד.
 *  • כשנותר פחות מ-refreshAheadMs עד הפקיעה, נשלח רענון ברקע. כך תחת תעבורה
 *    רצופה הערך מתחדש לפני שהוא פג, ואף בקשת משתמש אינה ממתינה ל-Hebcal
 *    (נמדדו 0.68–0.75 שניות TTFB בכל פקיעה).
 *  • ערך שפג תוקפו אינו מוחזר בשום מצב. אחרי הפסקה בתעבורה הוא עלול להיות
 *    מלפני כניסת השבת, ואז בקשה בשבת הייתה מקבלת "מותר". המתנה עדיפה.
 *  • כשל רענון כשקיים ערך תקף משאיר אותו על מכונו — תקלה רגעית ב-Hebcal אינה
 *    סיבה לבטל החלטת חסימה.
 *  • כשל ללא ערך תקף נכשל "פתוח" (false), כמו הסקריפט המקורי, עם מטמון שלילי
 *    קצר שמונע הצפת Hebcal בזמן תקלה.
 *
 * המטמון הוא פר-תהליך: בפריסה מרובת מופעים כל מופע מחזיק עותק, ובקשה ראשונה
 * בתהליך חדש (cold start) ממתינה עד timeoutMs.
 */

// כתובת ה-API של Hebcal עבור ירושלים (geonameid=281184), עם שעון ישראל (im=1).
export const HEBCAL_URL = 'https://www.hebcal.com/zmanim?cfg=json&im=1&geonameid=281184';

export const DEFAULTS = {
  ttlMs: 60_000,
  errorTtlMs: 30_000,
  refreshAheadMs: 15_000,
  timeoutMs: 2_500,
};

/**
 * @param {object} [options] החלפת התלויות (שעון/fetch) לצורך בדיקות
 */
export function createShabbatGate(options = {}) {
  const { url = HEBCAL_URL, now = Date.now, fetchImpl, ...timings } = options;
  const { ttlMs, errorTtlMs, refreshAheadMs, timeoutMs } = { ...DEFAULTS, ...timings };
  const doFetch = (...args) => (fetchImpl ?? fetch)(...args);

  let cache = null;
  let inFlight = null;

  /** קורא ל-Hebcal ומעדכן את המטמון. אינו זורק. */
  function refresh() {
    if (inFlight) return inFlight;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    inFlight = (async () => {
      try {
        const res = await doFetch(url, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const value = data?.status?.isAssurBemlacha === true;
        cache = { value, expires: now() + ttlMs };
        return value;
      } catch {
        if (cache && cache.expires > now()) return cache.value;
        cache = { value: false, expires: now() + errorTtlMs };
        return false;
      } finally {
        clearTimeout(timer);
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return {
    /**
     * @param {{ waitUntil?: (p: Promise<unknown>) => void }} [event]
     *   מאפשר לרענון הרקע להמשיך לרוץ אחרי שהתשובה נשלחה.
     */
    async isAssurBemlacha(event) {
      const current = now();

      if (cache && cache.expires > current) {
        if (cache.expires - current <= refreshAheadMs) {
          const pending = refresh();
          if (event?.waitUntil) event.waitUntil(pending);
        }
        return cache.value;
      }

      return refresh();
    },

    /** לבדיקות בלבד */
    _peek: () => cache,
  };
}

export const shabbatGate = createShabbatGate();
