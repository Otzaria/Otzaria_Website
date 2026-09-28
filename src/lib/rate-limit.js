import { RateLimiter } from "limiter";

const limiters = new Map();
const limiterTimestamps = new Map();

// מאגר משותף לכל ה-bundles באותו תהליך Node: דף (RSC) ו-route handler מקבלים
// כל אחד מופע נפרד של המודול הזה, ולכן גם Map נפרד. checkSharedRateLimit
// משתמש במאגר הזה כדי שדף וה-API שלו ייספרו על אותו bucket. בכוונה רק שם
// ולא לכל הפעולות: פעולות שחוזרות בכמה routes (למשל 'register') נספרות
// היום בנפרד בכל route, ואיחודן היה משנה את המכסות בפועל.
const SHARED_STORE_KEY = Symbol.for('otzaria.rateLimit.sharedStore');
const sharedStore = (globalThis[SHARED_STORE_KEY] ??= {
    limiters: new Map(),
    timestamps: new Map(),
});

// ניקוי זיכרון כל 10 דקות
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 דקות
const MAX_IDLE_TIME = 60 * 60 * 1000; // שעה

// הפעלת ניקוי אוטומטי
function cleanupIdle(store, timestamps) {
    const now = Date.now();
    for (const [key, timestamp] of timestamps.entries()) {
        if (now - timestamp > MAX_IDLE_TIME) {
            store.delete(key);
            timestamps.delete(key);
        }
    }
}

// (הניקוי של המאגר המשותף רץ מכל מופע של המודול — פעולה אידמפוטנטית)
setInterval(() => {
    cleanupIdle(limiters, limiterTimestamps);
    cleanupIdle(sharedStore.limiters, sharedStore.timestamps);
}, CLEANUP_INTERVAL).unref?.();

function tryConsume(store, timestamps, ip, action, tokens, interval) {
    // אימות קלט למניעת injection
    if (typeof ip !== 'string' || typeof action !== 'string') {
        return false;
    }

    const key = `${ip}:${action}`;

    if (!store.has(key)) {
        store.set(key, new RateLimiter({ tokensPerInterval: tokens, interval: interval }));
    }

    // עדכון timestamp לניקוי
    timestamps.set(key, Date.now());

    return store.get(key).tryRemoveTokens(1);
}

/**
 * בדיקת מגבלת קצב (Rate Limit) עם ניקוי זיכרון
 * @param {string} ip - כתובת IP
 * @param {string} action - שם הפעולה (למשל 'login', 'register')
 * @param {number} tokens - כמות הבקשות המותרות
 * @param {string} interval - חלון הזמן ('minute', 'hour', 'day')
 * @returns {boolean} - האם הבקשה מותרת
 */
export function checkRateLimit(ip, action, tokens = 10, interval = "minute") {
    return tryConsume(limiters, limiterTimestamps, ip, action, tokens, interval);
}

/**
 * כמו checkRateLimit, אך על bucket משותף לכל ה-bundles בתהליך — לפעולה שנספרת
 * גם בדף שמרונדר בשרת וגם ב-route handler (למשל 'plugin-search').
 * @param {string} ip - כתובת IP
 * @param {string} action - שם הפעולה
 * @param {number} tokens - כמות הבקשות המותרות
 * @param {string} interval - חלון הזמן ('minute', 'hour', 'day')
 * @returns {boolean} - האם הבקשה מותרת
 */
export function checkSharedRateLimit(ip, action, tokens = 10, interval = "minute") {
    return tryConsume(sharedStore.limiters, sharedStore.timestamps, ip, action, tokens, interval);
}
