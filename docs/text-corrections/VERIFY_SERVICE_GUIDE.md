# מדריך למפתח שירות הבדיקה

המסמך מיועד למי שמממש את שירות הבדיקה החיצוני (קוד סגור). הוא נגזר מ-[`CONTRACT.md`](CONTRACT.md)
(חוזה B ו-§4) ואינו מוסיף עליו דרישות. במקרה של סתירה — החוזה קובע.

## 1. תפקיד השירות

האתר שולח לשירות הצעת תיקון לשורה אחת בספר, יחד עם השורה העדכנית מהמקור שהאתר איתר. השירות מחזיר
**החלטה**. האתר מאמת את התשובה, ומחליט לבד — לפי המדיניות שלו — אם לשלוח למתנדב, לסגור או לפרסם.
השירות אינו כותב לשום מקום, ואינו מקבל פרטי קשר של המשתמש.
נשלחים רק דיווחים שמייל ההתראה שלהם מגיע לתיבת אוצריא (CONTRACT §1.4) — למשל לא ספרי ספריא.

## 2. הממשק

```
POST {BASE_URL}/v1/verify
Authorization: Bearer <secret>
Content-Type: application/json
X-Request-Id: <request_id>
X-Api-Version: 1
```

- `BASE_URL` והסוד מוגדרים בשרת האתר בלבד. HTTPS עם תעודה תקפה (בייצור האתר דוחה `http://` ו-localhost).
- האתר **לא עוקב אחרי הפניות** (3xx = כשל) ולא משתמש בשום כתובת שמופיעה בתשובה.
- timeout לבקשה: 20 שניות (קבוע בקוד האתר). עבודה ארוכה יותר → 202 (סעיף 5).
- גוף תשובה מעל 1MB נדחה.

## 3. הבקשה

```jsonc
{
  "api_version": "1",
  "request_id": "req_…",            // זהה בכל ניסיון חוזר של אותה פעולה → השירות צריך להיות אידמפוטנטי לפיו
  "report_id": "…",                 // מזהה הדיווח באתר
  "client_report_id": "…",
  "proposal_revision": 1,
  "workflow_generation": 3,         // להחזיר כמו שהוא
  "requested_review_scope": "technical_only" | "technical_and_content",
  "report": { "kind", "book_title", "current_ref", "he_ref", "source_folder", "library_build_id",
              "user_explanation", "display_text" },
  "proposal": { "original_line", "original_selection", "selection_offset", "proposed_text",
                "context_before", "context_after" },
  "source": { "repo", "ref", "commit_sha", "path", "blob_sha", "line_index", "current_line", "match" },
  "change": null,
  "diff": { "format": "unified", "context_lines": 3, "unified": "…",
            "hunk": { "start_line", "line_number", "before", "removed", "added", "after", "line_ending" } } | null
}
```

חשוב:
- `proposed_text: null` = המשתמש **לא** הציע נוסח; `""` = הצעה למחוק את הבחירה. אין לבלבל.
- השדות `original_line`, `original_selection`, `proposed_text`, `context_*`, `current_line` מדויקים — כולל HTML,
  ניקוד, טעמים, רווחים, NBSP ו-RLM. אין לנרמל אותם לפני חישוב ה-digest.
- `selection_offset` ביחידות UTF-16 בתוך `original_line`.
- `display_text` הוא צילום תצוגה מהתוכנה (אחרי עיבוד) — **לא** המקור.
- `source` הוא מה שהאתר איתר (`match: "exact"` ברוב המקרים). האתר לא שולח בקשה בלי מקור שאותר, וגם לא
  כשהתיקון כבר הוחל בוודאות (הוא סוגר את הדיווח בעצמו; התנאים — CONTRACT §3).

### `diff` — השינוי עם הקשר מהקובץ

אותו diff שהמתנדב רואה באתר: שורות הקשר מלפני ומאחרי, השורה שמוסרת והשורה שנכנסת. הוא נבנה מאותו
`source.blob_sha` ומאותה שורה של `change_digest`, ולכן `hunk.removed[0] === source.current_line`.

```
--- a/ToratEmetToOtzaria/ספרים/אוצריא/…/בראשית.txt
+++ b/ToratEmetToOtzaria/ספרים/אוצריא/…/בראשית.txt
@@ -1,4 +1,4 @@
 <h1>בראשית</h1>

-(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים
+(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים
 סוף
```

- מספרי השורות 1-based (`hunk.line_number` = `source.line_index + 1`).
- שורות מדויקות, **בלי** סיומת שורה: ה-CR של קובץ CRLF אינו בתוך השורה (`hunk.line_ending` אומר איזו
  סיומת יש לשורה שמשתנה). BOM אינו חלק מהשורה הראשונה. `\ No newline at end of file` כמו ב-git.
- `added: [""]` = הצעה למחוק את כל תוכן השורה; השורה עצמה נשארת בקובץ, ריקה.
- **לא נכנס ל-`change_digest`.** ה-digest מחושב רק מהשדות בסעיף 4.
- `diff: null` כשאין הצעה (`proposed_text: null`), כשהמקור לא אותר בוודאות, או כשאין הקשר זמין —
  השירות צריך לעבוד גם בלעדיו.

## 4. תשובה מיידית (200)

```jsonc
{
  "api_version": "1",
  "request_id": "req_…",              // זהה לבקשה
  "report_id": "…", "proposal_revision": 1, "workflow_generation": 3,   // זהים לבקשה
  "decision_id": "dec_…",             // ייחודי לכל החלטה; [A-Za-z0-9_.:-]{1,128}
  "processing_status": "completed",
  "decision": "approved" | "rejected" | "needs_review" | "conflict" | "already_fixed",
  "approval_scope": "technical_only" | "technical_and_content" | null,  // חובה רק ב-approved
  "reason_code": "ok",                // קוד יציב; קודים משלכם בקידומת svc_
  "message": "הסבר לבני אדם",          // לתצוגה בלבד — האתר לעולם לא מנתב לפיו
  "change": { … } | null,             // חובה ב-approved וב-already_fixed
  "candidates": [ { "path", "line_index", "line" } ],   // אופציונלי
  "retry_after_seconds": null
}
```

### `change`

```jsonc
{
  "change_id": "chg_…",
  "change_digest": "<sha256 hex קטן>",
  "target": { "repo": "Otzaria/otzaria-library", "path": "<source.path>", "line_index": <source.line_index> },
  "base": { "commit_sha": "<source.commit_sha>", "blob_sha": "<source.blob_sha>" },
  "original_line": "<source.current_line>",
  "new_line": "<השורה המלאה אחרי התיקון>"
}
```

`change_digest` = `sha256_hex(OCJ1({ "v":1, "path", "base_blob_sha", "line_index", "original_line", "new_line" }))`.
OCJ-1: מפתחות ממוינים (UTF-16), בלי רווחים, מחרוזות בדיוק כמו `JSON.stringify` (עברית ותווים מיוחדים
ליטרליים, בקרה כ-`\u00xx` בהקסה קטנה), מספרים שלמים בלבד, sha256 על בתי UTF-8. **חובה** לאמת את
המימוש שלכם מול `docs/text-corrections/fixtures/digest_fixtures.json` (גם `canonical` וגם `sha256`).
digest שלא תואם לחישוב באתר = התשובה נפסלת ועוברת לידני.

אם `new_line` שונה מההצעה שנשלחה (למשל השירות תיקן גם דבר נוסף), האתר יוצר ממנה גרסת הצעה חדשה
ומעביר לאישור אנושי. אם `target`/`base` שונים מ-`source` שנשלח — גם לידני.

## 5. עבודה אסינכרונית (202)

```jsonc
{ "api_version":"1", "request_id":"req_…", "processing_status":"pending", "job_id":"job_…", "poll_after_seconds": 30 }
```

האתר יבצע `GET {BASE_URL}/v1/verify/{job_id}` (אותה כתובת בסיס, אותן כותרות) אחרי `poll_after_seconds`,
עד תקרת זמן כוללת (24 שעות, קבוע בקוד האתר). התשובה ל-GET היא תשובת 200 כמו בסעיף 4. 202 אינו אישור.

## 6. מה האתר עושה עם כל תשובה

| תשובה | האתר |
|---|---|
| `approved` + `technical_only` | מתנדב מאשר את התוכן. אין פרסום אוטומטי |
| `approved` + `technical_and_content` | פרסום אוטומטי רק אם האתר הסמיך את השירות לכך, הפרסום האוטומטי מופעל, והבקשה ביקשה `technical_and_content`. אחרת — מתנדב. אם השירות טוען לסמכות שלא ניתנה לו, ההחלטה מדורגת ל-`technical_only` ונרשמת |
| `needs_review` / `conflict` | מתנדב (עם `message` ו-`candidates`) |
| `already_fixed` | האתר בודק בעצמו שהשורה במקור כבר זהה ל-`new_line` באותו מיקום; אם כן — נסגר בלי קומיט, אחרת — מתנדב |
| `rejected` | מתנדב, אלא אם האתר הסמיך דחייה אוטומטית. השתמשו ב-`rejected` רק לדחייה **מהותית** של התוכן — לא לכשל טכני ולא ל"לא מצאתי את המקור" (לזה `needs_review` עם `source_not_found`) |
| `processing_status: "failed"` + `service_capacity` | ניסיון חוזר מאוחר יותר |
| `processing_status: "failed"` + `unsupported_capability` | מתנדב, בלי ניסיון חוזר |
| `reason_code` לא מוכר (בלי קידומת `svc_`) | מתנדב |
| `workflow_generation` שאינו הנוכחי | נשמר לתיעוד בלבד |

## 7. קודי HTTP

| קוד | האתר |
|---|---|
| 200 / 202 | לפי הגוף |
| 408, 429, 500, 502, 503, 504, timeout, ניתוק | ניסיון חוזר עם backoff (מכבד `Retry-After`) — עד 6 ניסיונות / 24 שעות (קבוע בקוד האתר), ואז מתנדב |
| 400, 401, 403, 404, 405, 410, 422 | מתנדב מיד, בלי ניסיון חוזר |
| כל קוד אחר (כולל 3xx) | מתנדב מיד |

לכן: החזירו 429/503 רק כשבאמת כדאי לנסות שוב, ו-4xx רק כשניסיון חוזר לא יעזור.

## 8. אידמפוטנטיות וסדר

- אותו `request_id` עשוי להגיע כמה פעמים (ניסיון חוזר אחרי timeout). החזירו אותה החלטה (או את אותו `job_id`).
- `request_id` חדש = פעולה חדשה (הצעה נערכה או שליחה מחודשת ידנית).
- תשובה לבקשה שכבר לא רלוונטית (מתנדב לקח את הדיווח, ההצעה נערכה) לא תזיק — היא נשמרת לתיעוד בלבד.

## 9. בדיקה מקומית

`scripts/mock-verify-server.mjs` באתר הוא שרת דמה שמחזיר תשובות תקינות בפורמט הזה (בלי שום לוגיקת
הכרעה) — שימושי כדוגמה חיה לפורמט. בדיקות האתר (`src/lib/corrections/*.test.mjs`) מכסות את כל
המקרים בטבלאות למעלה. במצב משיכה: `scripts/mock-verify-agent.mjs` (סעיף 10).

## 10. מצב משיכה (pull)

כשהאתר מוגדר `CORRECTIONS_VERIFY_TRANSPORT=pull`, השירות אינו מקבל בקשות — הוא **מושך** אותן מהאתר
(מתאים לשירות מאחורי NAT). הבקשה (סעיף 3) והתשובה (סעיף 4) זהות; רק ההעברה שונה. החוזה המלא:
[`CONTRACT.md`](CONTRACT.md) §3.7.

```
POST {SITE}/api/worker/v1/corrections/claim                → 200 {jobId, leaseToken, leaseExpiresAt, request} | 204
POST {SITE}/api/worker/v1/corrections/{jobId}/heartbeat    → 200 {leaseExpiresAt, cancelled}
POST {SITE}/api/worker/v1/corrections/{jobId}/release      → 200 {released, nextAttemptAt?}   (גוף אופציונלי {retry_after_seconds})
POST {SITE}/api/worker/v1/corrections/{jobId}/result       → 200 {outcome}
כותרות: Authorization: Bearer <CORRECTIONS_AGENT_SECRET>, X-Agent-Id: <CORRECTIONS_AGENT_ID>,
        X-Agent-Version (אופציונלי), X-Lease-Token (בכל נתיב של משימה), Content-Type: application/json (כשיש גוף)
```

הלולאה:
1. `claim`, עם timeout של **לפחות 120 שניות**. ‏`204` → להמתין `Retry-After` שניות ולנסות שוב (5 = ייתכן שיש עוד
   עבודה; 60 = אין; 300 = הבדיקה כבויה). ‏`200` → `request` הוא בדיוק גוף סעיף 3.
2. לעבוד. דופק כל ≤120 שניות (ה-lease הוא 600 שניות ומתחדש בכל דופק). ‏`cancelled: true` או 409 → להפסיק
   ולזרוק את העבודה (מתנדב לקח את הדיווח, הדיווח השתנה, הבדיקה הושהתה, עבר מועד המיצוי, או ששבת מתקרבת).
3. כשבניית db או OCR צריכים את המחשב: `release` (אפשר עם `retry_after_seconds`) — המשימה חוזרת לתור **בלי ניסיון
   ובלי פקיעה**. נטישה בלי `release` נספרת כפקיעה כשה-lease פג, ובפקיעה החמישית הדיווח עובר למתנדב.
4. `result` עם תשובה בפורמט סעיף 4 (`processing_status: "completed"`). אין 202/polling במשיכה: `pending` נדחה
   ב-422. `processing_status: "failed"` + `reason_code: "service_capacity"` מחזיר את המשימה לתור בלי לצרוך ניסיון
   (כמו `release`), אבל `release` עדיף כשמוותרים על המשאבים באמצע.
   `release` שני באותו אסימון מחזיר 409; `release` אחרי שה-lease פג (לפני תפיסה מחדש) מתקבל בלי לספור פקיעה.
   דופק קרוב לחלון מנוחה מחזיר `cancelled` גם אם ההחזרה לתור הפסידה במרוץ — זה אינו מזיק.
   את `CORRECTIONS_AGENT_SECRET` מייצרים מ-CSPRNG (`openssl rand -base64 32`, base64url או hex); סוד של ספרות בלבד עלול להידחות.

מה לעשות עם כל תשובה:

| תשובה | מה עושים |
|---|---|
| 200 | הסתיים (`outcome` לתיעוד: `publish`, `manual`, `close_already_fixed`, `close_rejected`, `retry`) |
| 204 (claim) | אין משימה — להמתין `Retry-After` |
| 409, 422, 404, 413, 400 | לזרוק — שליחה חוזרת לא תעזור (409: ההחלטה נשמרה באתר לתיעוד בלבד, או — ב-`apply_failed` — הדיווח עבר למתנדב; 422: הדיווח עבר למתנדב, `reason` מפרט) |
| 401, 403 | בעיית תצורה (סוד/מזהה, או שהאתר במצב `push`) — להתריע למפעיל ולהחזיק את התוצאה |
| 503, 5xx, timeout, ניתוק | לשלוח שוב את **אותו** גוף בדיוק (האתר מזהה אותו ואינו מחיל פעמיים), ב-backoff ובכיבוד `Retry-After`, ולא אחרי שה-lease פג. ‏`503 shabbat` — האתר סגור לשירות מיום שישי/ערב חג ב-12:00 עד מוצאי שבת/חג ב-22:00 (שעון ירושלים) |

- תפיסה מוסרת משימה אחת, הוותיקה שהגיע זמנה. משימה שהשירות איבד חמש פעמים (קריסה/ניתוק לפני תוצאה) עוברת
  למתנדב ואינה נמסרת שוב.
- סמוך לשבת/יו"ט: האתר לא ימסור משימה שה-lease שלה היה נגמר בתוך החלון, ודופק כזה מחזיר `cancelled` (המשימה חוזרת
  לתור עד מוצאי השבת, בלי קנס).
- דיווח שלא טופל בתוך מועד המיצוי (ברירת מחדל 24 שעות; שבת ויו"ט אינם נספרים) עובר למתנדב.
- `evidence[]` בתשובה (ראו CONTRACT §3.2) נשמר ומוצג למתנדבים בלבד; שדות נוספים אחרים נסבלים ומתעלמים מהם.
- דיווחים שאותרו לפי שם ספר/קובץ (כשהנתיב חסר או התיישן) מגיעים כרגיל עם `match: "exact"`. דיווחים שאותרו לפי התוכן בלי
  תגיות מגיעים עם `match: "unique_normalized"` ו-`current_line` שונה מ-`proposal.original_line` בתגיות בלבד: הפסיקה על
  ה-`diff` (שנבנה מהשורה שבקובץ), ו-`change.new_line` חייב להיות בדיוק השורה החדשה שב-`diff`. אישור (`approved`) על דיווח כזה
  אינו מתפרסם אוטומטית אלא מגיע למתנדב (`inexact_match_review`).
