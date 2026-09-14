# חוזה מערכת תיקוני הטקסט — מקור אמת יחיד

גרסת חוזה: **corrections-contract v1** (תאריך: 2026-09-15)

מסמך זה מגדיר את שלושת החוזים של מערכת הדיווח/בדיקה/אישור של תיקוני טקסט:

| # | חוזה | צד שולח | צד מקבל | סעיף |
|---|------|---------|---------|------|
| A | קליטת דיווח | תוכנת אוצריא (Flutter) | האתר (`POST /api/reportingerrors`) | §2 |
| B | בקשת בדיקה | האתר (worker) | שירות הבדיקה החיצוני (קוד סגור, עתידי) | §3 |
| C | digest קנוני | שני הצדדים | — | §4 |

עותק של ה-fixtures לחישוב ה-digest נמצא גם בריפו התוכנה
(`test/fixtures/text_corrections/digest_fixtures.json`) — **חובה שיהיה זהה בייט-לבייט**
לקובץ `docs/text-corrections/fixtures/digest_fixtures.json` כאן. שינוי בחוזה = שינוי בשני
העותקים באותו commit-pair.

עקרונות שאינם ניתנים לשינוי:

1. **null ≠ מחרוזת ריקה.** `proposed_text: null` = לא הוצע תיקון. `proposed_text: ""` = הצעת מחיקה.
2. **שדות מדויקים לא עוברים נרמול** (לא trim, לא הסרת HTML, לא NFC, לא חיתוך). אלה השדות
   `original_line`, `original_selection`, `proposed_text`, `context_before`, `context_after`,
   `new_line`. חיתוך מותר רק ב-**דחייה** של הבקשה (413/400), לעולם לא בשקט.
3. **offsets** נספרים ביחידות **UTF-16 code units** (`unit: "utf16_code_units"`) בתוך
   `original_line`. offset לבדו לעולם אינו מספיק לאיתור — הטקסט המדויק + ההקשר הם המקור.
4. **`approved` אינו בוליאני.** ניתוב פרסום דורש `decision=approved` **וגם**
   `approval_scope=technical_and_content` **וגם** מדיניות אתר שמתירה זאת (§3.5).
5. `reason_code` הוא קוד יציב למכונה; `message` הוא לבני אדם. **אסור לנתב לפי `message`.**
6. 202/pending אינו אישור. תקלה/timeout/תשובה פגומה אינם `rejected` ואינם אישור.

---

## 1. מודל הנתונים המשותף

### 1.1 מיקום המקור (מה התוכנה יודעת)

ב-DB של התוכנה (`seforim.db`):

- `line.content` = **השורה הגולמית בקובץ המקור, בייט-לבייט** (כולל HTML), למעט:
  ‎`\r\n` → נחתך ל-`\n` בזמן הבנייה (`String.lines()`), וספרים עם קובץ הערות נלווה
  ("הערות על <שם הספר>") שבהם הערות שולבו לשורה. `line.lineIndex` = אינדקס השורה
  בקובץ, **0-based**, כולל שורות ריקות/כותרות ריקות שדולגו (האינדקס ממשיך להיספר).
- `book.sourceId → source.name` = תיקיית המקור במאגר `otzaria-library`
  (`ToratEmetToOtzaria`, `DictaToOtzaria`, `sefariaToOtzaria`, `MoreBooks`, ...).
  **`Sefaria` (source 1) אין לו קובץ מקומי** (נבנה מה-API) → תמיד טיפול ידני.
- נתיב הספר שהתוכנה מציגה: `אוצריא/<קטגוריה>/.../<שם>.txt` (`BookDetailsService`). זהו
  **נתיב יחסי לשורש הספרים**, לא נתיב Git.
- `schema_meta.db_version` = **מזהה בניית הספרייה** (`library_build_id`).

מיפוי לנתיב Git במאגר `Otzaria/otzaria-library` (ראו `CLAUDE.md` שם — `BOOK_ROOTS`):

```
<source_folder>/ספרים/אוצריא/<rest>                      (רוב המקורות)
DictaToOtzaria/ערוך/ספרים/אוצריא/<rest>                  (DictaToOtzaria)
sefariaToOtzaria/sefaria_export/ספרים/אוצריא/<rest>      (sefariaToOtzaria — שני שורשים!)
sefariaToOtzaria/sefaria_api/ספרים/אוצריא/<rest>
```
כאשר `<rest>` = `file_path` בלי הקידומת `אוצריא/`. שורש מאוחר יותר ברשימה דורס
מוקדם יותר באריזה — לכן **קיום הקובץ בנתיב המשוער חייב להיבדק מול הריפו**, ואם
הקובץ קיים ביותר משורש אחד → `source_ambiguous` → ידני. המיפוי הזה הוא **רמז** בלבד
(§1.2 של ה-resolver באתר), לעולם לא אמת.

### 1.2 מילון ההחלטות (משותף לשירות, לאתר ולממשק)

| `decision` | משמעות |
|---|---|
| `approved` | השינוי אושר ברמה שב-`approval_scope` |
| `rejected` | דחייה **מהותית** של התוכן (לא כשל טכני) |
| `needs_review` | נדרשת הכרעה אנושית |
| `conflict` | המקור השתנה / התנגשות עם שינוי אחר |
| `already_fixed` | השינוי כבר קיים במקור (**האתר מאמת מקומית לפני סגירה**) |

| `approval_scope` | משמעות |
|---|---|
| `technical_only` | המקור אותר והשינוי ישים טכנית. **אינו** אישור נכונות. → מתנדב |
| `technical_and_content` | גם נכונות התוכן אושרה. → פרסום אוטומטי **רק** אם המדיניות מתירה |

`processing_status`: `completed` \| `pending` \| `failed`.

`reason_code` — קודים מוסכמים (השירות רשאי להוסיף קודים בקידומת `svc_`; קוד לא מוכר
מנותב כ-`needs_review`):

```
ok                       source_not_found         source_ambiguous
selection_not_found      selection_ambiguous      source_changed
proposal_identical       proposal_invalid         content_doubtful
content_wrong            structural_change        out_of_scope
service_capacity         unsupported_capability   manual_required
```

### 1.3 סוגי דיווח

| `report_kind` | תיאור |
|---|---|
| `free_text` | דיווח חופשי (גם בלי טקסט מסומן, בלי מקור מדויק). זהו גם הסוג המשתמע של לקוחות ישנים. |
| `text_correction` | הצעת תיקון מובנית: שורה מקורית + בחירה + הצעה. |

---

## 2. חוזה A — תוכנה → אתר: `POST https://otzaria.org/api/reportingerrors`

### 2.1 תאימות לאחור (חובה)

- הנתיב, `Content-Type: application/json`, ו-**HTTP 200 להצלחה** נשארים כפי שהם.
- לקוח ישן שולח בדיוק את השדות של `DirectErrorReport.toApiPayload()` הקיים
  (`report_id, sender_email, subject, book_title, current_ref, line_number, selected_text,
  error_details, context_text, file_path, source_folder, library_version, created_at`).
  לקוח כזה = `schema_version` חסר = **1** = `report_kind: free_text`. **שום שדה חסר לא
  מומצא.**
- `line_number` הישן הוא `lineIndex + 1`? **לא מובטח.** בלקוח ישן הוא נשמר כפי שהוא
  ומשמש רק לתצוגה. לקוח חדש שולח גם `location.line_index` (0-based מ-DB) — זה השדה
  המחייב לאיתור.
- ה-**מייל הוא התראה בלבד**: השרת מחזיר 200 עם `success:true` גם כש-SMTP חסר/נכשל,
  ומציין `email_sent:false`. (שינוי מההתנהגות הישנה שהחזירה 500 — לקוח ישן שרואה 200
  מסיר מהתור, וזה נכון: הדיווח נשמר.)
- לקוח ישן ממשיך לקבל `duplicate:true` כאשר תוכן זהה כבר נשלח לנמעני המייל.

### 2.2 גוף הבקשה — `schema_version: 2`

```jsonc
{
  "schema_version": 2,
  "report_id": "1757890000000000-abc123",        // client_report_id יציב (UUID/timestamp+hash), נוצר בתוכנה
  "report_kind": "text_correction",              // או "free_text"
  "content_digest": "<sha256 hex>",              // §4.2 — השרת מחשב מחדש ומשווה

  // ---- השדות הישנים (נשארים, לתאימות ולמייל) ----
  "sender_email": "user@example.com",            // כפי שהיום (לא חובה; ריק → unknown)
  "subject": "דיווח על טעות: בראשית",
  "book_title": "בראשית",
  "current_ref": "בראשית א",
  "line_number": 3,
  "selected_text": "בראשית ברא",                 // צילום תצוגה: מה שהמשתמש ראה (מנוקה מ-HTML) — לא מקור
  "error_details": "חסר ניקוד",                  // הסבר המשתמש (חופשי)
  "context_text": "(א) בראשית ברא אלהים את",     // הקשר לתצוגה (מנוקה)
  "file_path": "אוצריא/תנך/תורה/בראשית.txt",
  "source_folder": "ToratEmetToOtzaria",
  "library_version": "27",
  "created_at": "2026-09-15T10:00:00.000Z",

  // ---- חדש ----
  "location": {
    "line_index": 2,                             // 0-based, מ-line.lineIndex. null אם לא ידוע
    "book_id": 1,                                // book.id ב-DB — משמעותי רק יחד עם library_build_id
    "library_build_id": "27",                    // schema_meta.db_version; null אם לא נקרא
    "he_ref": "בראשית א"                          // line.heRef אם קיים
  },
  "source_hint": {
    "source_folder": "ToratEmetToOtzaria",
    "library_relative_path": "אוצריא/תנך/תורה/בראשית.txt",
    "repo_path": null                            // רק אם ידוע בוודאות; בדרך כלל null
  },
  "client": { "app_version": "0.9.98", "platform": "windows" },

  // רק ב-text_correction:
  "correction": {
    "original_line": "(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים",   // line.content הגולמי, בלתי משתנה
    "original_selection": "אֱלֹהִ֑ים",            // תת-מחרוזת מדויקת של original_line; null = כל השורה
    "selection_offset": { "unit": "utf16_code_units", "start": 30, "end": 39 }, // בתוך original_line; null אם original_selection=null
    "proposed_text": "אֱלֹקִ֑ים",                 // null = לא הוצע; "" = מחיקת הבחירה
    "context_before": "(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א ",  // original_line[0:start] (מדויק)
    "context_after": ""                          // original_line[end:] (מדויק)
  }
}
```

כללי ולידציה בשרת (400 = לקוח חדש בלבד; לקוח ישן לא שולח את השדות):

- `schema_version` ∈ {חסר, 1, 2}. אחרת → `400 unsupported_schema_version`.
- ב-`text_correction`: `original_line` חובה; אם `original_selection` אינו null אז
  `selection_offset` חובה ו-`original_line.substring(start,end) === original_selection`
  ו-`context_before + original_selection + context_after === original_line`. אחרת 400.
- `proposed_text` שווה ל-`original_selection` (או ל-`original_line` כשהבחירה null) →
  `400 proposal_identical` (הצעה ריקה ממשמעות — התוכנה גם חוסמת זאת לפני שליחה).
- תקרות: `original_line` ≤ 20,000 code units, `proposed_text` ≤ 20,000, גוף ≤ 256KB.
  חריגה → 413/400, **לא חיתוך**.
- `content_digest` אם נשלח: השרת מחשב לפי §4.2; אי-התאמה → `400 digest_mismatch`.

### 2.3 תשובות

| מצב | HTTP | גוף |
|---|---|---|
| נקלט (חדש) | 200 | `{"success":true,"accepted":true,"reportId":"…","savedToDatabase":true,"correction_supported":true,"email_sent":bool,"duplicate":bool,"message":"הדיווח נקלט"}` |
| אותו `report_id` + אותו `content_digest` | 200 | כנ"ל + `"idempotent_replay":true` (אין רשומה כפולה) |
| אותו `report_id` + digest שונה | 409 | `{"success":false,"error":"report_id_conflict","reportId":"…"}` |
| JSON פגום / ולידציה | 400 | `{"success":false,"error":"<reason_code>","reportId":null}` |
| גוף גדול | 413 | `{"success":false,"error":"body_too_large"}` |
| rate limit | 429 | `{"success":false,"error":"Too many requests"}` |
| כשל DB | 500 | `{"success":false,"savedToDatabase":false,...}` (**לא** מוצג כהצלחה) |

`message` בתשובה מנוסח כ-"נקלט", לעולם לא "אושר".

### 2.4 התנהגות התוכנה מול התשובה

- 200 → "הדיווח נקלט". אם חסר `correction_supported:true` בתשובה ל-`text_correction`
  (אתר ישן): ההצעה **לא אובדת** — ה-payload נשמר בהיסטוריית הנשלחים עם דגל
  `serverAcceptedCorrection=false`, והמשתמש מקבל הודעה ברורה שהאתר אינו תומך עדיין
  בתיקון מובנה (ההצעה נכללה ב-`error_details` כטקסט — ראו 2.5 — ולכן הגיעה כטקסט חופשי).
- 409 → כשל **קבוע** (לא לתור). 400/413/422 → קבוע. 408/429/5xx/timeout/רשת → זמני (תור).
- שדות חדשים חייבים לעבור **בכל המסלולים**: תור אופליין (Hive), גיבוי/שחזור, ייצוא
  סקריפט שליחה (bat/sh), ייבוא.

### 2.5 fallback לאתר ישן (חובה בלקוח החדש)

לקוח חדש תמיד ממלא גם את `error_details` כך שיכיל בסופו בלוק טקסטואלי קריא:

```
--- הצעת תיקון ---
מקור: <original_selection או original_line>
מוצע: <proposed_text | "(מחיקה)" | "(ללא הצעה)">
```
כך אתר ישן (שמתעלם מ-`correction`) עדיין מקבל את ההצעה במייל. האתר החדש מציג את
`correction` המובנה ואינו תלוי בבלוק הזה.

---

## 3. חוזה B — אתר → שירות הבדיקה החיצוני

השירות הוא **קוד סגור עתידי**. כאן מוגדר רק הממשק. סודות וכתובת: **בצד השרת של האתר
בלבד** (`CORRECTIONS_VERIFY_URL`, `CORRECTIONS_VERIFY_SECRET`). הדפדפן והתוכנה לעולם
לא פונים אליו.

### 3.1 בקשה — `POST {CORRECTIONS_VERIFY_URL}/v1/verify`

כותרות: `Authorization: Bearer <secret>`, `Content-Type: application/json`,
`X-Request-Id: <request_id>`, `X-Api-Version: 1`.

```jsonc
{
  "api_version": "1",
  "request_id": "req_…",                 // יציב לכל *פעולת בדיקה*; זהה בניסיון חוזר; חדש כשההצעה/הפעולה משתנות
  "report_id": "<מזהה הדיווח באתר>",
  "client_report_id": "<report_id של התוכנה>",
  "proposal_revision": 1,                // גרסת ההצעה שנבדקת
  "workflow_generation": 3,              // fencing: תשובה עם generation ישן נשמרת לתיעוד בלבד
  "requested_review_scope": "technical_only" | "technical_and_content",
  "report": {
    "kind": "text_correction",
    "book_title": "…", "current_ref": "…", "he_ref": "…",
    "source_folder": "…", "library_build_id": "27",
    "user_explanation": "…",             // error_details
    "display_text": "…"                  // selected_text (צילום תצוגה)
  },
  "proposal": {
    "original_line": "…", "original_selection": "…" | null,
    "selection_offset": {…} | null, "proposed_text": "…" | "" | null,
    "context_before": "…", "context_after": "…"
  },
  "source": {                            // null אם ה-resolver באתר לא איתר מקור
    "repo": "Otzaria/otzaria-library", "ref": "main",
    "commit_sha": "<40 hex>", "path": "ToratEmetToOtzaria/ספרים/אוצריא/…txt",
    "blob_sha": "<40 hex>", "line_index": 2,
    "current_line": "…",                 // השורה כפי שהיא כעת במקור
    "match": "exact" | "unique_normalized" | "none" | "ambiguous"
  },
  "change": { "change_id": "chg_…", "change_digest": "<sha256>" } | null   // אם כבר נבנתה חבילה
}
```

### 3.2 תשובה מיידית — 200

```jsonc
{
  "api_version": "1",
  "request_id": "req_…",                 // חובה, זהה לבקשה
  "report_id": "…", "proposal_revision": 1, "workflow_generation": 3,
  "decision_id": "dec_…",                // ייחודי לכל החלטה
  "processing_status": "completed",
  "decision": "approved",
  "approval_scope": "technical_only",    // חובה כש-decision=approved; אחרת null
  "reason_code": "ok",
  "message": "הסבר לבני אדם",
  "change": {                            // חובה כש-decision=approved או already_fixed; אחרת null
    "change_id": "chg_…",
    "change_digest": "<sha256 לפי §4.1>",
    "target": { "repo": "Otzaria/otzaria-library", "path": "…", "line_index": 2 },
    "base": { "commit_sha": "<40 hex>", "blob_sha": "<40 hex>" },   // בסיס המקור שנבדק
    "original_line": "…", "new_line": "…"
  },
  "candidates": [ { "path": "…", "line_index": 5, "line": "…" } ],   // אופציונלי, ב-needs_review/source_ambiguous
  "retry_after_seconds": null
}
```

### 3.3 תשובה אסינכרונית — 202

```jsonc
{ "api_version":"1", "request_id":"req_…", "processing_status":"pending",
  "job_id":"job_…", "poll_after_seconds": 30 }
```
האתר מבצע polling ב-`GET {CORRECTIONS_VERIFY_URL}/v1/verify/{job_id}` (אותה כתובת
בסיס מההגדרה — **לעולם לא כתובת שהוחזרה בתשובה**), עם תקרת זמן כוללת
(`CORRECTIONS_VERIFY_MAX_TOTAL_SECONDS`). מיצוי → ידני. 202 אינו אישור.

### 3.4 אימות התשובה באתר (כל סעיף = חובה, כשל = **ידני**, לא retry)

1. JSON תקין, `api_version` נתמך.
2. `request_id`, `report_id`, `proposal_revision` תואמים לבקשה. אחרת `response_mismatch`.
3. `workflow_generation` שווה ל-generation הנוכחי של הדיווח. ישן → נשמר ב-`history`
   בלבד, **לא מקדם מצב**.
4. `decision` ∈ המילון; `approved` ⇒ `approval_scope` ∈ {`technical_only`,
   `technical_and_content`} ו-`change` קיים ו-`change_digest` שווה לחישוב מקומי לפי §4.1
   על `change` שהוחזר. אי-התאמה → `invalid_response` → ידני.
5. `change.new_line` ≠ הצעה שנשלחה? → נוצרת **הצעה חדשה (revision+1)** מאת השירות;
   האישור מתייחס אליה, לא להצעת המשתמש; ניתוב: ידני (אלא אם המדיניות מתירה
   ואז נדרש סבב אימות מלא על הגרסה החדשה — ברירת המחדל: ידני).
6. `approval_scope=technical_and_content` כאשר `CORRECTIONS_VERIFY_AUTHORITY`
   באתר הוא `technical_only` → **מדורג ל-technical_only** ונרשם `authority_exceeded`.
7. `already_fixed` → האתר מאמת מקומית ש-`new_line` הוא **בדיוק** תוכן השורה
   `line_index` בקובץ `path` ב-`base.commit_sha`/ראש הענף הנוכחי. אחרת ידני.

### 3.5 ניתוב לאחר תשובה תקינה

```
approved + technical_only                → manual queue (needs_content_review)
approved + technical_and_content         → publish  אם: authority=technical_and_content
                                             && auto_publish_enabled && requested_scope היה technical_and_content
                                             && generation תואם && אין claim ידני פעיל && אין מצב סופי
                                             && change_digest תואם && מקור אומת מחדש לפני הפרסום
                                           אחרת → manual queue
needs_review / conflict                  → manual queue (עם candidates/message)
already_fixed (אומת מקומית)              → closed_already_fixed, בלי קומיט
already_fixed (לא אומת)                  → manual queue
rejected + authority מתירה דחייה אוטומטית → closed_rejected (reason_code נשמר)
rejected אחרת                            → manual queue (manual_reject_review)
```

### 3.6 סיווג תקלות (מסווג מרכזי אחד: `classifyVerifyFailure`)

| סיווג | מקרים | פעולה |
|---|---|---|
| `transient` | timeout; ECONNRESET/ECONNREFUSED/EAI_AGAIN; HTTP 408, 429, 500, 502, 503, 504; `processing_status:"failed"` עם `reason_code:"service_capacity"` | retry עם backoff+jitter, כיבוד `Retry-After` עד התקרה |
| `permanent` | שירות כבוי/לא מוגדר/חסר סוד; HTTP 400, 401, 403, 404, 405, 410, 422; ENOTFOUND (DNS קבוע); כשל TLS; JSON פגום; שדות חובה חסרים; `decision` לא מוכר; אי-התאמת מזהים; `unsupported_capability`; api_version לא נתמך | **ידני מיד** עם `handoff_reason` |
| `unknown` | כל דבר אחר | **ידני** (לא אישור, לא retry אינסופי) |

גבולות retry: `CORRECTIONS_VERIFY_MAX_ATTEMPTS` (ברירת מחדל 6) ו-
`CORRECTIONS_VERIFY_MAX_TOTAL_SECONDS` (ברירת מחדל 86400). מיצוי → ידני
(`handoff_reason: retries_exhausted | deadline_exhausted`).

---

## 4. חוזה C — digest קנוני (OCJ-1)

### 4.1 `change_digest`

```
change_digest = sha256_hex( OCJ1( {
  "v": 1,
  "path": <נתיב Git מלא בריפו>,
  "base_blob_sha": <git blob sha של הקובץ בבסיס>,
  "line_index": <int, 0-based>,
  "original_line": <string>,
  "new_line": <string>
} ) )
```

### 4.2 `content_digest` (idempotency של דיווח)

```
content_digest = sha256_hex( OCJ1( {
  "v": 1, "report_kind", "book_title", "current_ref",
  "line_index": <int|null>, "selected_text", "error_details", "context_text",
  "source_folder", "file_path", "library_version",
  "correction": null | { "original_line", "original_selection": <string|null>,
                          "proposed_text": <string|""|null>,
                          "selection_offset": null | {"unit","start","end"} }
} ) )
```
(שדות מחרוזת שחסרים בלקוח = `""`; `line_index` חסר = `null`.)

### 4.3 OCJ-1 — סריאליזציה קנונית

- אובייקט: מפתחות ממוינים לפי **UTF-16 code units** (מיון ברירת המחדל של JS ושל
  `String.compareTo` ב-Dart). ללא רווחים.
- מחרוזת: escaping **בדיוק** כמו `JSON.stringify`/`jsonEncode`: `"`→`\"`, `\`→`\\`,
  U+0008/000C/000A/000D/0009 → `\b \f \n \r \t`, שאר < U+0020 → `\u00xx` (hex קטן),
  כל היתר (כולל עברית, ניקוד, U+00A0, U+200F, U+2028) **ליטרלי**. surrogate בודד = קלט פסול.
- מספרים: **שלמים בלבד**, עשרוני. `true/false/null`.
- מערכים: לפי הסדר.
- ה-sha256 מחושב על בתי ה-UTF-8 של המחרוזת הקנונית; פלט hex קטן.

ה-fixtures (`digest_fixtures.json`) מכילים לכל מקרה את `input`, את המחרוזת
הקנונית `canonical` ואת `sha256`. **בדיקה בכל צד חייבת לאמת את שניהם.**

---

## 5. מזהים ו-state machine (צד האתר)

### 5.1 מזהים

| מזהה | נוצר ב- | משמעות |
|---|---|---|
| `client_report_id` (= `report_id` בבקשה) | תוכנה | idempotency של קליטה |
| `report._id` | אתר | מזהה הדיווח |
| `proposal_revision` | אתר | 1 = הצעת המשתמש; +1 בכל עריכת מתנדב/שירות |
| `workflow_generation` | אתר | עולה בכל מעבר מצב שמפסיל עבודה ישנה (claim ידני, עריכה, ביטול) |
| `request_id` | אתר | פעולת בדיקה; זהה בניסיונות חוזרים של אותה פעולה |
| `change_id` + `change_digest` | אתר/שירות | חבילת שינוי בלתי משתנה |
| `decision_id` | שירות/מתנדב | כל החלטה |
| `publish_attempt_id` | אתר | כל ניסיון פרסום |

### 5.2 מצבים (מופרדים, לא enum יחיד)

```
verification.status : not_requested | queued | in_progress | completed | failed | superseded | skipped_service_disabled
approval.authority  : none | service | volunteer          approval.scope: none | technical_only | technical_and_content
manual.status       : none | queued | claimed | released  (+ handoff_reason, assignee, lease_expires_at)
publish.status      : not_ready | ready | in_progress | unknown_needs_reconcile | pr_opened | committed | failed | skipped_already_fixed
inclusion.status    : unknown | merged_to_main | included_in_release (+ release_id אם ידוע)
report.status       : open | closed_published | closed_already_fixed | closed_rejected | closed_manual
```

מעברי מצב מתבצעים **תמיד** עם תנאי גרסה (`workflow_generation` / lease fence) בעדכון
אטומי יחיד (`findOneAndUpdate` עם התנאי בשאילתה). לחיצה כפולה, worker ישן או תשובה
מאוחרת נכשלים בשקט ונרשמים ב-`history`.

### 5.3 פרסום

- ברירת מחדל: **PR מבודד** לכל תיקון (ענף `corrections/<report-id>`), `publish_mode=pr`.
  `direct` = הגדרה מפורשת + הרשאה. `disabled` = לא מפרסמים (המצב עד שיוגדר טוקן).
- יעד (ריפו/ענף) = הגדרת שרת בלבד (`CORRECTIONS_GITHUB_REPO`, `CORRECTIONS_GITHUB_BRANCH`);
  לעולם לא מהבקשה/מהשירות.
- כתיבה ישירה: read head+blob באותו בסיס → אימות `base_blob_sha` ו-`original_line`
  בשורה `line_index` → הפקת התוכן (שימור BOM/CRLF/שאר הקובץ) → blob/tree/commit עם
  parent=head שנקרא → `PATCH refs` עם `force:false` → אם 422/ענף התקדם: קריאה מחדש
  ואימות מחדש (עד N פעמים). **אסור** לשלב תוכן מבסיס ישן עם parent חדש.
- אם השורה כבר שווה ל-`new_line` → `skipped_already_fixed`, בלי קומיט.
- תוצאה לא ידועה (נפילה אחרי `PATCH refs`/יצירת PR ולפני עדכון DB) →
  `unknown_needs_reconcile`; reconciliation קורא את הענף/PR לפי `publish_attempt_id`
  בהודעת הקומיט/שם הענף לפני כל ניסיון נוסף.
- בקומיט/PR: **אין** אימייל משתמש, נתיב מקומי או מידע פרטי. הודעת קומיט:
  `תיקון: <book_title> — <current_ref>` + `Report-Id: <report._id>` +
  `Publish-Attempt: <publish_attempt_id>`.
