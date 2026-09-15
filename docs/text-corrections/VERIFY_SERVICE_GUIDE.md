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
- timeout לבקשה: 20 שניות כברירת מחדל. עבודה ארוכה יותר → 202 (סעיף 5).
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
- `source` הוא מה שהאתר איתר (`match: "exact"` ברוב המקרים). האתר לא שולח בקשה בלי מקור שאותר.

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
עד תקרת זמן כוללת (ברירת מחדל 24 שעות). התשובה ל-GET היא תשובת 200 כמו בסעיף 4. 202 אינו אישור.

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
| 408, 429, 500, 502, 503, 504, timeout, ניתוק | ניסיון חוזר עם backoff (מכבד `Retry-After`) — עד 6 ניסיונות / 24 שעות כברירת מחדל, ואז מתנדב |
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
המקרים בטבלאות למעלה.
