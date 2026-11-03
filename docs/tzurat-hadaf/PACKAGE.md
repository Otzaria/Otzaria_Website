# צורת הדף ↔ אתר אוצריא: פורמט החבילה והייצוא (`tzurat-review/1`)

עותק זהה נמצא ב-`tzurat-hadaf/docs/SITE.md` (חלק "הפורמט"). כל שינוי — בשני המקומות, עם העלאת הגרסה.

## 1. חבילה (צורת הדף → האתר): ZIP אחד למסכת

```
manifest.json
pages.jsonl          שורה לעמוד
items.jsonl          שורה להחלטת נוסח ממתינה
images/<dafKey>.scan.png    הסריקה של וילנא (התמונה המקורית של עמוד ה-PDF)
images/<dafKey>.ours.webp   צילום העמוד שלנו מהבנייה (או .png)
```

`manifest.json`:
```json
{"format": "tzurat-review/1", "slug": "berakhot", "masechet": "ברכות", "order": 1,
 "buildId": "5f143e8+v32+2026-10-25", "created": "2026-10-25T21:00:00Z",
 "pages": 125, "items": 1234, "full": true}
```
- `slug`: `[a-z0-9-]{1,40}`, מזהה המסכת (ASCII) — גם בנתיבי התמונות באתר. `order`: סדר המסכתות בש"ס.
- `full: true` — החבילה מכילה את **כל** הממתינים של המסכת: פריט פתוח באתר שאינו בחבילה הופך ל-`obsolete`.
  `false` — עדכון חלקי (רק העמודים שבחבילה).

`pages.jsonl` — רשומה לעמוד:
```json
{"dafKey": "002a", "daf": "ב.", "order": 0,
 "pdf": {"file": "ברכות.pdf", "page": 11},
 "scan": {"file": "images/002a.scan.png", "w": 2629, "h": 3555},
 "ours": {"file": "images/002a.ours.webp", "w": 2629, "h": 3555},
 "nonVilna": false, "changed": false, "model": {…}}
```
- `dafKey`: `^\d{3}[ab]$` (מספר הדף בשלוש ספרות + a/b). `daf`: בעברית, כמו ב-`print/*.jsonl`.
- `pdf.page`: אינדקס מ-0 בקובץ ה-PDF של המסכת (`pdf_ocr.page_for`).
- `nonVilna`: העמוד ב-PDF אינו וילנא (אין השוואת שורות).
- `changed`: העמוד השתנה מאז החבילה הקודמת (עוגן ידני, נוסח, קוד) → באתר נפתח לסבב נוסף.

**מודל העמוד (`model`):**
```json
{"blocks": [
  {"id": "g", "kind": "g", "label": "גמרא", "auto": "ok",
   "lines": [
     {"i": 0, "ours": [0.345, 0.089, 0.305, 0.015], "scan": [0.33, 0.09, 0.31, 0.016],
      "words": [{"t": "מאימתי", "ref": "…", "wi": 0}, …],
      "print": ["מאימתי", …],
      "auto": true, "flag": null}
   ]}
]}
```
- `blocks[].id`: מזהה יציב לגוש בעמוד (`g`, `r`, `t`, `mg0`, …). `kind`: `g` גמרא, `r` רש"י, `t` תוספות,
  `mg` גיליון/מפרשים בשוליים, ואחרים כפי שהם בבנייה. `label`: שם לתצוגה.
- `auto`: מצב העוגנים האוטומטיים בגוש: `ok` (יש עוגנים), `gate` (השער דחה), `match` (התאמה נמוכה),
  `none` (אין שורות דפוס / לא נבדק).
- `lines[].i`: מספר השורה בגוש לפי הגאומטריה (האינדקס ב-`geom.blocks[k].lines` מיד אחרי `load_page`, לפני
  שורות ההדרן המדומות) — **המזהה של השורה בעוגן**. שורה מדומה שהבנייה הוסיפה (הדרן, כותרת) — `i` שלילי
  (`-1`, `-2`…) ו-`fake: true`; אין בה פעולות שורה. שדות נוספים מותרים (למשל `box0` — מזהה יציב לשורה
  בגאומטריה).
- `blocks[].editable`: `false` לגוש שאין בו פעולות שורה (מפרשים בשוליים, עמוד `nonVilna`). ברירת מחדל `true`.
- `ours` / `scan`: `[x, y, w, h]` כשברים (0–1) מהתמונה המתאימה (`ours` מצילום העמוד שלנו, `scan` מהסריקה).
  `scan` יכול להיות `null` (אין רישום).
- `words`: המילים שלנו בשורה אחרי הבנייה, לכל מילה `ref` (heRef של שורת אוצריא) ו-`wi` (מספר המילה בה).
  מילה בלי זהות (מספר דף, כותרת) — בלי `ref`.
- `print`: מילות הדפוס של השורה (OCR של ה-PDF), לרמז בלבד.
- `auto`: בשורה יש עוגן אוטומטי. `flag`: `start` / `end` / `both` / `null` — המילה הראשונה/האחרונה אצלנו
  שונה מהדפוס (לסימון "שורה חשודה").

`items.jsonl` — רשומה להחלטה:
```json
{"sourceKey": "berakhot|g|<ref>|<wi>|rep", "dafKey": "002a", "kind": "g", "cls": "c_substitution",
 "question": "replace", "ref": "…", "wi": 4, "n": 1, "otz": ["…"], "print": ["…"],
 "ctxBefore": ["…","…","…"], "ctxAfter": ["…","…","…"],
 "box": {"x": 0.41, "y": 0.22, "w": 0.06, "h": 0.016}, "score": 4.5,
 "hints": {"rule": "", "te": "print", "oh": "otz", "bx": "otz"}}
```
- `sourceKey` = `slug|kind|ref|wi|ins` (כש-`n=0`) או `…|rep`. ייחודי בכל האתר.
- `question` (נגזר מ-`n`/`print`/`cls`):
  - `print_only` — `n=0`: מילות `print` אינן אצלנו. "האם המילים נדפסות כאן?"
  - `otz_only` — `print` ריק: מילות `otz` אינן בדפוס. "האם המילים נדפסות כאן?"
  - `paren` — `cls=d_paren_ref` (מראה מקום). כמו `otz_only` / `print_only` לפי הצד שאינו ריק.
  - `replace` — כל השאר: "מה כתוב בדפוס?"
- `box`: שברים מהסריקה של העמוד (`scan`), סביב המקום (או `null` — אין מיקום; הפריט מוצג רק בבדיקת עמוד).
- `hints`: למנהל בלבד (לא נשלח למתנדב).

## 2. ההכרעה הקנונית (`verdict`)

| verdict | משמעות | בצורת הדף |
|---|---|---|
| `print` | הנוסח של רשומת הדפוס (`print`) הוא מה שנדפס כאן | הרשומה `accepted` |
| `otz` | הנוסח של אוצריא (`otz`) הוא מה שנדפס כאן | הרשומה `rejected` |
| `other` | נדפס משהו אחר — `text` | רשומה חדשה `accepted` עם `print = text` |
| `elsewhere` | (רק `otz_only`) המילים נדפסות, אבל לא כאן — בשורה/עמוד סמוך | `rejected` + לבדיקת חלוקה; **הטקסט נשאר** |
| `unclear` | לא ניתן להכריע מהסריקה | נשאר `pending` |

התרגום מתשובת המתנדב:
- `replace`: האפשרות `a`/`b` (הסדר אקראי) → `otz`/`print`; "משהו אחר" → `other`.
- `print_only`: "כן" → `print`; "לא" → `otz`.
- `otz_only`: "כן, כאן" → `otz`; "לא כאן, אבל סמוך" → `elsewhere`; "לא נדפס בכלל" → `print`.
- `paren`: לפי הצד שאינו ריק, כמו שתי השורות הקודמות.

**הסכמה:** שתי תשובות של שני משתמשים שונים עם אותו `verdict` (וב-`other` אותו `text` אחרי נרמול: רווחים,
ניקוד, גרשיים ומירכאות אחידים) → `agreed`. שתי תשובות שונות → `disputed` (למנהל). `unclear` אינו נספר
כהכרעה; שני `unclear` → `disputed`.

## 3. ייצוא (האתר → צורת הדף): NDJSON, רשומה לשורה עם `type`

```
{"type":"meta","format":"tzurat-review-export/1","exportedAt":"…","since":null,"exportId":"…"}
{"type":"decision","sourceKey":"…","slug":"berakhot","masechet":"ברכות","daf":"ב.","dafKey":"002a","kind":"g",
 "ref":"…","wi":4,"n":1,"otz":["…"],"print":["…"],"verdict":"print","text":null,"status":"agreed",
 "manual":false,"box":{…},"answers":[{"who":"otz-<id>","verdict":"print","text":null,"via":"fast","at":"…"}],
 "resolvedBy":null,"at":"…"}
{"type":"anchor","slug":"berakhot","masechet":"ברכות","daf":"ב.","dafKey":"002a","block":"g","line":7,
 "ref":"…","wi":3,"action":"start","who":"otz-<id>","submission":"<id>","round":1,"buildId":"…","at":"…"}
{"type":"check","slug":"…","daf":"…","dafKey":"…","key":"blocks","value":"issue","submission":"<id>"}
{"type":"report","id":"<id>","slug":"…","masechet":"…","daf":"…","dafKey":"…","category":"layout","text":"…",
 "regions":[{"side":"scan","x":0.1,"y":0.2,"w":0.3,"h":0.05}],"status":"new","who":"otz-<id>","at":"…"}
{"type":"contributor","who":"otz-<id>","name":"…","decisions":12,"pages":3,"reports":1}
```
- `decision`: רק `agreed` או `resolved` (הכרעת מנהל). `manual: true` — רשומה שנוצרה בבדיקת עמוד ("בדפוס כתוב
  אחרת"): `otz` — המילים שלנו שסומנו, `print` — מה שהמתנדב כתב, `n = otz.length`, ומפתח
  `slug|kind|ref|wi|rep` של המילה הראשונה.
- `anchor`: רק מהגשות שאושרו. `action: "start"` — שורה `line` בגוש `block` מתחילה במילה (`ref`,`wi`).
  `"confirm"` — השורה נבדקה ונמצאה נכונה (בלי `ref`/`wi`).
- `check`: תוצאות "מבט כללי" מהגשות שאושרו. מפתחות: `blocks`, `headers`, `edges`, `size`.
- `report`: כל הדיווחים (כל הסטטוסים). `category`: `missing` / `extra` / `linebreak` / `block` / `size` /
  `header` / `ein_mishpat` / `gilyon` / `overflow` / `other`.
- `who` = `otz-<userId>` (יציב, לא שם). השמות רק ב-`contributor`.
- `?since=<iso>` — רק מה שהשתנה מאז. בייצוא `since` יוצאות גם שורות **ביטול** להכרעות שכבר יצאו ונפתחו מאז
  (פריט שנפתח מחדש, נדחה או התיישן): `{"type":"decision","sourceKey":"…","slug":"…","dafKey":"…","status":"retracted","at":"…"}` —
  בצורת הדף הרשומה חוזרת ל-`pending`. בייצוא מלא (בלי `since`) אין ביטולים: הרשימה המלאה מחליפה את הקודמת.
- `decision.text` (ב-`other`) ו-`answers[].text` — הטקסט כפי שהמתנדב כתב (גרשיים, ניקוד וסימנים נשמרים; רק רווחים
  מכווצים). הנרמול (§2) הוא רק להשוואה בין תשובות.
- `?types=` (או `parts=`) — `decision`, `anchor`, `check`, `report`, `contributor` (יחיד או רבים); `manual` מתקבל
  ומשמעו `decision` (הרשומות הידניות הן decision עם `manual: true`).

**ייצוא בלי האתר:** אותו פורמט בדיוק נבנה ישירות מאוספי Mongo (`tzuratitems`, `tzuratsubmissions`,
`tzuratreports`, `tzuratpages`, `users`) בכלי `tools/site_pull.py --mongo URI` (או `--dump DIR` של
`mongoexport --jsonArray`) בצורת הדף. כל המיקומים שבר מעמוד ה-PDF (`pdf.page` של העמוד), ולכן החיתוכים
נוצרים מחדש מה-PDF המקומי.

## 4. סנכרון (צורת הדף → האתר)

`POST /api/admin/tzurat-hadaf/sync`:
```json
{"reports": [{"id": "<id>", "status": "fixed", "note": "…", "buildId": "…"}],
 "pages": [{"slug": "berakhot", "dafKey": "002a", "action": "reopen", "note": "…"}]}
```

## 5. תרגול (`practice.jsonl` בחבילה, אופציונלי)

רשומות בצורת `items.jsonl` ובנוסף `expected` (verdict) ו-`explain` (משפט הסבר). נשמרות באתר כ-`TzuratItem`
עם `practice: true` (לא בתור, לא בייצוא). מגיעות מהחלטות `auto`/`accepted` שנבדקו (`print/_qa_*`).
