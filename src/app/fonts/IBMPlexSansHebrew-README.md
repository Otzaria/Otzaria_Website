# IBM Plex Sans Hebrew (גופן הקלדה "בלי תגים" בעורך העמוד)

- **קבצים:** `IBMPlexSansHebrew-Regular.woff2` (400) ו-`IBMPlexSansHebrew-Bold.woff2` (700), כ-33KB כל אחד.
- **מקור:** חבילת npm הרשמית של IBM, `@ibm/plex-sans-hebrew@1.1.0` (`fonts/complete/woff2/`;
  פרויקט https://github.com/IBM/plex).
- **רישיון:** SIL Open Font License 1.1 — הנוסח המלא ב-`OFL-IBMPlexSansHebrew.txt`. "Plex" הוא שם גופן שמור
  (Reserved Font Name), ולכן הקבצים כאן הם הקבצים הרשמיים **בלי שום שינוי** (בלי חיתוך) — גרסה
  מותאמת הייתה חייבת שם אחר.
- **כיסוי:** ניקוד (חסרים מתג U+05BD וקמץ קטן U+05C7), **בלי טעמים**. בשרשרת הגופנים (editorShellLogic.js)
  אחריו נוטו סנס עברי, כך שטעמים וסימנים חסרים מוצגים בנוטו ולא כריבוע.
- **בלי preload:** נטען רק כשמשתמש בוחר בו בגיליון התצוגה של העורך.

ההצהרה (`preload: false`, `adjustFontFallback: false`, `--font-ibm-plex-hebrew`) ב-`src/app/layout.tsx`.
