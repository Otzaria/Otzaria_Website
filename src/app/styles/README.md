# מערכת העיצוב של אוצריא — קבצי הסגנון

כל כללי העיצוב הגלובליים מרוכזים כאן, ונטענים דרך `src/app/globals.css` (אחרי `@import "tailwindcss"`).
המדריך המלא (איך משתמשים, מה אסור, איך מעבירים עמוד): `refactor-notes/redesign/design-system.md`.

## שלוש שכבות של טוקנים

| שכבה | קובץ | מה יש בו | מי משתמש |
|------|------|-----------|----------|
| 1. ייחוס | `palette.css` | הגוונים הגולמיים `--ref-<משפחה>-<tone>` — ערכת M3 של אוצריא (seed `#2C1B02`) + הרחבות מותג (parchment, ink, gold, rust) | רק שכבה 2 |
| 2. תפקידים | `colors.css` (+ `theme-dark.css`) | `--color-surface`, `on-surface`, `primary`, `outline-variant`, `donation`, `success`... → מחלקות `bg-surface` וכו' | עמודים ורכיבים |
| 3. רכיב | `component-tokens.css` | `--button-*`, `--card-*`, `--dialog-*`, `--tooltip-*`, `--badge-*`, `--account-*` (רק טוקנים שבשימוש — טוקן לרכיב עתידי נוסף יחד עם הרכיב) | רכיבי `src/components/ui/*` |

אותו עיקרון בשאר הקבצים: **סולם** (שנשאר לעמודים קיימים) + **תפקידים** (לרכיבים חדשים).

| קובץ | סולם (קיים) | תפקידים (לקוד חדש) |
|------|-------------|---------------------|
| `typography.css` | `text-xs … text-9xl`, `font-display`, `font-frank` | `text-display-*`, `text-headline-*`, `text-title-*`, `text-body-*`, `text-label-*` |
| `shape.css` | `rounded-sm … rounded-4xl` | `rounded-control`, `rounded-card`, `rounded-dialog`, `rounded-container`, `rounded-sheet`, `rounded-pill` — כולם מ-`--radius-shape` |
| `elevation.css` | `shadow-sm … shadow-2xl` | `shadow-raised`, `shadow-menu`, `shadow-tooltip`, `shadow-dialog`, `shadow-sheet`, `shadow-overlay` |
| `motion.css` | `ease-in/out/in-out` | `ease-standard/enter/exit`, `--motion-duration-*` (**לא** מתאפסים גלובלית ב-reduced-motion — כל רכיב מבטל את התזוזה שלו במפורש; ראו ההערה בראש `motion.css`) |
| `layout.css` | `--spacing` (3.8px), `--breakpoint-*`, `max-w-6xl` | `max-w-content`, `max-w-content-wide`, `max-w-narrow`, `max-w-measure`, `--page-gutter*`, `--touch-target`, `--z-*` (סקלת שכבות: raised, below-header, sticky, overlay, tooltip, legacy-modal, skip) |

## כללים קצרים

- **אין hex / rgb ברכיבים.** צבע חדש → גוון ב-`palette.css` + תפקיד ב-`colors.css`.
- **אין צבעי Tailwind גולמיים** (`gray-*`, `blue-*`, `bg-white`) ולא רמפות המורשת (`neutral-*`, `danger-*`...) בקוד חדש — רק תפקידים.
- שמות שמסומנים `[מיושן]` ב-`colors.css` (`accent`, `primary-container`, `surface-variant`, `on-background`) — נשמרו רק כדי לא לשבור עמודים קיימים.
- **גופנים:** `font-display` = OT Vilna (Regular בלבד, `--font-vilna` על `<body>`, טוקן `@theme inline`);
  `font-frank` = Frank Ruehl CLM 500/700 לדפים הישנים (`--font-frank-ruehl` על `<html>`, כדי ש-`--font-frank` יהיה תקף
  כבר ב-`:root` — גם כ-`var()` ישיר); `font-sans`/`font-hebrew` = Assistant (`<html>`). משתנה של next/font שעליו נשען
  טוקן `@theme` רגיל (לא inline) חייב להיות על `<html>` — אחרת הטוקן נפסל בשקט והטקסט יורש את גופן ההורה (QA-10).
- מחלקות `text-primary-dark`, `text-foreground`, `text-on-secondary` **אינן מוגדרות** (לא עושות כלום) — בהעברת עמוד מחליפים אותן לתפקיד אמיתי.

## חריגה מתועדת: כלי העורך (38px בעכבר, סגנון "אוורירי וקל" + קבוצות)

מטרת המגע באתר היא 44px (`--touch-target`). בעורך העמוד (`components/editor/v2`) — שורות כלים
שמשתמשים בהן שעות עם עכבר — יש חריגה מכוונת **לעכבר בלבד**:

| טוקן (`component-tokens.css`) | עכבר | מגע (`pointer: coarse`) |
|------|------|------|
| `--button-height-tool` (`Button size="tool"`) | 38px (אייקון 21px — `--button-icon-size-tool`, משקל 300 — `--tool-icon-weight`) | 44px (`--touch-target`) |
| `--editor-topbar-height` | 56px | 56px |
| `--editor-toolbar-height` | 52px | 56px |
| `--editor-statusbar-height` | 30px | 44px |

- גם בעכבר מטרת הלחיצה האנכית נשארת 44px — שכבה שקופה ב-`::before` (`TOUCH_TARGET_OVERLAY` ב-`buttonStyles.ts`), כמו `header`.
- רק בשורות הכלים, בכותרת ובשורת המצב של העורך; כל השאר באתר — לא משתמש ב-`tool`. הפעולה הראשית (תפוס/סיים עמוד) — `filled size="tool"`, באותו גובה כמו שאר הכותרת.
- מראה: שטוח, בלי קווי הפרדה. `text`+`tool` בצבע `--tool-fg` (on-surface-variant), משקל רגיל (רק "הדגשה" נראית מודגשת; `filled` — medium), רדיוס גלולה. ריחוף `--tool-bg-hover` (surface-selected; בתוך כרטיס קבוצה — גוון כהה יותר), לחוץ (`aria-pressed`) — `--tool-bg-pressed` (secondary-container).
- פאנל צר (container query על שורת הכלים, מתחת ל-44rem — למשל 1280 בשני פאנלים), בעכבר בלבד: כפתור 34px ומרווח 8px בין קבוצות, כדי שכלי החובה לא ייצאו ל"עוד".
- קבוצות: כל קבוצת כלים קשורים בכרטיס צף בצורת גלולה (`ToolGroup` ב-`PaneToolbar.jsx`: `--tool-group-bg` + טבעת וצל `--tool-group-shadow`, מתחזק בריחוף) על פס `--tool-strip-bg` כהה במעט; מרווח `--tool-group-gap` (12px) בין קבוצות. בעורך כל טוקני `--tool-*` מוגדרים מחדש על שורש העורך (`editor-themes.css`), כולל ערכת ערב.
- האייקונים הדקים: גופן האייקונים (`scripts/build-icon-font.mjs`) משתנה בציר wght בטווח 300–400; האתר כולו נשאר 400.
  רענון הגופן (`npm run build:icons`) דורש `python3 -m pip install 'fonttools[woff]'`, כדי לצמצם את ציר המשקל בפועל גם כשהספק מחזיר טווח רחב יותר. אין בכך צורך בבנייה רגילה.
- RTL: הגליף ב-`direction: ltr` ולא מתהפך מעצמו (H1, B נשארים נכונים); אייקון כיווני (ביטול/ביצוע מחדש) — `mirror` ב-ToolItem → `rtl:-scale-x-100`.
- הרמזים בשורות האלה קומפקטיים (`Tooltip compact` → `.tooltip-compact`: ריפוד 4×8, `label-md`).

## variants מותאמים (`layout.css`)

| variant | מתי |
|---------|-----|
| `short:` | מ-md ובגובה ≤ 820px (לפטופ נמוך) — כללי לכל האתר |
| `tall:` | מ-2xl ובגובה ≥ 1050px — גיבור דף הבית |
| `narrow:` | רוחב < 400px |
| `dark:` | תחת `data-theme="dark"` — מוכן, לא מופעל |

## מחלקות CSS משותפות

`effects.css`: `.glass`, `.donation-button` (+`-lg`, `.donation-nav-link`, `.donation-note`), `.donation-tip-*` (טיפ התרומה), `.donate-anim*` (`.donation-animated-icon`, אייקון התרומה המונפש), `.app-icon` (+`-donate`), `.loader*` (ui/Loader), `.title-ornament`, `.anchor-section`, `.spellcheck-highlight`.
פסי גלילה (`effects.css`): `.custom-scrollbar` **מסתיר** את פס הגלילה (גלילה בלי פס גלוי); `.scrollbar-thin` — פס דק ומעוצב לאזור גלילה פנימי (+`.scrollbar-end-right`).
`tooltip.css`: `.tooltip`, `.tooltip-host`, `.tooltip-bubble`, `.tooltip-compact` (ui/Tooltip; `position: fixed`, `--z-tooltip`, מתהפך למעלה כשאין מקום — `data-tip-side`).
`nav.css`: `.nav-dropdown*`, `.mobile-nav-group*`.
`animations.css`: `@keyframes` + `animate-*`, וגם מחלקות של אנימציות דף הבית — `.wordmark-handoff-target` ("מעבר שם האתר", `useWordmarkHandoff`), `.forever-*` (השורה המונפשת), `.golden-book-sprite` (הספר המוזהב).

## תחזוקה

- רמפות המורשת (`neutral`, `danger`...) הן העתק מדויק של צבעי Tailwind 4 (gray, red...). הסקריפט שיצר אותן
  (`scripts/gen-color-tokens.js`) כבר לא קיים בריפו; לא צריך לרענן אותן — הן מוקפאות עד שהעמודים יעברו לתפקידים.
- ערכי `palette.css` חושבו ב-`material_color_utilities` 0.13.0 (`SchemeTonalSpot`, seed `0xFF2C1B02`). שינוי
  seed = חישוב מחדש של הפלטה, לא עריכה ידנית של גוונים.
