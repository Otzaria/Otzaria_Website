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
| `layout.css` | `--spacing` (3.8px), `--breakpoint-*`, `max-w-6xl` | `max-w-content`, `max-w-content-wide`, `max-w-narrow`, `max-w-measure`, `--page-gutter*`, `--touch-target`, `--z-*` (סקלת שכבות: raised, below-header, sticky, overlay, legacy-modal, skip) |

## כללים קצרים

- **אין hex / rgb ברכיבים.** צבע חדש → גוון ב-`palette.css` + תפקיד ב-`colors.css`.
- **אין צבעי Tailwind גולמיים** (`gray-*`, `blue-*`, `bg-white`) ולא רמפות המורשת (`neutral-*`, `danger-*`...) בקוד חדש — רק תפקידים.
- שמות שמסומנים `[מיושן]` ב-`colors.css` (`accent`, `primary-container`, `surface-variant`, `on-background`) — נשמרו רק כדי לא לשבור עמודים קיימים.
- מחלקות `text-primary-dark`, `text-foreground`, `text-on-secondary` **אינן מוגדרות** (לא עושות כלום) — בהעברת עמוד מחליפים אותן לתפקיד אמיתי.

## variants מותאמים (`layout.css`)

| variant | מתי |
|---------|-----|
| `short:` | מ-md ובגובה ≤ 820px (לפטופ נמוך) — כללי לכל האתר |
| `tall:` | מ-2xl ובגובה ≥ 1050px — גיבור דף הבית |
| `narrow:` | רוחב < 400px |
| `dark:` | תחת `data-theme="dark"` — מוכן, לא מופעל |

## מחלקות CSS משותפות

`effects.css`: `.glass`, `.donation-button` (+`-lg`, `.donation-nav-link`, `.donation-note`), `.donation-tip-*` (טיפ התרומה), `.donate-anim*` (`.donation-animated-icon`, אייקון התרומה המונפש), `.app-icon` (+`-donate`), `.loader*` (ui/Loader), `.title-ornament`, `.anchor-section`, `.spellcheck-highlight`, `.hover-lift`.
פסי גלילה (`effects.css`): `.custom-scrollbar` **מסתיר** את פס הגלילה (גלילה בלי פס גלוי); `.scrollbar-thin` — פס דק ומעוצב לאזור גלילה פנימי (+`.scrollbar-end-right`).
`tooltip.css`: `.tooltip`, `.tooltip-host`, `.tooltip-bubble` (ui/Tooltip).
`nav.css`: `.nav-dropdown*`, `.mobile-nav-group*`.
`animations.css`: `@keyframes` + `animate-*`, וגם מחלקות של אנימציות דף הבית — `.wordmark-handoff-target` ("מעבר שם האתר", `useWordmarkHandoff`), `.forever-*` (השורה המונפשת), `.golden-book-sprite` (הספר המוזהב).

## תחזוקה

- רמפות המורשת (`neutral`, `danger`...) הן העתק מדויק של צבעי Tailwind 4 (gray, red...). הסקריפט שיצר אותן
  (`scripts/gen-color-tokens.js`) כבר לא קיים בריפו; לא צריך לרענן אותן — הן מוקפאות עד שהעמודים יעברו לתפקידים.
- ערכי `palette.css` חושבו ב-`material_color_utilities` 0.13.0 (`SchemeTonalSpot`, seed `0xFF2C1B02`). שינוי
  seed = חישוב מחדש של הפלטה, לא עריכה ידנית של גוונים.
