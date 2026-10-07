# תשובות המדווחים במייל → האתר → ה-issue

כשמנהל שולח מייל למדווח מדף הדיווח (`/library/admin/app-reports/<id>`), כתובת המענה (Reply-To)
היא כתובת ייחודית לדיווח, בנוסח `reply+<40 תווי hex>@reply.otzaria.org` (כמו בנטפרי). התשובה של
המדווח מגיעה ל-Email Routing של Cloudflare, וה-Worker שבתיקייה הזו מפענח אותה ושולח אותה לאתר.
האתר עושה כך:

1. **מחפש את הדיווח לפי הטוקן.** הטוקן אקראי ונשמר ב-`AppReport.replyToken`, כך שאי אפשר לנחש אותו.
2. **שומר רק את הטקסט החדש** בהיסטוריית ההתכתבות (`contactLog`, `direction: 'in'`), בלי הציטוט של
   המייל המקורי. בראש המייל היוצא יש שורת חיתוך: "נא לכתוב את התשובה מעל שורה זו".
3. **מפרסם תגובה ב-issue.** כתובות מייל ותיוגי `@` מוסרים לפני הפרסום. אם GitHub נכשל, ה-cron
   `app-reports-sync` ינסה שוב.

מקרים מיוחדים:

- **תשובה מכתובת אחרת מזו שבדיווח:** נשמרת בדף בלבד (`held`) ולא מתפרסמת ב-issue הציבורי.
- **מענה אוטומטי (`Auto-Submitted` וכד'):** לא נשמר.
- **כפילות:** האתר מסנן לפי `Message-ID`.

הלוגיקה עצמה נמצאת באתר: `src/lib/app-reports/inbound.js` ו-`inbound-handler.js`. ה-Worker רק מפענח
את המייל ומעביר אותו הלאה.

## חוזה מול האתר

הבקשה: `POST {SITE_URL}/api/app-reports/inbound-email`, עם `Authorization: Bearer <INBOUND_SECRET>`.

| תשובת האתר | ה-Worker |
|---|---|
| 2xx | סיום (נקלט / כפול / מענה אוטומטי) |
| 404 / 413 / 422 | מעביר את המייל ל-`FALLBACK_TO`, תיבה רגילה שאדם קורא |
| כל השאר, כולל 503 בשבת | שומר ב-KV ומנסה שוב כל 15 דקות (עד 14 יום) |

**בשבת** ה-proxy של האתר מחזיר 503, והתשובות ממתינות ב-KV עד מוצאי שבת. אין חריגה מחסימת השבת.

## הקמה (פעם אחת)

1. **דומיין:** ב-Cloudflare → otzaria.org → **Email** → **Email Routing**, מוסיפים את התת-דומיין
   `reply.otzaria.org`. Cloudflare מוסיף לו רשומות MX ו-SPF משלו, והמייל של הדומיין הראשי לא מושפע.
2. **כתובת יעד לגיבוי:** תחת Destination addresses מוסיפים ומאמתים את התיבה שאליה יגיעו מיילים
   שנדחו. זה הערך של `FALLBACK_TO` ב-`wrangler.toml`.
3. **KV:** מריצים `npx wrangler kv namespace create PENDING`, ומעתיקים את המזהה ל-`wrangler.toml`.
4. **סוד:** יוצרים ערך אקראי ארוך, למשל `openssl rand -hex 32`.
   - ב-Worker: `npx wrangler secret put INBOUND_SECRET`
   - באתר: `.env` בשרת, `APP_REPORTS_INBOUND_SECRET=<אותו ערך>` ו-`APP_REPORTS_REPLY_DOMAIN=reply.otzaria.org`.
     אחר כך `pm2 reload`.
5. **פריסה:** בתיקייה הזו מריצים `npm install`, ואז `npm test` (בדיקת עשן מקומית), ואז `npm run deploy`.
6. **ניתוב:** ב-Email Routing של `reply.otzaria.org` → **Routing rules** → **Catch-all** → *Send to a Worker*
   → `otzaria-app-reports-inbound`.

**סדר חשוב:** להגדיר את משתני האתר רק אחרי שה-Worker והניתוב עובדים. כל עוד `APP_REPORTS_REPLY_DOMAIN`
ריק, המיילים יוצאים עם המענה הרגיל (`SMTP_REPLY_TO`), כמו לפני השינוי.

## בדיקה ומעקב

- `npm run tail` מציג את הלוג החי של ה-Worker.
- בדיקה מקצה לקצה: שולחים מייל מדף דיווח לכתובת שלכם, עונים עליו, ומרעננים את הדף.
  התשובה מופיעה בצבע אחר, עם קישור לתגובה ב-issue.
- מפתחות `failed:` ב-KV הם תשובות שנדחו בניסיון חוזר. כבר אי אפשר להעביר אותן כמייל, ולכן הן
  נשארות שם לבדיקה ידנית עד התפוגה.
