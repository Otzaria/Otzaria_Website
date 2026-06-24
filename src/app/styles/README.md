# מערכת העיצוב של אוצריא

כל כללי העיצוב הגלובליים מרוכזים כאן. כדי לשנות עיצוב גלובלי — ערוך קובץ אחד מתוך התיקייה הזו, והשינוי חל על כל הפרוייקט מיידית.

נטען דרך `src/app/globals.css` (שמייבא את כל הקבצים לאחר `@import "tailwindcss"`).

## הקבצים

| קובץ | אחריות | מתי לערוך |
|------|--------|-----------|
| `colors.css` | **מקור האמת לכל הצבעים** — טוקני מותג + רמפות סמנטיות | שינוי כל צבע בממשק |
| `typography.css` | גופנים, גדלי טקסט, משקלים, line-height ו-letter-spacing | שינוי טיפוגרפיה גלובלית |
| `layout.css` | מרווחים, מידות בסיס ושבירות מסך (`--spacing`, `--breakpoint-*`, `--container-*`) | שינוי צפיפות, קצב מרווחים או נקודות שבירה |
| `shape.css` | רדיוסים (`--radius-*`) | שינוי עיגול פינות גלובלי |
| `elevation.css` | צללים (`--shadow-*`, `--drop-shadow-*`, `--text-shadow-*`) | שינוי עומק, הרמות וצללים |
| `motion.css` | easing, blur וברירות מחדל של transition | שינוי תנועה, טשטוש ומהירות מעברים |
| `base.css` | `html` / `body` / תמונת רקע / אייקוני Material | רקע, כיווניות, אייקונים |
| `effects.css` | `glass`, `custom-scrollbar`, `hover-lift`, `spellcheck-highlight` | אפקטים ויזואליים משותפים |
| `animations.css` | `@keyframes` + מחלקות `animate-*` | אנימציות |

## הצבעים (colors.css)

שני סוגי טוקנים:

1. **טוקני מותג** — זהות אוצריא: `primary`, `secondary`, `accent`, `surface`, `surface-variant`, `background`, `on-surface`, `on-primary` וכו'. בשימוש כ-`bg-primary`, `text-on-surface`, `border-surface-variant`...

2. **רמפות סמנטיות (50–950)** — החליפו את צבעי Tailwind הגולמיים שהיו מפוזרים בקוד, **בערכים זהים בדיוק** (אפס שינוי ויזואלי):

   | רמפה סמנטית | תפקיד | (היה Tailwind) |
   |-------------|-------|----------------|
   | `neutral` | ניטרלי ראשי | gray |
   | `neutral-cool` | ניטרלי קריר | slate |
   | `neutral-warm` | ניטרלי חמים | stone |
   | `danger` | שגיאה / סכנה | red |
   | `success` / `success-alt` | הצלחה | green / emerald |
   | `info` / `info-alt` | מידע | blue / indigo |
   | `warning` / `warning-alt` / `warning-strong` | אזהרה | amber / yellow / orange |
   | `feature` | מבטא / מאפיין | purple |
   | `aqua` | אקווה | teal |
   | `pink` | ורוד | pink (אותו שם, מרוכז) |

   שימוש: `bg-neutral-50`, `text-danger-600`, `border-info-200`, `bg-success-alt-600`...

   > **כדי לשנות גוון גלובלית:** ערוך את ערך ה-`--color-<רמפה>-<גוון>` ב-`colors.css`. למשל שינוי כל גווני השגיאה = עריכת ערכי `--color-danger-*`.

## טיפוגרפיה, צורה, פריסה, עומק ותנועה

הקבצים `typography.css`, `layout.css`, `shape.css`, `elevation.css`, ו-`motion.css` הם פרופיל העיצוב הגלובלי הנוכחי: קומפקטי מעט, רך יותר, עם פינות עגולות יותר וצללים עדינים יותר. שינוי בהם משפיע על כל מחלקות Tailwind המתאימות בכל הפרויקט.

דוגמאות:

- שינוי `--radius-lg` ב-`shape.css` ישפיע על כל `rounded-lg`.
- שינוי `--spacing` ב-`layout.css` ישפיע על מרווחים ומידות מספריים כמו `p-4`, `gap-6`, `w-12`.
- שינוי `--shadow-xl` ב-`elevation.css` ישפיע על כל `shadow-xl`.
- שינוי `--text-lg` ב-`typography.css` ישפיע על כל `text-lg`.
- שינוי `--default-transition-duration` ב-`motion.css` ישפיע על `transition-*` ללא duration מפורש.

יש לשנות את הערכים האלה בזהירות, כי הם משפיעים על שטח רחב מאוד.

## תחזוקה

ערכי הרמפות הסמנטיות נוצרו אוטומטית מערכי ברירת המחדל של Tailwind. לרענון לאחר שדרוג Tailwind:

```bash
node scripts/gen-color-tokens.js
```

> הערה: רמפות סמנטיות מגדירות גם מחדש שמות פלטה מובנים של Tailwind (`neutral`, `pink`) — מכוון, לריכוז שליטה. אין להשתמש בקוד חדש בצבעי Tailwind גולמיים (`gray-*`, `red-*` וכו') — יש להשתמש בטוקנים הסמנטיים.
