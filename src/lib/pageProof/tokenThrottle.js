// האטת ניסיונות שגויים של מפתח-גישה, לפי כתובת-IP (lib/client-ip.js). חלון קבוע: אחרי
// FAIL_LIMIT ניסיונות שגויים (מפתח לא קיים, פגום, שבוטל או שפג) בתוך FAIL_WINDOW_MS מהראשון —
// הכתובת נחסמת עד סוף החלון (429), בלי לגשת למסד. ניסיון מוצלח אינו מאפס.
//
// בזיכרון של התהליך (כמו lib/rate-limit.js) — בכמה תהליכים כל אחד סופר לעצמו. לניחוש
// מפתח של 256 ביט אין סיכוי גם בלי זה; ההאטה חוסכת עומס ורעש ביומנים.
// שימו לב: בלי TRUSTED_PROXY_COUNT כל הבקשות נספרות תחת 'unknown' (client-ip — fail-closed),
// ואז ניסיונות שגויים של אחד חוסמים את כולם לעד 10 דקות.

export const FAIL_LIMIT = 10;
export const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 10000;

export function createFailThrottle({ limit = FAIL_LIMIT, windowMs = FAIL_WINDOW_MS, maxKeys = MAX_KEYS } = {}) {
  const hits = new Map(); // key ← {count, start}

  const live = (key, now) => {
    const h = hits.get(key);
    if (!h) return null;
    if (now - h.start >= windowMs) {
      hits.delete(key);
      return null;
    }
    return h;
  };

  const prune = (now) => {
    for (const [key, h] of hits) if (now - h.start >= windowMs) hits.delete(key);
    // עדיין מלא (הצפה מכתובות רבות) — הוותיקים ביותר יוצאים
    while (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
  };

  return {
    // שניות עד שמותר לנסות שוב, או 0 כשאינה חסומה
    blockedFor(key, now = Date.now()) {
      const h = live(String(key), now);
      if (!h || h.count < limit) return 0;
      return Math.max(1, Math.ceil((h.start + windowMs - now) / 1000));
    },
    fail(key, now = Date.now()) {
      const k = String(key);
      const h = live(k, now);
      if (h) {
        h.count++;
        return;
      }
      if (hits.size >= maxKeys) prune(now);
      hits.set(k, { count: 1, start: now });
    },
    reset() {
      hits.clear();
    },
    get size() {
      return hits.size;
    },
  };
}

// המונה של ראוטי הגהת-העמודים (tokenAuth.js)
export const bearerFailures = createFailThrottle();
