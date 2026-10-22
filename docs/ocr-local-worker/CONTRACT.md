# OCR מקומי — חוזה ה-API מול שירות העובד (`/api/worker/v1`)

**מקור האמת לחוזה אינו בריפו הזה.** החוזה נקבע בריפו השירות `OtzariaTaskAgent`:

- `docs/HANDOVER.md`, סעיף 3 ("Site API contract"), כולל 3.1 (שינויים מאז המסירה הראשונה).
- `contracts/*.schema.json` (`job-envelope`, `status`, `result`, `ack`) ו-`contracts/examples/*.json`.
- המפרט `Otzaria_Task_Agent_Spec_HE.md` (סעיפים 3–4).
- הלקוח בפועל: `src/OtzariaTaskAgent.Core/Site/SiteClient.cs`; אתר הדמה `tools/FakeSite`.

המסמך הזה מסכם את מה שהאתר מממש, כולל קודי השגיאה שהאתר הוסיף או בחר. אסור לשנות קוד סטטוס, שם
שדה או מבנה JSON באחד מהנתיבים האלה בלי לבדוק מול הלקוח ב-C#. השירות מסווג תשובות לפי הסטטוס
(ראו "סיווג אצל השירות"), וסטטוס "קרוב" עלול להפוך תקלה זמנית לעצירת עבודה, או להפך.
מדריך התפעול: [`OPERATIONS.md`](OPERATIONS.md).

## כללים לכל הנתיבים

- `Authorization: Bearer <OCR_WORKER_SECRET>`. השוואה קבועת-זמן; הסוד לעולם לא ב-URL או בלוג.
- כל תשובה היא JSON (`application/json; charset=utf-8`) עם `Cache-Control: no-store`, גם שגיאות:
  `{"error":"<code>", ...}`. החריג היחיד: גוף ה-PDF ב-`/input`.
- אין הפניות (3xx): `/api/worker` אינו נתיב מוגן ב-withAuth. השירות לא עוקב אחרי הפניות.
- כל עבודה שייכת ל-`workerId` שנקבע ביצירתה (`OCR_WORKER_ID`). עבודה של עובד אחר, עבודה שעדיין
  ב-`preparing` (אין לה קלט) ומזהה שאינו ObjectId בן 24 תווי hex קטנים — כולן `404 not_found`.
- כל קריאה מאומתת מעדכנת "נראה לאחרונה" של העובד (`OcrWorkerState.lastSeenAt`); דיווח מצב
  (`POST /jobs/{id}/status`) לעבודה פעילה מעדכן גם את `lastSeenAt` של העבודה. לתצוגה בלבד.

## הנתיבים

| נתיב | תשובה תקינה | שגיאות |
|---|---|---|
| `GET /jobs?limit=100&cursor=<opaque>` | `200 {"items":[…], "nextCursor": "<opaque>" \| null}` — כל העבודות הלא-סגורות של העובד (כל המצבים הפעילים חוץ מ-`preparing`), מהישנה לחדשה, עד `limit` (ברירת מחדל ומקסימום 100). כל פריט: המעטפה (`job-envelope.schema.json`) ועוד `cancelRequested` ו-`siteState`. | `400 bad_request` (limit/cursor לא תקינים) |
| `GET /jobs/{id}` | `200 {"jobId","state","cancelRequested","closed","ack"?}` — `ack` (ארבעת השדות בדיוק) רק אם נשמר ack. | `404 not_found` |
| `GET /jobs/{id}/input` | `200` גוף ה-PDF בזרימה, `Content-Type: application/pdf`, `Content-Length`, `X-Content-SHA256` (= `inputSha256`). מוגש גם לעבודה שבוטלה, כל עוד הקובץ קיים. | `404 not_found`, `404 input_unavailable`, `409 input_corrupt`, `503 storage_unavailable` (+`Retry-After`) |
| `POST /jobs/{id}/status` | `200 {"cancelRequested": bool}` — לפי מצב ה-DB אחרי העדכון, גם לדיווח ישן או לעבודה סגורה. | `400 bad_request`, `413 payload_too_large`, `422 invalid_report` (+`field`), `403 wrong_worker`, `404 not_found` |
| `POST /jobs/{id}/result` | `200 {"ack","jobId","resultSha256","outcome"}` — בדיוק ארבעה שדות (`ack.schema.json`), רק אחרי שמירה עמידה וטיפול בכל העמודים. | ראו טבלת השגיאות של הקליטה |

### המעטפה

`schemaVersion` (1), `jobId`, `taskType` (`ocr`), `workerId`, `createdAt` (= יצירת העבודה), `inputSha256`,
`options` (`lm`: `rabbinic`/`modern`/`off`, `defaultScript`: `square`/`rashi`), ו-`pageMap`: לכל עמוד ב-PDF
`{pdfPageIndex (1..N), pageId (מזהה ה-Page), pageNumber, expectedUpdatedAt, imageSha256}`. ה-PDF מכיל רק את
העמודים לעיבוד, לפי סדר `pageNumber`. המעטפה אינה משתנה לאורך חיי העבודה.

השירות שומר את המעטפה בקבלה הראשונה ומשווה אליה בכל סבב (hash על כל המעטפה, `JobRepository.Manifest`
בשירות). כל שינוי בה, כולל **צורת** `options`, מחנה את העבודה אצלו כ-`manifest_conflict` (HANDOVER 3.1
פריט 10). לכן האתר שולח לכל עבודה תמיד את אותה צורה:

- `options` הוא תמיד אובייקט, אף פעם לא חסר ולא `null`. הוא נבנה רק ממה שנשמר ברשומה בעת היצירה, בסדר
  מפתחות קבוע (`lm`, `defaultScript`). עבודה חדשה נשמרת עם שני המפתחות מפורשים (ברירות המחדל ממולאות
  ב-`normalizeLocalRequest`). רשומה בלי `options` תישלח תמיד כ-`{}`. אין ל-`OptionsSchema` ברירות מחדל
  של Mongoose, ואף מסלול (דיווח, ביטול, החלה, ניקוי, מיגרציה) לא כותב לשדות המעטפה אחרי המעבר ל-`queued`.
- `createdAt` ו-`expectedUpdatedAt` נשלחים ב-`toISOString()` (UTC עם מילישניות). השירות משווה ביניהם
  כרגעים ולא כטקסט.
- `jobId` הוא ObjectId בן 24 תווי hex קטנים, ולכן תמיד תואם לתבנית `^[A-Za-z0-9_-]{1,64}$` ואינו יכול
  להיות שם התקן של Windows. `schemaVersion` תמיד 1, ו-`taskType` תמיד `ocr`.
- המעטפה מופיעה רק בפריטי `GET /jobs`. `GET /jobs/{id}` מחזיר מצב בלבד, בלי מעטפה.

`Retry-After` נשלח תמיד כמספר שניות: `300` ב-`503 storage_unavailable`, `30` ב-`503 apply_in_progress`
ו-`3600` בשער השבת.
השירות מגביל כל `Retry-After` לשעה (`ErrorClassifier.MaxRetryAfter`). ב-`/input` הוא דוחה רק את ההורדה
של אותה עבודה (HANDOVER 3.1 פריט 9).

### `state` / `siteState`

| מצב העבודה באתר | `state` | `closed` |
|---|---|---|
| `queued` | `queued` | `false` |
| `running`, `pausing`, `paused_runner`, `delivery_pending`, `needs_attention`, `applying` | `in_progress` | `false` |
| `completed`, `failed` | `closed` | `true` |
| `cancelled` | `cancelled` | `true` |

### דיווח מצב

- גוף לפי `status.schema.json`. `message` נשלח רק ב-`needs_attention`, בפורמט `"<reason>: <טקסט קבוע>"`.
  מחרוזת ריקה או פורמט אחר נדחים ב-`422 invalid_report` (`field: "message"`).
- מה השירות שולח בפועל (`Sync/StatusReporter.cs`, גרסה 1.0.142): `running`/`pausing`/`paused_runner`/
  `delivery_pending` בכל סבב (כל `Scheduling:StatusSeconds`, ומיד אחרי מעבר השהיה). `needs_attention` ו-`queued`
  ("עבודה מוחנית") נשלחים כשהמצב או ה-`message` משתנים, ואחר כך כל 5 דקות. `queued` נשלח רק לעבודה שחזרה לתור אחרי
  שכבר התחילה (ניסיון חוזר, או `requeue` ידני בשירות); עבודה שטרם התחילה לא מדווחת.
- קודי ה-`reason` ב-`message` (`StatusReporter.AttentionText`): `manifest_conflict`, `jobid_case_conflict`,
  `device_missing`, `pipeline_misconfigured`, `process_tree_alive`, `crash_loop`, `input_hash_mismatch`,
  `input_unavailable`, `delivery_rejected`, `result_conflict`, `invalid_ack`, `output_missing`, `output_corrupt`,
  `output_unknown`, `output_path_invalid`. קוד לא מוכר נשלח כקוד חשוף, וקוד לא תקין נשלח כ-`unknown`. כולם
  מתקבלים, והממשק מציג לכל קוד מוכר תווית בעברית (`attentionReason` ב-`src/components/admin/ocr/ocrJobView.js`).
- **HANDOVER 3.1 פריט 8:** אם העבודה כבר מוחנית מסיבה אחרת (למשל `delivery_rejected`) והנתונים הקבועים שלה
  משתנים, השירות מדווח שוב `needs_attention`, והפעם עם `message` של `manifest_conflict`. ביטול שמגיע יחד עם
  נתונים שהשתנו עשוי להופיע רגע כ-`needs_attention` (`manifest_conflict`) ואחר כך כ-`delivery_pending`, עד
  שתוצאת ה-`cancelled` נמסרת. האתר מקבל את כל המעברים האלה (מצב, `message`, ניקוי ה-`message` ביציאה).
- `workerId` בגוף שונה מ-`OCR_WORKER_ID` → `403 wrong_worker` (בעיית תצורה).
- הדיווח מתקבל רק אם `reportSeq` גדול מהשמור, העבודה פעילה, לא הוחלט עליה (`decision:null`), והיא לא
  ב-`preparing` או `applying`. דיווח ישן או כפול לא דורס חדש ולא פותח עבודה סגורה; התשובה עדיין 200.
  `reportSeq` עולה ונשמר אצל השירות לפני כל שליחה, גם כשהשליחה נכשלת.
- המצבים `completed`/`failed`/`cancelled` בדיווח לא סוגרים עבודה. רק תוצאה סוגרת.
- דיווח שנדחה ב-4xx (שאינו 401/403 ואינו דף HTML) או ב-3xx **לא** עוצר את העבודה אצל השירות: הוא נרשם כאירוע `status_rejected` (פעם
  אחת לכל קוד סטטוס לעבודה), והעיבוד והמסירה ממשיכים. בכל זאת, דחייה של דיווח תקין היא באג באתר.

### קליטת תוצאה

- כותרת `X-Result-SHA256` (64 hex; אותיות גדולות מתקבלות, ה-ack מחזיר קטנות). גוף UTF-8 JSON עד 100MiB.
- **אותו hash שוב** → `200 already_received` עם אותו `outcome`, בלי להחיל דבר (גם אחרי ניקוי הקבצים).
- **hash אחר** אחרי נעילה → `409 result_conflict`. הקובץ נשמר לבירור (`resultConflicts`), אלא אם יש כבר
  20 התנגשויות שלא סומנו כנבדקו (אז התשובה זהה, אבל הקובץ לא נשמר).
- **תוצאה אחרי ביטול מפורש** → `200 {"ack":"cancelled", …, "outcome":"cancelled"}` בלי קשר ל-outcome שנשלח.
  הטקסט לא מוחל; שליחה חוזרת מקבלת את אותה תשובה. מגרסת השירות שמצילה עמודים (≥1.0.149), תוצאה כזו עשויה
  לשאת עמודים: הם נשמרים כהתנגשויות `job_cancelled` ולא נכתבים לעמודים (ראו "נתוני פריסה, אזהרות ונתוני עזר").
- כל עמוד מוחל בעדכון מותנה ב-`expectedUpdatedAt`. עמוד שהשתנה נרשם כהתנגשות ולא נדרס.

| קוד | `error` | מתי | `Retry-After` |
|---|---|---|---|
| 400 | `bad_hash_header` | כותרת `X-Result-SHA256` חסרה או לא תקינה | |
| 400 | `hash_mismatch` | ה-sha256 של הגוף שהתקבל שונה מהכותרת | |
| 400 | `invalid_result` | הגוף אינו JSON תקין ב-UTF-8 | |
| 404 | `not_found` | עבודה לא מוכרת או של עובד אחר (לא נוצרת רשומה) | |
| 408 | `upload_incomplete` | **תוספת:** ההעלאה נקטעה לפני סוף הגוף | |
| 409 | `result_conflict` | hash אחר מזה שכבר ננעל | |
| 410 | `job_closed` | **תוספת:** העבודה אינה פעילה, לא בוטלה במפורש ואין לה תוצאה נעולה (למשל סגירה ידנית במסד), ולכן אינה מקבלת תוצאה | |
| 413 | `result_too_large` | מעל 100MiB (לפי `Content-Length` או תוך כדי קריאה) | |
| 422 | `validation_failed` | הפרת `result.schema.json` או אי-התאמה לעבודה (`jobId`, `inputSha256`, עמודים); `details` מפרט | |
| 500 | `internal_error` | חריגה לא צפויה (בלי טקסט החריגה). שליחה חוזרת ממשיכה מאותה נקודה | |
| 503 | `apply_in_progress` | קליטה של אותה תוצאה כבר רצה (lease בתוקף) | 30 |
| 503 | `storage_unavailable` | **תוספת:** שורש האחסון חסר, או שגיאת אחסון בשמירה (דיסק מלא, הרשאות וכו') | 300 |

### מגבלות וקבלה סלחנית בצד האתר, מעבר לסכמה (סקירה W09)

- **אורך טקסט עמוד: עד 2,000,000 יחידות UTF-16** (`MAX_PAGE_TEXT_CHARS` ב-`src/lib/ocr/localResultValidate.js`, נמדד ב-`String.length`; בדיוק 2,000,000 מתקבל). זה אותו גבול ואותה יחידה שהשירות אוכף **מגרסה 1.0.141** (commit `247aed3` בריפו השירות): `ResultValidator.MaxPageTextUnits = 2_000_000` ב-`Validation/Validators.cs` (`.NET string.Length`, אותה ספירה כמו `String.length`), ו-`result.schema.json` מתעד אותה ב-`$comment` של `pages[].text` (בלי `maxLength`, שסופר נקודות קוד ולא יחידות UTF-16).
- **עמוד חורג מהשירות מגיע כשגיאת עמוד, לא כ-422:** `ResultFinalizer.Load` בשירות (`Execution/ResultFinalizer.cs`) הופך כל עמוד מעל הגבול, לפני האימות וההקפאה, לעמוד **בלי `text`** עם ה-`metadata` שלו ו-`error {code: "page_text_too_long"}`, שומר את שאר העמודים, וממיר `success` ל-`partial`. האתר מקבל אותו ככל שגיאת עמוד: העמוד לא נכתב, נרשם ב-`pageErrors` עם הקוד, וה-ack הוא `accepted` עם ה-`outcome` שנשלח (`partial` שבו אף עמוד לא נקלט נסגר באתר כ-`failed`/`no_pages_succeeded`, וה-ack נשאר `partial`). קודי שגיאת העמוד שהשירות שולח: `layout_failed`, `not_processed` (bridge, עם `text: ""`) ו-`page_text_too_long`; האתר אינו מסנן לפי קוד ומציג אותו כפי שהוא.
- **חריגה שבכל זאת מגיעה** (קובץ שהוקפא בגרסת שירות קודמת ל-1.0.141 — `DeliverySender` אינו מאמת מחדש קובץ שכבר הוקפא) דוחה את **כל** התוצאה: `422 validation_failed` עם `page <idx> text too long` ב-`details` (עד 5 שגיאות ראשונות), ולא נכתב אף עמוד. השירות מסווג 422 כקבוע ומחנה את העבודה (`needs_attention`) למפעיל.
- **null בשדות אופציונליים** (`metadata`, `pages[].metadata`, `pages[].layout`, `pages[].warnings`, `error`, `pages[].text` כשיש `error`): לפי HANDOVER סעיף 3.1 פריט 11 ו-`pipeline-contract.md`, תוצאה של השירות **אינה מכילה** חבר אופציונלי שערכו `null` — הוא מושמט. השירות עצמו עדיין סובל `null` כזה בקובץ של ה-handler ומשמיט אותו בהקפאה (קובץ ה-outbox נכתב מחדש מהמסמך המאומת), כך שרק הקובץ המוקפא נשלח לאתר. האתר מקבל `null` כזה כאילו חסר (הקלה מכוונת, עקרון Postel; קבלתו אינה כותבת עמוד שגוי). ערכים **בתוך** `metadata` (של הספר או של עמוד) עשויים להיות `null` גם בשירות הנוכחי (למשל `gpu.name`) — האתר אינו בודק את תוכן ה-`metadata` כלל. כך גם `pages[].pageId` — שדה שאינו בסכמה ובשירות כלל; האתר בודק אותו רק אם נשלח כמחרוזת, וכותב תמיד לעמוד לפי ה-`pageMap` של העבודה. אין להקשיח בלי תיאום עם השירות.
- **`error.code` ריק ברמת התוצאה ב-`partial`/`cancelled`:** האתר דורש `code` לא ריק רק ב-`failed` (ובכל `error` ברמת עמוד); ב-`partial`/`cancelled` אובייקט `error` עם `code` ריק מתקבל. לפי HANDOVER סעיף 3.1 פריט 11 לכל `error` בתוצאה יש `code` לא ריק בכל `outcome`, והשירות (`top-level error without code` ב-`Validators.cs`) מסרב להקפיא תוצאה שמפרה זאת מגרסה 1.0.138 (commit `adb0c97`, recheck N05; לפני כן הכלל חל רק ב-`failed`) — אבל קובץ שהוקפא בגרסה ישנה יותר (למשל 1.0.125 שהותקנה קודם על המכונה) עדיין עשוי להישלח כמו שהוא. האתר סלחני בכוונה ולא כותב דבר שגוי; לא להקשיח.
- **`Retry-After` על `/result`** (`503 apply_in_progress` — 30, `storage_unavailable` — 300, שער השבת — 3600): השירות הנוכחי (1.0.142) עוצר בעקבותיו את **כל** מסירות התוצאות, לא רק של אותה עבודה, ושומר את ההמתנה גם לאחר אתחול (מ-1.0.141; תקרה של שעה; HANDOVER סעיף 3.1 פריט 9, `DeliverySender.cs`). לכן הערכים כאן קצרים בכוונה.

### נתוני פריסה, אזהרות ונתוני עזר (שירות ≥1.0.149, גשר 2)

מקור האמת למבנה: מפרט החוזה המשותף (סעיף A — `layout` v1, `warnings`, תוספות ה-`metadata`), ובריפו השירות
`contracts/layout-v1.schema.json` ו-`contracts/result.schema.json`. פיקסצ'ר משותף (מועתק בלי עריכה):
`src/lib/ocr/fixtures/localResultLayout.result.json` + `.envelope.json`. המעטפה לא משתנה.

**השדות (כולם אופציונליים; חבר בלי ערך מושמט, ו-`null` נחשב כחסר):**
- `pages[].layout` — נתוני פריסה v1 לעמוד: שורות (תיבה, סדר קריאה, ביטחון, כתב, זרם, מילים, חלופות), מסגרות,
  ו-`toSource` — מטריצה אפינית מהמרחב המיושר (`coordSpace:"aligned"`) לפיקסלי תמונת העמוד באתר (`Page.imagePath`,
  בכיוון האחסון לפני EXIF). כל מטריצה סופית והפיכה עם `|det|` בין 0.25 ל-4 מתקבלת (לא רק זהות או סיבוב טהור).
  `layout.image.imageSha256` מועתק מה-`pageMap`. מיפוי לנקודות/מרובעים: `src/lib/ocr/ocrLayoutGeometry.js`.
  **דיוק מובטח: ±1px** במרחב תמונת המקור. pdfium מותח את הרינדור בפיקסל אחד בגדלים מסוימים, וזה לא ניתן לשחזור.
  הממשק לא יניח דיוק תת-פיקסלי (חפיפה, בדיקת פגיעה בגבול בין מילים). בעמוד שהושטח (`dewarped:true`, `geometry:"approx"`)
  התיבות הן מעטפות, ולכן ה-y שלהן מקורב עוד יותר.
- `pages[].warnings` — `[{code, message}]`, עד 20. `code` בתבנית `^[a-z0-9_]{1,64}$`; `message` עד 500 תווים, באנגלית.
  התווית בעברית נקבעת באתר לפי הקוד (`src/lib/ocr/ocrWarningLabels.js`); קוד לא מוכר מוצג כקוד חשוף.
- `pages[].metadata` — נוספו `suspectLines`, `prep`, `issueCount`, `issues`. `metadata` הספר — נוספו `bridge_version: 2`,
  `otzaria_issue_list`, `layout`, `salvage`, `service_version`.

**שום שדה חדש לא גורם ל-422.** `validateResult` לא בודק את `layout`, `warnings` או את תוכן ה-`metadata` (רק ש-`metadata` הוא
אובייקט, כמו תמיד). הנרמול נעשה לכל עמוד בנפרד בזמן ההחלה (`src/lib/ocr/localResultLayout.pure.js`): layout פגום, גדול מדי,
בגרסה לא נתמכת או של תמונה אחרת מושמט **רק מאותו עמוד**, עם אזהרה שנשמרת. הטקסט נקלט כרגיל. אין קודי HTTP חדשים
ואין שינוי בתשובות `/api/worker/v1`. תוצאה בלי `layout` (שירות ישן) מתקבלת בדיוק כמו קודם.

**גבולות באתר:**

| גבול | ערך | בחריגה |
|---|---|---|
| layout לעמוד (UTF-8 של `JSON.stringify`) | 1,179,648 (1.125MiB) | `layoutStatus:"too_large"`, אזהרה `layout_too_large`, נשמר בלי ה-layout |
| `pages[].metadata` | 65,536 | `metadataJson:null` + `metadata_too_large` |
| `metadata` הספר | 524,288 | נשמרת תת-קבוצה (`hardware, models, gpu, seconds, run_seconds, resumed, bridge_version, service_version, otzaria_issues, layout, salvage`) + `resultMetadataTruncated:true` |
| מגבלות המבנה של v1 (≤5000 שורות, ≤2000 מילים לשורה, ≤1000 מסגרות וכו') | — | `layoutStatus:"invalid"` + `layout_invalid` לאותו עמוד בלבד |
| התוצאה כולה | 100MiB (ללא שינוי) | 413 (ללא שינוי) |

הגשר מגביל layout לעמוד ל-1MiB (הסרת חלופות ואז השמטה) ואת התוצאה ל-96MiB; השירות משמיט layouts מהגדול לקטן כדי לעמוד
ב-100MiB. בכל המקרים העמוד מגיע עם אזהרה מתאימה (`layout_alts_trimmed`, `layout_too_large`, `layout_dropped_result_size`,
`layout_geometry_unknown`, `layout_build_failed`, `layout_invalid_shape`), והאתר שומר אותה. בנוסף, השירות מסיר מעמוד
`warnings` או `metadata` פגומים (לא מערך/אובייקט, פריט בלי `code`/`message` מחרוזת, ערך שאי אפשר לכתוב) ומוסיף לו
`warnings_invalid_shape` / `metadata_invalid_shape`; הטקסט וה-layout של העמוד נשמרים. כל קוד שתואם `^[a-z0-9_]{1,64}$` נשמר
(אין רשימה סגורה), וקוד שאין לו תווית מוצג כ"אזהרה שאינה מוכרת לאתר (<code>)" (`src/lib/ocr/ocrWarningLabels.js`).
כשהשירות משמיט layouts, הוא גם מחשב מחדש את סיכום הגשר `metadata.layout` (`pages`/`trimmed`/`dropped`/`bytes`) לפי מה
שנשלח בפועל (`ResultFinalizer.LayoutSummary`). מקור האמת לספירה באתר הוא בכל זאת `layoutSummary` של הקליטה, ולא הסיכום הזה.

**אזהרות שהאתר מוסיף** (`source:"site"`): `layout_invalid`, `layout_version_unsupported`, `layout_image_mismatch`,
`layout_too_large`, `metadata_too_large`.

**מה השירות שולח בכל מקרה:**

| מקרה | לפני | מעכשיו |
|---|---|---|
| ריצה רגילה הסתיימה | success/partial/failed | אותו דבר, ועוד `layout`, `warnings` ותוספות ה-metadata |
| ביטול אחרי ש-`result.json` תקין כבר נכתב | `cancelled`, `pages: []` | `cancelled` עם כל העמודים של אותו result |
| ביטול באמצע ריצה, יש checkpoint, ההצלה הצליחה | `cancelled`, `pages: []` | `cancelled` עם כל עמודי ה-pageMap (שלא זוהו: `error {code:"not_processed"}`), `metadata.salvage` |
| ביטול בזמן `queued` / `paused_runner` / `needs_attention` | `cancelled`, `pages: []` | ללא שינוי |
| מיצוי ניסיונות, ההצלה החזירה ≥1 עמוד | `failed`, `pages: []` | `partial` עם כל עמודי ה-pageMap ו-`error` עליון `{code:<הקוד המקורי>, message:"failed after N attempts: …; M pages salvaged from the checkpoint"}` |
| ההצלה נכשלה / כבויה / אין checkpoint | — | כמו קודם |
| עמוד מעל 2M יחידות UTF-16 | `page_text_too_long` | אותו דבר, וה-`layout` וה-`warnings` של העמוד נשמרים |

**מה האתר שומר** (אוסף `OcrPageResult`, רשומה לכל עבודה ועמוד, לצמיתות): לכל עמוד שיש לו טקסט (בלי `error`), `layout`
או `metadata` — `layoutStatus` (`ok`/`absent`/`invalid`/`unsupported_version`/`too_large`), ה-layout כמות שהוא (`ok`),
או ה-JSON שנדחה לבירור (`invalid`/`unsupported_version`, עד 1.125MiB), `metadataJson`, האזהרות (`source` worker/site),
`imageSha256` מה-`pageMap`, `textSha256`, `pipelineVersion` ו-`outcome`. הרשומה נכתבת פעם אחת (upsert, `$setOnInsert`)
**לפני** כתיבת העמוד או ההתנגשות שלו, גם ב-`failed` וגם בביטול. ב-`OcrJob`: `resultMetadataJson`, `resultMetadataTruncated`,
`resultError` (ה-`error` העליון בכל outcome), `layoutSummary {ok, absent, dropped}` ו-`pageErrors[].code`.
הרשומה "הנוכחית" של עמוד היא זו שה-job וה-`resultSha256` שלה שווים ל-`Page.lastOcrJobId`/`lastOcrResultSha256`
(נכתבים יחד עם הטקסט — גם באימוץ התנגשות, ולכן אימוץ הופך את ה-layout שלה לנוכחי).

**ביטול עם עמודים:** תוצאה שמגיעה לעבודה שבוטלה באתר (בכל outcome), או `outcome:"cancelled"` מהעובד, **לא כותבת אף עמוד**.
ה-ack נשאר כמו קודם (`cancelled` לעבודה שבוטלה באתר; `accepted` עם `outcome:"cancelled"` לביטול מצד העובד). כל עמוד
עם טקסט לא ריק (בלי `error`) נשמר כ-`OcrConflict` עם `reason:"job_cancelled"` (ממתין לאימוץ או דחייה במסך ההתנגשויות),
ולכל עמוד שעומד בתנאי נשמרת רשומת `OcrPageResult`. עמוד שנמחק מהספר מדולג. שליחה חוזרת לא יוצרת כפילויות. השלמה מהקובץ
השמור (`resumeStalledApply`) לעבודה מבוטלת מצילה ממנו את העמודים; אם הקובץ חסר או פגום — ack בלבד (הביטול גובר).

**`partial` אחרי מיצוי ניסיונות:** מוחל כרגיל (העמודים שזוהו נכתבים), ה-`error` העליון נשמר ב-`OcrJob.resultError`,
והסטטוס `completed` (או `failed`/`no_pages_succeeded` כשאף עמוד לא נקלט, כמו תמיד).

## קודים שהאתר הוסיף או שינה ביחס לטבלת HANDOVER

| קוד | נתיב | סיבה |
|---|---|---|
| `403 worker_api_disabled` | כל הנתיבים | סוד חסר או חלש, או `OCR_WORKER_ID` לא תקין, בשרת. התוכנית המקורית הציעה 503; נבחר 403 כי השירות מסווג 401/403 כבעיית תצורה (מתריע למפעיל), ואילו 503 היה נבלע כתקלה זמנית בלי התראה. בלי `Retry-After`. |
| `401 unauthorized` | כל הנתיבים | Bearer חסר או שגוי. |
| `404 input_unavailable` | `/input` | הקובץ נמחק (ניקוי) או אבד. קבוע אצל השירות → `needs_attention`. |
| `409 input_corrupt` | `/input` | גודל הקובץ בדיסק שונה מהרשום. קבוע → `needs_attention`. |
| `503 storage_unavailable` | `/input`, `/result` | שורש האחסון חסר (דיסק לא מחובר). זמני, עם `Retry-After: 300`. |
| `410 job_closed` | `/result` | תוצאה לעבודה סגורה שלא בוטלה במפורש ואין לה תוצאה נעולה. נשמרת ב-`resultRejections` (עד 20 דחיות לעבודה; מעבר לכך אותה תשובה בלי שמירת הקובץ). |
| `408 upload_incomplete` | `/result` | ההעלאה נקטעה. זמני אצל השירות → שליחה חוזרת. |
| `403 wrong_worker` | `/status` | `workerId` בגוף שונה מהמוגדר. |
| `503 shabbat` | כל הנתיבים | שער השבת (`src/proxy.js`) בשבת ויו"ט, עם `Retry-After: 3600`. ראו OPERATIONS סעיף 6. |

## סיווג אצל השירות (HANDOVER סעיף 3 ו-3.1 פריט 9; `Site/ErrorClassifier.cs`, גרסה 1.0.142)

- **401/403 או גוף HTML (גם ב-2xx או ב-4xx)** → בעיית תצורה/אימות (התראה `site_auth`): כלום לא נמחק.
  סבב הדיווחים נעצר (אותו סוד לכל העבודות), והמסירות מוחזקות (`delivery_auth`, ניסיון כל 15 דקות או מיד כשקובץ
  הסוד משתנה).
- **3xx** (השירות לא עוקב אחרי הפניות) → `ProtocolViolation` ב-`ErrorClassifier`, **בלי** התראת `site_auth`. ההשלכה
  לפי נתיב: `POST /result` — המסירות מוחזקות כמו ב-401/403 (`delivery_auth`); `GET /input` — ההורדה נדחית
  ומנוסה שוב; `POST /status` — `status_rejected` בלבד, והסבב ממשיך; `GET /jobs` — נספר לחוסר מענה
  (`site_unreachable` אחרי 5 דקות); `GET /jobs/{id}` — התראה `sync_item_<jobId>` ואירוע `site_protocol_violation`, בלי מסקנה על העבודה.
- **408/429/5xx/רשת** → זמני: למסירה, backoff של 10/30/60/300/900 שניות עם jitter, בלי הגבלת ניסיונות.
- **שאר 4xx** → דחייה, וההשלכה תלויה בנתיב:
  - `POST /result` → העבודה מוחנית ב-`needs_attention` (`delivery_rejected`; ב-409 `result_conflict`), והקובץ
    נשמר אצל השירות.
  - `GET /input` → `needs_attention` (`input_unavailable`).
  - `POST /status` → העבודה **לא** נעצרת: אירוע `status_rejected` בלבד (ראו "דיווח מצב").
  - `GET /jobs/{id}` → ב-404 אירוע `site_missing` והעבודה נשמרת אצל השירות; 4xx אחר נחשב כשל, ואחרי 3 כשלים
    רצופים עולה התראה `sync_get_<jobId>`.
  - `GET /jobs` → 4xx לא צפוי נספר לחוסר מענה, ואחרי 5 דקות עולה התראה `site_unreachable`.
- תשובה שאינה ack תקין (שדה חסר, `outcome` שונה מזה שנשלח) → `invalid_ack`, העבודה לא נסגרת.

### `Retry-After`

השירות מפענח שניות שלמות או תאריך HTTP, וחותך כל ערך לשעה לכל היותר (`ErrorClassifier.MaxRetryAfter`). האתר
שולח תמיד מספר שניות שלם. **ההיקף של ההמתנה שונה לפי הנתיב:**

| נתיב | מה נעצר |
|---|---|
| `POST /status` | סבב הדיווחים מסתיים, ואף דיווח (של אף עבודה) לא נשלח עד שההמתנה עוברת. בסבב הבא העבודה שעוררה את ההמתנה מדווחת אחרונה. ההמתנה נשמרת בזיכרון בלבד. |
| `POST /result` (429/503) | סבב המסירה מסתיים, ו**כל** המסירות (לא רק של העבודה הזו) מוחזקות עד שההמתנה עוברת. ההמתנה נשמרת בהגדרות השירות ושורדת הפעלה מחדש (בטעינה היא נחתכת לשעה מהרגע), ו-`retry-delivery` אינו עוקף אותה. |
| `GET /input` | רק ההורדה של אותה עבודה נדחית. ההורדה של העבודה הבאה בתור יכולה להתחיל מיד. |
| `GET /jobs`, `GET /jobs/{id}` | קריאת הרשימה הבאה נדחית. בבדיקת עבודות שנעלמו מהרשימה, הסבב נעצר. |

הערכים שהאתר שולח:

| תשובה | נתיבים | `Retry-After` | השלכה אצל השירות |
|---|---|---|---|
| `503 apply_in_progress` | `/result` | 30 | כל המסירות מחכות 30 שניות. |
| `503 storage_unavailable` | `/input`, `/result` | 300 | ב-`/result` כל המסירות מחכות 5 דקות. ב-`/input` רק אותה עבודה מחכה. |
| `503 shabbat` | כל הנתיבים | 3600 | שווה לתקרה של השירות. ראו OPERATIONS סעיף 6. |

שום נתיב אחר בקוד האתר לא שולח `Retry-After` ולא מחזיר 429, ו-4xx לעולם לא נשלח עם `Retry-After`.

## זמני תגובה

- בקרה (`/jobs`, `/jobs/{id}`, `/status`): פחות מ-30 שניות. השאילתות מאונדקסות, ועמוד של 100 עבודות
  כפול 2000 עמודים נכנס ב-64MiB.
- `/result`: התשובה עשויה לקחת עד 10 דקות (החלה על עד 2000 עמודים; `maxDuration = 600`). השירות
  ממתין עד `Site:TransferTimeoutMinutes` (10). nginx חייב לאפשר זאת (OPERATIONS סעיף 3).
- `/input`: זרימה מהדיסק, בלי טעינה לזיכרון. השירות מפיל העברה בלי בייטים 60 שניות.

## בדיקות

- `src/app/api/worker/v1/e2e.test.js` — E2E דרך הראוטים: יצירה, רשימה, קלט, דיווחים, תוצאה, שליחה חוזרת
  בלי כתיבה כפולה, ביטול, התנגשות עם עריכה אנושית וקריסה באמצע החלה.
- טסטי ראוט לכל נתיב (`src/app/api/worker/v1/**/route.test.js`) וטסטי הלוגיקה ב-`src/lib/ocr/*.test.mjs`
  (כולל קריסה בכל גבול של סדר הקליטה ב-`localApply.crash.int.test.mjs`).
- `scripts/ocr-local-fake-worker.mjs` — לקוח HTTP אמיתי מול שרת רץ (OPERATIONS סעיף 8).
