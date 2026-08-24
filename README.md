This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

לפריסה מלאה כולל כל הפונקציות יש להשתמש בדוקר, ולהריץ

```
docker-compose up --build
```

בתיקיית השורש

## ולידציה של תוספים — הלוגיקה אינה כאן

חנות התוספים אינה מממשת את כללי ה‑SDK. היא צורכת אותם מחבילת
[`otzaria-plugin-validator`](https://github.com/Otzaria/otzaria-plugin-validator),
אותה חבילה שמריצה את בדיקות ה‑CI של התוספים עצמם.

| שכבה | סמכות | איפה |
|---|---|---|
| **נתונים** — מתודות, הרשאות, אירועים, גרסאות מינימום, מדיניות ההגדרות | `spec.json`, מחולל בריפו של אוצריא מקוד האפליקציה | נוסע בתוך החבילה (`src/spec.json`) |
| **לוגיקה** — תאימות למפרט: כללי מניפסט, תנאי `when`, סריקת קוד, הצלבת הרשאות, תאימות עיצוב | החבילה | `otzaria-plugin-validator` |
| **מדיניות** — מה חוסם ובאיזו חומרה, ומה נדרש כדי להתפרסם: צילום מסך חובה, `homepage` חייב http(s), אורכי `author`/`description`, חסימה על אזהרות | האתר | `src/lib/pluginValidation.js` (חומרה), `src/app/api/plugins/upload/route.js` ו-`admin/plugins/[id]/edit` (שערי פרסום), `src/lib/pluginSubmission.js` (מגבלות שדה) |

**אין כאן עותק של המפרט.** היה כאן `src/lib/pluginSdkSpec.js` עם סקריפט סנכרון,
והוא נסחף (מפת ההרשאות שלו פיגרה ב‑10 מתודות אחרי האפליקציה). המפרט מגיע עכשיו
מהחבילה בלבד; `src/lib/pluginValidationPackage.test.mjs` נכשל אם החנות מפסיקה
להישען עליה.

### הצמדה: ראש `v1` בכל בנייה

התלות מוצהרת `github:Otzaria/otzaria-plugin-validator#v1` — תגית נעה. מפני
ש‑`npm ci` נאמן ל‑SHA שב‑`package-lock.json`, `.github/workflows/deploy.yml`
מריץ צעד רענון מפורש אחרי כל התקנה (גם ב‑build-check וגם בדריסה לשרת):

```bash
npm install "github:Otzaria/otzaria-plugin-validator#v1" --legacy-peer-deps --no-save
```

**המשמעות: כלל ולידציה חדש בוולידטור נכנס לחנות בבנייה הבאה, מיד ובלי שער
סקירה.** לכן כלל חוסם חדש שם פוסל מכאן ואילך גם *עדכון* של תוסף שכבר מפורסם.

### הוספת כלל

- כלל תאימות למפרט (מתודה, הרשאה, `when`, אריזה) → בוולידטור.
- כלל שהוא דרישת חנות בלבד → כאן, ולא בוולידטור. ערבוב היה מפיל ב‑CI של מפתחי
  התוספים דברים שהם דרישת חנות ואינם קיימים באפליקציה.
- שינוי בנתוני המשטח (API/הרשאה חדשים) → בריפו של אוצריא, שממנו `spec.json`
  מחולל. לא כאן ולא בוולידטור.