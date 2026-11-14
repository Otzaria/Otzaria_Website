# צורת הדף — בדיקה אנושית מול הדפוס: חוזה המודול באתר

המודול מציג למתנדבים את העמודים של פרויקט "צורת הדף" (`Otzaria/tzurat-hadaf`) מול הסריקה של ש"ס וילנא, ואוסף
מהם הכרעות נוסח, תיקוני שבירת שורות (עוגנים) ודיווחים. פורמט החבילה הנכנסת והייצוא היוצא מוגדרים ב-
`PACKAGE.md` (זהה לעותק ב-`tzurat-hadaf/docs/SITE.md`). כאן — המודלים, הנתיבים, ההרשאות והכללים.

## נתיבים ושמות

| מה | נתיב |
|---|---|
| דף הכניסה למתנדב | `/library/tzurat-hadaf` |
| מסלול מהיר | `/library/tzurat-hadaf/fast` |
| רשת עמודים למסכת | `/library/tzurat-hadaf/pages?m=<slug>` |
| בדיקת עמוד | `/library/tzurat-hadaf/review?page=<id>` |
| "התרומות שלי" | `/library/tzurat-hadaf/mine` |
| ניהול | `/library/admin/tzurat-hadaf` |
| הנחיות (ציבורי) | `/docs/tzurat-hadaf` |
| API מתנדב | `/api/tzurat-hadaf/**` |
| API ניהול (session או Bearer `tht_`) | `/api/admin/tzurat-hadaf/**` |
| קוד | `src/lib/tzuratHadaf/*` (רמה אחת, ייבוא יחסי עם `.js` — node:test), `src/components/tzuratHadaf/**`, `src/models/Tzurat*.js` |
| תמונות | `/uploads/tzurat-hadaf/<slug>/<dafKey>.scan.png`, `.ours.<webp|png>` (הסיומת מהחבילה) — חסום ב-`BLOCKED_PREFIXES`, מוגש רק דרך ה-API |
| העלאות גולמיות | `storage/tzurat-hadaf/uploads/<uploadId>/` (לא ב-public) |

## הרשאות

- **מתנדב:** משתמש מחובר ומאומת (`isVerified`) או מנהל המודול. בלי session ה-proxy של האתר מחזיר 307 לדף ההתחברות (כמו בשאר הנתיבים המוגנים; 401 רק אם הבקשה עקפה את ה-proxy, למשל בבדיקות); 403 בלי אימות.
  כל סוגי הטקסט (גמרא, רש"י, תוספות, גיליון) לכל המתנדבים.
- **מנהל המודול:** `hasTzuratAdminAccess(role)` ב-`roles.js` = `admin` או `admin_books`. ב-proxy אין צורך
  בשינוי (admin_books מוגבל ברשימת חסימה, שאר תפקידי המשנה ברשימת היתר), חוץ מהעברת Bearer.
- **אסימון API:** קידומת `tht_`, היקפים `read` / `import` / `review` (כמו `ppt_` בהגהת עמודים, מודל נפרד
  `TzuratToken`). מתקבל רק תחת `/api/admin/tzurat-hadaf/**` חוץ מ-`/tokens`. בעל האסימון חייב עדיין
  להיות מנהל המודול.

## מודלים

- `TzuratBatch` — חבילה מיובאת אחת (מסכת × בנייה): `slug` (מסכת), `masechet` (עברית), `buildId`, `order`,
  `importedAt`, `importedBy`, מונים (`pages`, `items`), `status` (`active`/`paused`). ייחודי: `{slug}`.
  ייבוא חוזר של אותה מסכת מעדכן את המסמך.
- `TzuratPage` — עמוד: `slug`, `masechet`, `daf` ("ב."), `dafKey` ("002a"), `order`, `buildId`, `pdf`
  `{file, page}`, `scan {path, w, h}`, `ours {path, w, h}`, `nonVilna`, `model` (Mixed — מודל העמוד, PACKAGE.md),
  `pendingCount`, `status` (`open` / `done` / `closed`), `round`, `required` (1/2), `activeCount`,
  `approvedCount`, `submitters` [ObjectId], `leasedBy`, `leasedUntil`, `changedInRound` (Bool).
  ייחודי `{slug, dafKey}`. אינדקסים: `{status, leasedUntil}`, `{leasedBy, leasedUntil}`, `{slug, order}`.
- `TzuratItem` — החלטת נוסח: `sourceKey` (ייחודי), `slug`, `masechet`, `daf`, `dafKey`, `page` (ref ל-
  TzuratPage), `kind`, `cls`, `question` (`replace` / `print_only` / `otz_only` / `paren`), `ref`, `wi`, `n`,
  `otz` [String], `print` [String], `ctxBefore`, `ctxAfter`, `box` {x,y,w,h} (שבר מהסריקה) או null,
  `score`, `hints` (Mixed; למנהל בלבד), `manual` (Bool — נוצר בבדיקת עמוד), `answers` [{user, who, name,
  verdict, text, via (`fast`/`page`), submission?, at}], `status` (`open` / `agreed` / `disputed` / `resolved` / `flagged` /
  `obsolete`), `resolved` {verdict, text, by, byName, at}, `leasedBy`, `leasedUntil`, `pointsAwarded` (Bool),
  `buildId`, `revision` (מונה שמתחיל ב-0 ועולה בעדכון שאלה שלא נענתה). אינדקסים: `{status, kind, score, _id}`, `{status, score, _id}`, `{page}`, `{'answers.user': 1}`.
- `TzuratSubmission` — הגשת בדיקת עמוד: `page`, `slug`, `dafKey`, `user`, `who`, `userName`, `round`,
  `buildId`, `checks` {key: 'ok'|'issue'}, `lineOps` [Mixed] (כפי שנשלחו), `anchors` [נגזר: PACKAGE.md],
  `itemAnswers` [{item, verdict, text}], `manualItems` [ids], `reports` [ids], `note`, `status`
  (`processing` / `submitted` / `approved` / `rejected`), `review*` (`reviewedBy`, `reviewedByName`, `reviewedAt`,
  `reviewNote`, `reviewerEdited`), `exportedAt`, `input` (קלט מנורמל עמיד לחידוש), `answerIssues`, `processingToken`, `processingUntil`.
- `TzuratDraft` — טיוטה אחת לעמוד (`page` ייחודי): `user`, `stage`, `state` (Mixed), `version`, `updatedAt`. מוחזרת רק אם גרסת הבנייה והסבב תואמת.
- `TzuratReport` — דיווח חופשי: `page`, `slug`, `dafKey`, `user`, `who`, `userName`, `category`, `text`,
  `regions` [{side: `scan`|`ours`, x, y, w, h}] (שברים 0–1 מהתמונה), `status` (`new` / `in_progress` /
  `fixed` / `wontfix` / `duplicate`), `resolution` {note, buildId, at, by}, `submission` (אם נשלח בהגשה).
- `TzuratUpload` — העלאה מחולקת + עבודת ייבוא: `name`, `size`, `chunkSize`, `chunks`, `received` [Number],
  `sha256`, `status` (`uploading` / `queued` / `processing` / `done` / `failed`), `progress` {pages, items,
  images}, `summary`, `errors` [≤20], `by`, `startedAt`, `finishedAt`, `heartbeatAt`.
- `TzuratToken` — כמו `PageProofToken`.

## כללי עבודה

### מסלול מהיר
- `GET /api/tzurat-hadaf/fast?exclude=id,id&kind=g|r|t|any` — פריט אחד: סטטוס `open`, שהמשתמש לא ענה עליו,
  לא מוחזק אצל אחר (החזקה רכה של 10 דקות), לפי `kind` המותר לו. סדר: גמרא קודם, אחר כך `score` יורד, עם
  אקראיות קלה בין המובילים ($sample מתוך 20 הראשונים). מחזיר `{item: publicItem, stats}`; `publicItem`
  **בלי** `otz`/`print` מסומנים — שתי הקריאות כ-`options: [{id:'a', words}, {id:'b', words}]` בסדר אקראי
  קבוע לפריט ולמשתמש (hash), בלי `hints`, בלי `answers` של אחרים.
- `POST /api/tzurat-hadaf/items/[id]/answer` `{choice, revision, text?, via}` — `choice` הוא מזהה האפשרות שהוצגה
  (`a`/`b`/`other`/`elsewhere`/`none`/`unclear`/`yes`/`no`); השרת מתרגם ל-`verdict` קנוני (PACKAGE.md),
  ומוסיף תשובה אטומית (`answers.user: {$ne: uid}`, סטטוס `open`). אחרי ההוספה: `consensus(answers)`:
  שתי תשובות עם אותו verdict (ובאותו טקסט מנורמל ב-`other`) → `agreed` ו-+1 נקודה לכל אחד מהמסכימים
  (פעם אחת, `pointsAwarded`); שתי תשובות שונות (לא unclear) → `disputed`; שני `unclear` → `disputed`.
  `unclear` אחד לא סוגר. 409 אם כבר נסגר / כבר ענה.
- `POST /api/tzurat-hadaf/items/[id]/flag` `{reason}` — "החיתוך לא מראה את המקום": `flagged`.
- `GET /api/tzurat-hadaf/items/[id]/image?ctx=1` — חיתוך סביב `box` (ריפוד: שורה מעל ומתחת, כפול הרוחב
  לצדדים), `?full=1` — הסריקה המלאה. `private, max-age=86400, immutable`.

### בדיקת עמוד
- `GET /api/tzurat-hadaf/books` — מסכתות עם מונים. `GET /api/tzurat-hadaf/pages?slug=` — רשת העמודים עם
  מצב לכל עמוד (open/mine/taken/submitted/approved/done).
- `POST /api/tzurat-hadaf/pages/[id]/claim` (עד 5 מוחזקים, 48 שעות, שבת וחג לא נספרים — `lease.js` של
  הגהת עמודים), `/release`, `GET /api/tzurat-hadaf/pages/[id]` (עמוד + מודל + הפריטים הממתינים שלו, לא
  עיוורים + הטיוטה), `PUT …/draft` (מחזיק בלבד, rate limit), `POST …/submit`.
- שבירת שורות: הלקוח שולח `lineOps` ([{op:'start', block, line, ref, wi}, {op:'confirm', block, line}]),
  והשרת גוזר מהם `anchors` לפי PACKAGE.md (פונקציה טהורה `lineOps.js`, אותה גם בלקוח).
- עמוד `required: 2` ל-10% מהעמודים (hash דטרמיניסטי של slug+dafKey); השני לא רואה את ההגשה הראשונה.
- הגשה מאושרת: +10 נקודות; דיווח שסומן `fixed`: +2 למדווח.
- `POST /api/tzurat-hadaf/reports` (גם מחוץ להגשה), `GET /api/tzurat-hadaf/mine` — התרומות שלי + סטטוסים.

### ניהול (`/api/admin/tzurat-hadaf/**`)
- העלאה: `POST uploads {name,size}` → `{id, chunkSize}`; `PUT uploads/[id]/chunks/[n]` (גוף בינארי,
  ≤ chunkSize, idempotent); `GET uploads/[id]` (חלקים שהתקבלו + מצב העבודה); `POST uploads/[id]/complete` →
  202 ועיבוד ברקע (`after()`), עם unzip זורם (fflate `Unzip`) מקובץ על הדיסק; `POST uploads/[id]/retry`.
  ייבוא idempotent לפי `{slug,dafKey}` ו-`sourceKey`; פריט שכבר נענה לא נדרס; פריט פתוח שאינו בחבילה
  החדשה של אותה מסכת → `obsolete`; עמוד שה-buildId שלו השתנה וסומן `changed` בחבילה → `round+1`, `open`.
- `GET items?status=disputed|flagged&…`, `PATCH items/[id]` `{action: resolve|reopen|unflag, verdict, text}`.
- `GET submissions?status=`, `GET submissions/[id]`, `PATCH submissions/[id]` `{action: approve|reject, note,
  anchors?, itemAnswers?}`.
- `GET reports?status=`, `PATCH reports/[id]` `{status, note}`.
- `GET export?since=<iso>&parts=decisions,anchors,manual,checks,reports,contributors` — NDJSON זורם, שורה
  לכל רשומה עם `type`; פורמט ב-PACKAGE.md. `POST sync` — סטטוסים מצורת הדף (דיווחים, עמודים לפתיחה).
- `GET/PUT/DELETE guide`, `GET/POST tokens`, `DELETE tokens/[id]`, `GET stats`.

### שבת
האתר חסום ממילא (proxy). זמני החזקת עמוד לא נספרים בשבת ובחג (`leaseEnd`).

## צורות התגובה (מחייב את השרת ואת הלקוחות)

כל תגובה: JSON, `Cache-Control: private, no-store` (חוץ מתמונות). שגיאה: `{error: "<עברית>", code?: "<מזהה>"}`
עם 400/401/403/404/409/413/429/503. מזהים: `id` = ObjectId כמחרוזת. כתובות תמונה — יחסיות.

### מתנדב
- `GET /api/tzurat-hadaf/overview` →
  `{books:[{slug, masechet, order, pages, pagesOpen, pagesDone, items, itemsOpen, itemsAgreed, itemsDisputed}],
    me:{practiceDone, decisions, agreed, pages, pagesApproved, reports, points}, canAdmin}`
- `GET /api/tzurat-hadaf/practice` → `{items:[FastItem + {explain}]}` (עד 10, מהחבילות: `practice.jsonl`)
- `POST /api/tzurat-hadaf/practice` `{answers:[{id, choice, text?}]}` (חובה תשובות ל-min(10, הזמינות); אחרת 400
  `{code:'practice_short'}` בלי לסמן) → `{score, total, results:[{id, correct,
  expected (choice id), explain}]}` — מסמן `practiceDone` (בכל ציון).
- `FastItem` = `{id, revision, slug, masechet, daf, kind, kindLabel, question, prompt, focus:[words]|null, fullBox,
  options:[{id, label, words?}], allowText, ctxBefore, ctxAfter, imageUrl, fullImageUrl, box}`.
  `options[].id` מתוך `a`/`b`/`yes`/`no`/`here`/`elsewhere`/`none`. `allowText` — יש "משהו אחר" (`replace`).
  "לא ברור" (`unclear`) ו"משהו אחר" (`other` + `text`) תמיד אפשריים בשליחה, גם אם אינם ב-`options`.
  `box` — שברים בתוך תמונת החיתוך (`imageUrl`), למסגרת. `fullBox` — אותה תיבה כשברים מהסריקה המלאה (`fullImageUrl`), או null. `focus` — המילים שבשאלה (`print_only`/`otz_only`).
- `GET /api/tzurat-hadaf/fast?exclude=id,id&kind=any|g|r|t&stats=1` → `{item: FastItem|null, stats:{open, mine,
  mineAgreed}|null, needPractice: bool, practiceDone: bool}`. אם `needPractice` — `item: null`. המונים מחושבים רק עם `stats=1` (בפתיחת המסלול); בבקשת השאלה הבאה `stats:null`.
- `POST /api/tzurat-hadaf/items/[id]/answer` `{choice, revision, text?, via: 'fast'|'page'}` → `{status:
  'recorded'|'agreed'|'disputed', points: 0|1}`. 409 `{code:'closed'|'answered'|'paused'|'stale'}`; 403 `{code:'practice'}` (לא סיים
  תרגול, כשיש תרגול). `answers[].text`/`decision.text` נשמרים כפי שנכתבו; הנרמול רק להשוואה.
- `POST /api/tzurat-hadaf/items/[id]/flag` `{reason}` → `{ok:true, flagged}` — רך: נרשם לסימון של המשתמש (השאלה לא תוצע לו
  שוב), והפריט `flagged` רק אחרי שני משתמשים שונים. 409 `{code:'flagged'|'closed'|'paused'}`, 429 (10 לדקה).
- `GET /api/tzurat-hadaf/items/[id]/image[?full=1]` → PNG/WebP.
- `GET /api/tzurat-hadaf/books/[slug]/pages` → `{book:{slug, masechet, pages, pagesDone},
  pages:[{id, daf, dafKey, state, pendingCount, round, nonVilna}], held:[id], maxHeld}`.
  `state` ∈ `open`/`mine`/`taken`/`submitted`/`approved`/`done`/`closed`.
- `POST /api/tzurat-hadaf/pages/[id]/claim` → `{leasedUntil}` (המחזיק עצמו — חידוש שלא מקצר ואינו נספר מול 5); `POST …/release` → `{ok:true}`.
- `GET /api/tzurat-hadaf/pages/[id]` → `{page:{id, slug, masechet, daf, dafKey, round, version, nonVilna, state,
  leasedUntil, scan:{url, w, h}, ours:{url, w, h}, model}, items:[FastItem], draft:{stage, state,
  updatedAt}|null, processing:bool, prev:{id,daf}|null, next:{id,daf}|null}`.
- `GET /api/tzurat-hadaf/pages/[id]/image?side=scan|ours[&x=&y=&w=&h=][&thumb=1]` (שברים) → תמונה. החיתוך מתרחב לרשת של 1/200
  (ונשמר בדיסק); חיתוך/ממוזערת — עד 240 לדקה למשתמש (429).
- `PUT /api/tzurat-hadaf/pages/[id]/draft` `{stage, state, version, baseUpdatedAt}` → `{updatedAt}`; 409
  `{code:'stale'|'not_holder'}`.
- `POST /api/tzurat-hadaf/pages/[id]/submit`
  `{checks:{blocks, headers, edges, size}, lineOps:[…], itemAnswers:[{item, choice, revision, text?}],
    manualItems:[{block, line, ref, wi, n, otz:[…], text, box:{x,y,w,h}|null}],
    reports:[{category, text, regions:[…]}], note, version, round?}` → `{submission: id, points: 0, warnings:[string]}`.
  `version` מועתק ללא שינוי מ-`page.version`; גם שמירה וגם הגשה מחזירות `409 stale` לגרסה ישנה.
  ההגשה מתחילה כ-`processing`: הקלט נשמר לפני תופעות הלוואי, ואינה ניתנת לבדיקה או לייצוא.
  כשל מסד מחזיר `503 retry` ומשאיר טיוטה וקלט. אותה בקשת הגשה ממשיכה מהקלט השמור, ללא כפילויות.
  בעמוד עם `processing:true` הלקוח מציג כפתור חידוש במקום עריכה; `409 processing` משמעו שעובד אחר עדיין שומר.
  שינוי/סגירת שאלה בזמן השמירה נרשמים ב-`answerIssues` וב-`warnings`, עם הקלט המקורי לעיון המנהל.
  `stage` של הטיוטה ∈ `overview`/`lines`/`text`/`submit`.
- `POST /api/tzurat-hadaf/reports` `{page, category, text, regions}` → `{id}`.
- `GET /api/tzurat-hadaf/mine` → `{points, decisions:{total, agreed, disputed, open}, pages:[{id, slug,
  masechet, daf, status, reviewNote, at}], reports:[{id, slug, masechet, daf, category, text, status,
  resolution, at}]}`.

### ניהול
- `GET /api/admin/tzurat-hadaf/stats` → `{books:[…overview…], items:{byStatus, byKind}, submissions:{byStatus},
  reports:{byStatus}, volunteers:{total, active7d}, uploads:[last 5]}`
- `GET batches` → `{batches:[{slug, masechet, order, buildId, pages, items, status, importedAt}]}`;
  `PATCH batches/[slug]` `{status:'active'|'paused'}` → `{batch}`.
- `POST uploads` `{name, size}` → `{id, chunkSize, chunks}`; `PUT uploads/[id]/chunks/[n]`
  (application/octet-stream) → `{received:[…]}`; `GET uploads` → `{uploads:[Upload]}`; `GET uploads/[id]` →
  `{upload: Upload}`; `POST uploads/[id]/complete` → 202 `{upload}`; `POST uploads/[id]/retry` → 202.
  `Upload` = `{id, name, size, chunkSize, chunks, received, status, progress:{pages, items, images},
  summary, errors, startedAt, finishedAt}`.
- `GET items?status=&slug=&kind=&page=1` → `{items:[AdminItem], total, page, pages}`; `AdminItem` = כל שדות
  `TzuratItem` + `answers[].name` + `imageUrl`. `PATCH items/[id]` `{action:'resolve', verdict, text?} |
  {action:'reopen'} | {action:'unflag'} | {action:'obsolete'}` → `{item: AdminItem}`.
- `GET submissions?status=&page=1` → `{submissions:[{id, slug, masechet, daf, userName, round, status,
  counts:{anchors, items, manual, reports}, at}], total, page, pages}`; `GET submissions/[id]` → `{submission, page(כמו
  אצל המתנדב), anchors, items, reports}`; `PATCH submissions/[id]` `{action:'approve'|'reject', note,
  lineOps?}` → `{submission}`.
- `GET reports?status=&category=&slug=&page=1` → `{reports:[Report + {userName, scanUrl, oursUrl}], total, page, pages}`;
  `PATCH reports/[id]` `{status, note}` → `{report}`.
- `GET export?since=&types=` (או `parts=`, יחיד או רבים) → NDJSON (PACKAGE.md §3). `POST sync` → `{reports, pages, errors}` (reopen idempotent לפי buildId+note; עמוד עם הגשה ממתינה בסבב — לא נפתח ולא נסגר, ומופיע ב-errors) (מונים +
  עד 20 הודעות; `pages[].action` ∈ `reopen`/`close`).
- `GET/PUT/DELETE guide` (כמו בהגהת עמודים). `GET/POST tokens`, `DELETE tokens/[id]`.
