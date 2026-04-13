import { RateLimiter } from "limiter";

const limiters = new Map();
const limiterTimestamps = new Map();

// ניקוי זיכרון כל 10 דקות
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 דקות
const MAX_IDLE_TIME = 60 * 60 * 1000; // שעה

// הפעלת ניקוי אוטומטי
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of limiterTimestamps.entries()) {
        if (now - timestamp > MAX_IDLE_TIME) {
            limiters.delete(key);
            limiterTimestamps.delete(key);
        }
    }
}, CLEANUP_INTERVAL);

/**
 * בדיקת מגבלת קצב (Rate Limit) עם ניקוי זיכרון
 * @param {string} ip - כתובת IP
 * @param {string} action - שם הפעולה (למשל 'login', 'register')
 * @param {number} tokens - כמות הבקשות המותרות
 * @param {string} interval - חלון הזמן ('minute', 'hour', 'day')
 * @returns {boolean} - האם הבקשה מותרת
 */
export function checkRateLimit(ip, action, tokens = 10, interval = "minute") {
    // אימות קלט למניעת injection
    if (typeof ip !== 'string' || typeof action !== 'string') {
        return false;
    }
    
    const key = `${ip}:${action}`;
    
    if (!limiters.has(key)) {
        limiters.set(key, new RateLimiter({ tokensPerInterval: tokens, interval: interval }));
    }
    
    // עדכון timestamp לניקוי
    limiterTimestamps.set(key, Date.now());

    const limiter = limiters.get(key);
    return limiter.tryRemoveTokens(1);
}