# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## שפה

תמיד לענות למשתמש בעברית (גם בצ'אט וגם בקבצים כתובים — הודעות קומיט, מסמכים, הערות UI).

## פקודות נפוצות

```bash
npm run dev              # שרת פיתוח (next dev)
npm run build             # generate-version → check:icons → next build → build:offline-editor → check:perf
npm run lint               # eslint
npx tsc --noEmit            # type-check (checkJs כבוי — קבצי .js לא נבדקים, ראו "מלכודות" למטה)

npm test                  # כל הטסטים: node:test (src/lib/**/*.test.mjs) + vitest
npm run test:node          # רק node:test (מודולים טהורים, .test.mjs)
npm run test:vitest         # רק vitest (קומפוננטות RTL + .test.ts/.test.js)
npm run test:watch          # vitest --watch

# טסט בודד:
npx vitest run path/to/file.test.tsx
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/foo.test.mjs
```

פריסה: דחיפה ל-`master` מפעילה `.github/workflows/deploy.yml` (גם cron כל 5 דק' בודק אם תגית
`v1` של `otzaria-plugin-validator` זזה ופורס אוטומטית — ראו README.md). הפריסה עצמה **אינה
משתמשת בדוקר** — היא SSH ישיר ל-VPS: `git pull` + `npm install` + `npm run build` +
`pm2 reload`. אין בפרויקט תמיכת Docker (הוסרה — לא הייתה בשימוש בפרודקשן ולא תוחזקה).

## ארכיטקטורה

Next.js 16 App Router, JS+TS מעורב (`allowJs: true`, `checkJs` כבוי), MongoDB/Mongoose, NextAuth.
עברית/RTL הוא ברירת המחדל של כל הממשק.

### שכבות ההרשאה (חשוב להבין לפני נגיעה בכל דבר תחת `/library` או `/api`)

תפקידים מוגדרים ב-`src/lib/roles.js`: `admin` (כל-יכול), ועוד ארבעה תפקידי-משנה מוגבלי-תחום
(`admin_plugins`, `admin_books`, `admin_books_only`, `admin_ocr`) — כל אחד עם פונקציית `hasXAccess`
משלו. **אל תניחו** ש"מנהל" אחד שווה לאחר — `admin_books_only` למשל *כן* רואה את ספריית הספרים אבל
*לא* דיקטה/העלאות/עמודים, בכוונה. כשמוסיפים בדיקת הרשאה חדשה — לבדוק קודם אם יש כבר `hasXAccess`
מתאים ב-`roles.js` לפני שכותבים תנאי חדש.

בראוטי API: `requireAccess(session, hasAccessFn)` מ-`src/lib/apiResponse.ts` הוא הדפוס המועדף
לשער הרשאה (מחזיר 401/403 אוטומטית, `null` אם עבר). **ההבחנה 401/403 היא מכוונת ולא מקרית**: 401 =
אין session בכלל, 403 = יש session אך אין הרשאה — הפרונט מבחין ביניהם במקומות מסוימים (הפניה
להתחברות מול הודעת "אין הרשאה"). משפחת `dicta/*` (`src/app/api/dicta/_auth.ts`) משתמשת בצורת
תגובה שונה (`{detail: ...}`) במכוון — **אל תאחדו** אותה עם `apiResponse.ts` בלי לבדוק
`refactor-notes/audit/external-api-consumers.md` קודם (ראו סעיף למטה).

### מטמון: Data Cache פנימי (`src/lib/cacheTags.js`) + HTTP (CDN/דפדפן)

רוב דפי הקריאה (חנות תוספים, כמה מסכי ניהול) משתמשים ב-`unstable_cache` + תגית מ-`CACHE_TAGS`,
עם `revalidateNow(tag)` (לא `revalidateTag(tag)` הרגיל!) בכל route שמשנה את הנתון, מיד אחרי כתיבה
מוצלחת ל-DB. `revalidateNow` קורא ל-`revalidateTag(tag, { expire: 0 })` — תפוגה **מיידית**, לא
`'max'` (stale-while-revalidate, שם המתעד רשמית אבל לא מתאים כאן — ראו הערת הקוד המלאה בקובץ).
כלל ברזל בהוספת מטמון חדש (פנימי או HTTP): **אסור** לשתף רשומת מטמון אחת בין משתמשים אם הנתון
תלוי-בזהות-הצופה — לבדוק תמיד מי צריך לראות את הדף (כל מנהל? המשתמש עצמו בלבד?) לפני שמחליטים
על מפתח/תגית/כותרת המטמון.

בנוסף למטמון הפנימי, יש כותרות `Cache-Control` מפורשות (CDN + דפדפן) בדפים/API **ציבוריים
ולא-תלויי-session** (עמודי שיווק, חנות התוספים, נכסים סטטיים, תמונות) — ראו `next.config.ts`
(`headers()`) ל-pages ונכסי `public/`, וכותרות ידניות בכל `route.js` רלוונטי תחת `src/app/api/`.
כל נתיב שמוגן ב-session (הכל תחת `/library/**` חוץ מ-`/library` עצמו, `/api/admin/**`,
`/api/book/**` וכו') **חייב** להישאר `private`/`no-store` — לא לשתף בין משתמשים.

### `src/proxy.js` — שער שבת/יו"ט בצד שרת

Middleware שחוסם את כל האתר (מלבד `/api/cron`, `/api/auth`, ובוטים) בשבת/יו"ט לפי שעון ירושלים
(מול Hebcal, עם מטמון ב-`src/lib/shabbat-cache.js`). **זה אינו נימוק** לבטל caching ב-CDN/דפדפן
על דפים ציבוריים — מקבלים בכוונה "חלון דליפה" קצר-מוגבל (TTL של
דקות בודדות בעמודי שיווק/חנות, לא שעות) שבו דף שנשמר רגע לפני כניסת שבת עשוי עדיין להיות מוגש
ממטמון. לכן ה-TTL בעמודים "רגישי-שבת" נשאר קצר בכוונה (ראו `next.config.ts`), ואילו תוכן שבכלל
לא נחסם/לא רגיש (נכסים סטטיים ממוספרי-hash, תמונות) יכול לקבל TTL ארוך לגמרי.

### API חיצוני — "אל תיגע בלי לבדוק קודם"

חלק מראוטי ה-API נצרכים ע"י אפליקציית שולחן העבודה (`otzaria-desktop`, Flutter/Dart) או כלים
חיצוניים אחרים (GitHub Action של `otzaria-plugin-validator`, webhooks, cron scheduler חיצוני) —
לא רק ע"י ה-frontend של האתר. **לפני שינוי status code, שם שדה, או מבנה JSON בכל route תחת
`src/app/api/**`, לקרוא קודם את** `refactor-notes/audit/external-api-consumers.md` (רשימה מדורגת
לפי רמת ודאות, מאומתת מול קוד האפליקציה בפועל) **ו-**`refactor-notes/desktop-app-findings.md`.
במיוחד רגישים: `plugins/[id]/download`, `plugins/updates`, `plugins/install-result`,
`plugins/[id]/install-token`, `plugin-reports`, `reportingerrors` — צנרת ההתקנה הישירה של
תוספים ודיווחי שגיאה, מאומתת שדה-מול-שדה מול קוד ה-Dart.

### חנות התוספים (Plugin Store) — מקור האמת למפרט ה-SDK אינו בריפו הזה

ראו README.md לטבלה המלאה. בקצרה: מפרט ה-SDK (מתודות/הרשאות/גרסאות) חי בחבילה החיצונית
`otzaria-plugin-validator` (תלות `github:...#v1`, תגית נעה — `.github/workflows/deploy.yml`
מרענן אותה בכל build כדי לעקוף את נאמנות `npm ci` ל-SHA הנעול). **אין להוסיף כאן עותק מקומי
של המפרט** (`src/lib/pluginSdkSpec.js` נמחק כי נסחף מהמקור). כלל תאימות-למפרט → בוולידטור
החיצוני; כלל שהוא דרישת-חנות-בלבד (צילום מסך חובה וכו') → כאן, ב-`src/lib/pluginValidation.js`.

### מבנה תיקיות (`src/`)

- `app/` — App Router: עמודים תחת `library/**` (ניהול+ספרייה, דורש session), עמודי שיווק ברמת
  שורש (`about`, `faq`, `donate`...), `plugins/**` (חנות תוספים, ברובה Server Components +
  מטמון תגית), `api/**` (route handlers).
- `lib/` — לוגיקה טהורה + תשתית שרת (db, cache, auth helpers, ולידציה, פורמט). תת-תיקיות
  `lib/dicta/` ו-`lib/ocr/` ללוגיקת דומיין ספציפית.
- `components/` — מחולק לפי דומיין (`admin/`, `dashboard/`, `editor/`, `ocr/`, `plugins/`,
  `ui/` לרכיבים גנריים).
- `models/` — סכמות Mongoose (Book, Upload, Plugin, OcrJob/OcrLine/OcrTrainingPage, User וכו').
- `hooks/` — hooks משותפים בין דפים (למשל `useRequireAuth`).

## מוסכמות איכות קוד

- **חילוץ לוגיקה טהורה + טסט צמוד, לא פירוק גורף.** הדפוס החוזר בכל הריפקטור: מקובץ/רכיב ענק
  מחלצים רק פונקציות טהורות (בלי DOM/refs/state/side-effects) לקובץ אח עם טסט צמוד (למשל
  `imagePanelGeometry.js`+`.test.js` לצד `ImagePanel.jsx`, `runOcrJob.pure.js` לצד
  `runOcrJob.js`). את שאר הרכיב — הלוגיקה האינטראקטיבית/DOM-heavy — משאירים במקום. רכיב/ראוט
  שנשאר "גדול" בתור shell/orchestrator אחרי שחולצה ממנו כל הלוגיקה הטהורה הניתנת לחילוץ הוא
  תקין ומכוון, לא סימן לעבודה לא-גמורה.
- **ברכיבים חדשים (בניגוד לזהירות מול קוד ישן קיים) — לפרק גם DOM, לא רק לוגיקה טהורה.** הכלל
  של "לחלץ רק לוגיקה טהורה ולא לגעת ב-DOM" (למעלה, וב"מלכודות ידועות") חל על **קוד אינטראקטיבי
  קיים** שאי אפשר לאמת בלי דפדפן אמיתי. בכתיבת קוד **חדש** אין את המגבלה הזו: יש לפרק מראש
  לרכיבי-משנה בגודל סביר (לא זעיר-מדי — לא כל `<div>` צריך קובץ משלו, אבל גם לא רכיב-ענק אחד
  שמערבב כמה אחריויות UI), כולל חלקים שכן נוגעים ב-DOM/state/JSX. במיוחד: אם יש סיכוי סביר
  שרכיב-משנה (מודל, badge, כרטיס, שורת טבלה, טופס) ישמש שוב במקום אחר — לחלץ אותו כקומפוננטה
  עצמאית תחת `src/components/` (בתיקיית הדומיין המתאימה, או `components/ui/` אם הוא גנרי
  לגמרי) מלכתחילה, לא בדיעבד.
- **הודעות שגיאה/ולידציה למשתמש תמיד בעברית** (ראו `src/lib/validation-utils.js` כדוגמה) —
  גם כשהקוד/משתני העזר עצמם באנגלית.
- **כללי `eslint-security` שכובו בכוונה** (`security/detect-object-injection`,
  `detect-non-literal-fs-filename`, `detect-non-literal-regexp` ב-`eslint.config.mjs`) — false
  positives מתועדים בקוד שרת לגיטימי כאן. אל תדליקו אותם מחדש נקודתית בלי לבדוק את ההערה
  בקובץ; `detect-unsafe-regex` ו-`detect-possible-timing-attacks` כן נשארים דלוקים ותופסים
  בעיות אמיתיות.
- **מוסכמת קומיטים**: כותרת בעברית בפורמט `תחום/קובץ: מה השתנה` (למשל "API ניהול OCR
  (layout/lines/training): מעבר ל-requireAccess ותיקון 401/403") — לא "fix bug" גנרי. קומיט
  אחד = שינוי לוגי אחד; מיזוגים מסומנים במפורש בכותרת ("מיזוג: ...").
- **מיקום/שם קובצי טסט**: לוגיקה טהורה ב-`.js`/`.mjs` נטולת JSX → `*.test.mjs` (רץ ב-`node:test`,
  `npm run test:node`). כל השאר (קומפוננטות React, `.ts`/`.tsx`) → `*.test.ts`/`*.test.tsx`/
  `*.test.js` עם Vitest+RTL. תמיד צמוד לקובץ המקור באותה תיקייה, לא בתיקיית `__tests__` נפרדת.

## מלכודות ידועות (למדו בכאב בריפקטור האחרון)

- **`checkJs` כבוי** — קבצי `.js` לא עוברים type-check אף פעם, גם לא ע"י `tsc --noEmit`. באג טיפוסים
  בקובץ `.js` (כולל שימוש ב-API מיושן של ספרייה) לא ייתפס אוטומטית — יש לבדוק ידנית מול תיעוד
  הגרסה המותקנת (`node_modules/<pkg>/dist/docs` כשקיים) כשמשתמשים ב-API לא-מוכר.
- **`revalidateTag(tag)` בארגומנט יחיד מיושן ב-Next 16** — עדיין "עובד" (רק אזהרת console), אבל
  יש להשתמש תמיד ב-`revalidateNow(tag)` מ-`src/lib/cacheTags.js`, לא לקרוא ל-`revalidateTag`
  ישירות.
- **`unstable_cache` (במקום `"use cache"`/Cache Components)** — זו החלטה מכוונת, לא חוב-טכני
  שנשכח: מיגרציה ל-Cache Components היא שינוי ארכיטקטוני שלם (Suspense בכל מקום), לא ניקוי קטן.
  אל תיזמו אותה מיוזמתכם — ראו `refactor-notes/DOUBTS.md` לנימוק המלא.
- **`DictaEditorCore.jsx`** ורכיבי עורך/OCR אינטראקטיביים דומים (`ImagePanel.jsx`,
  `LayoutTaskCards.jsx`) — נשארים גדולים בכוונה. מותר לחלץ מהם רק לוגיקה **טהורה לחלוטין**
  (ללא DOM/refs/selection/canvas) לקובץ נפרד עם טסטים; אל תיגעו בקוד שנוגע ב-DOM/refs בלי בדיקה
  ויזואלית בדפדפן אמיתי — סוכן אוטומטי לא יכול לאמת את זה.
- **סעיף "איחוד auth/error-shape ב-API" (401 מול 403, `error` מול `detail`) — לא לגעת בלי בקשה
  מפורשת.** זו החלטה שממתינה לאישור מפורש של המשתמש (ראו `refactor-notes/PLAN.md` סעיף E,
  `refactor-notes/DOUBTS.md`) — יש כוונה לאחד בעתיד אך זה שינוי התנהגות HTTP אמיתי שעלול לשבור
  את אפליקציית שולחן העבודה.
- **worktree של סוכן שהסתעף בטעות מ-`master` במקום מהענף הנוכחי** — קרה שוב ושוב בעבודה
  מקבילה עם git worktrees. לוודא `git log --oneline -1` תואם לענף המצופה לפני תחילת עבודה
  ב-worktree חדש.
- כשמזהים כפילות קוד/utility כבר קיים — לחפש קודם ב-`src/lib/` ו-`src/hooks/` לפני יצירת אחד
  חדש (למשל `formatDate.ts`, `api-utils.js`, `validation-utils.js`, `apiResponse.ts` כבר קיימים
  ומכסים דפוסים נפוצים).

## היסטוריית הריפקטור (`refactor-notes/`)

הענף `refactor/full-overhaul` עבר ריפקטור מקיף (הסרת כפילויות, פירוק קבצים ענקיים, Server
Components, מטמון תגית, טסטים) בכמה סבבים. **הפרטים המלאים לא כאן בכוונה** — לטעון רק לפי צורך:

- `refactor-notes/PLAN.md` — מצב נוכחי, מה בוצע ומה נשאר פתוח במכוון.
- `refactor-notes/CHANGELOG.md` — יומן כרונולוגי מלא של כל שינוי משמעותי וקומיט.
- `refactor-notes/DOUBTS.md` — כל החלטה גבולית/ספק שהתקבל תוך כדי עבודה, מחכה לאישור.
- `refactor-notes/audit/*.md` — אודיט מקורי לפי תחום (api-routes, plugins, library-admin,
  lib-hooks-pages, external-api-consumers).
- `refactor-notes/desktop-app-findings.md` — ממצאים מבדיקת קוד `otzaria-desktop` בפועל.

תיקייה זו ב-`.gitignore` (לא חלק מהריפו) — היא תיעוד עבודה מקומי, לא מסמך מוצר.
