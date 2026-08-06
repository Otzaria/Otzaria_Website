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
ומעדכן את הגופן, את `src/app/styles/icon-font.css`, את `src/lib/icon-font.js`
ואת `scripts/icon-font.manifest.json`. הפלטים נשמרים ב-Git כדי שה-build לא יהיה
תלוי ברשת. `npm run build` מריץ `check:icons` שמתריע אם אייקון בקוד חסר בגופן.

## גופן הכותרות (Frank Ruehl CLM)

אינו כאן: הוא נטען דרך `next/font/local` מ-`src/app/fonts/FrankRuehlCLM-Medium.woff2`,
כך ש-Next מוסיף לו hash ו-preload בעצמו.
מקור להורדה: https://culmus.sourceforge.io/
