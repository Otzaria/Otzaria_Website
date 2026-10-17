# גופנים ב-public/fonts

תיקייה זו מכילה **רק גופנים שנוצרים אוטומטית** ומוגשים בשם הכולל hash תוכן, ולכן
מוגדר להם `Cache-Control: immutable` לשנה ב-`next.config.ts`.

## material-symbols-outlined.\<hash\>.woff2

subset מקומי של גופן האייקונים Material Symbols Outlined — רק האייקונים שבשימוש
בקוד, ורק המופע הסטטי (opsz 24, wght 400, FILL 0, GRAD 0). קודם לכן הגופן נטען
מ-Google עם כל טווחי האיכסים המשתנים: כ-3.96MB בכל ביקור קר, ממקור חיצוני.

יצירה מחדש (דורש רשת) — נדרש אחרי הוספת אייקון חדש בקוד:

```bash
npm run build:icons
```

הסקריפט (`scripts/build-icon-font.mjs`) סורק את `src/`, מוריד subset מ-Google
ומעדכן את הגופן, את `src/app/styles/icon-font.css`, את `src/lib/icon-font.js`,
את `scripts/icon-font.manifest.json` ואת `scripts/material-symbols-names.txt` (כל
שמות האייקונים התקפים, לבדיקה offline). הפלטים נשמרים ב-Git כדי שה-build לא יהיה
תלוי ברשת.

איזה אייקונים נכללים (`src/lib/iconFontScan.mjs`): רק מחרוזות בהקשר של אייקון —
תוכן של `span.material-symbols-outlined` (כולל טרנרי בתוכו), `<AppIcon name>`,
ערך של שדה/prop/משתנה שבשמו `icon` (`icon:`, `iconEnd=`, `PAGE_ICONS = {…}`,
`function getIcon() {…}`), וארגומנט במקום של פרמטר בשם `icon`
(`toolButton(tool, icon, label)`). אחר כך מסננים מול רשימת השמות התקפים.

למה לא כל מילה בקוד: Google מתעלם בשקט מ-`icon_names` שאורכו מעל 4,096 תווים,
ומחזיר את הגופן המלא (316KB). סריקה של כל token אספה כ-470 "שמות" (function,
class, map...) וחצתה את המגבלה. הסקריפט נכשל לפני הבקשה אם הרשימה ארוכה מדי, נכשל
אם הגופן שהתקבל גדול מ-150KB, וקורא את הליגטורות מהגופן עצמו
(`src/lib/woff2Ligatures.mjs`) כדי לוודא שכל אייקון שבשימוש באמת נמצא בו.

`npm run build` מריץ `check:icons`. הבדיקה offline, ומשווה את האייקונים שבקוד
לליגטורות שבגופן המחויב:

- מקומית — אזהרה בלבד, כדי לא לחסום עבודה (התיקון דורש רשת).
- ב-CI (או עם `--strict`) — מכשילה את ה-build. אייקון חסר מוצג למשתמש כטקסט.

מה שהבדיקה **לא** מכסה: אייקון שמגיע מנתונים, למשל אייקון של קטגוריית תוספים
שהוזן בממשק הניהול. אייקון שנבנה בקוד בדרך שאינה אחת מההקשרים שלמעלה — יש לכתוב
אותו בהקשר מוכר (למשל שדה `icon:`), אחרת הוא לא ייכלל בגופן.

## גופן הכותרות (Frank Ruehl CLM)

אינו כאן: הוא נטען דרך `next/font/local` מ-`src/app/fonts/FrankRuehlCLM-Medium.woff2`,
כך ש-Next מוסיף לו hash ו-preload בעצמו.
מקור להורדה: https://culmus.sourceforge.io/
