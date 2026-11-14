# צורת הדף — תפעול בצד האתר

החוזה: `CONTRACT.md`. פורמט החבילה והייצוא: `PACKAGE.md`. הקוד: `src/lib/tzuratHadaf/*`, הראוטים תחת
`src/app/api/tzurat-hadaf/**` ו-`src/app/api/admin/tzurat-hadaf/**`, המודלים `src/models/Tzurat*.js`.

## 1. ייבוא חבילה (מסכת אחת)

חבילה גדולה (100–400MB) **אינה** עולה בבקשה אחת: ה-proxy של Next שומר את הגוף בזיכרון וקוטע מעבר ל-
`proxyClientMaxBodySize`. לכן ההעלאה בחלקים של 8MB, וההרכבה והעיבוד ברקע:

1. `POST /api/admin/tzurat-hadaf/uploads` `{name: "berakhot.zip", size}` ← `201 {id, chunkSize, chunks}` (עד 2GB).
2. לכל `n` מ-0 עד `chunks-1`: `PUT …/uploads/<id>/chunks/<n>` עם `Content-Type: application/octet-stream`, בגודל
   **המדויק** (`chunkSize`; האחרון — השארית). החלק נכתב בזרימה לדיסק (קובץ זמני + rename). שליחה חוזרת של אותו
   חלק בטוחה. גוף קצר — 400, ארוך — 413.
3. העלאה שנקטעה: `GET …/uploads/<id>` ← `upload.received` — שולחים רק את החסרים.
4. `POST …/uploads/<id>/complete` ← `202` (`queued`). ברקע (`after()`): הרכבת `package.zip` (sha256 בדרך, החלקים
   נמחקים), פריסה זורמת (fflate `Unzip`, לעולם לא `unzipSync`), ואז העמודים, התמונות, ההחלטות והתרגול.
   הלקוח מתשאל את `GET …/uploads/<id>` (`status`, `progress`, `summary`, `errors` — עד 20).
5. עבודה שנקטעה (pm2 reload הורג את `after()`), או כדי להריץ שוב: `POST …/uploads/<id>/retry` — מותר כשהסטטוס
   `failed`/`done`, או `queued`/`processing` בלי דופק (`heartbeatAt`) 3 דקות. לכל ריצה `runToken` ותיקיית `staging-<runToken>`
   משלה; כל דופק (גם בזמן ההרכבה) מותנה ב-token — ריצה ישנה שנתפסה מחדש נעצרת בלי לכתוב סטטוס. הייבוא idempotent: עמודים לפי
   `{slug, dafKey}`, החלטות לפי `sourceKey`; עמוד שסומן `changed` עולה סבב פעם אחת בלבד לכל `buildId`.

סדר הקבצים ב-ZIP אינו מובטח: קובצי הטקסט נאספים בזיכרון, והתמונות (`images/<dafKey>.<scan|ours>.<ext>` — תבנית
קבועה; שם אחר מדולג, כך שאין "zip slip") נכתבות ל-`staging/` של ההעלאה; רק אחרי הבדיקה של `manifest.json` והעמוד
הן עוברות למקומן (`public/uploads/tzurat-hadaf/<slug>/<dafKey>.<side>.<ext>`). `staging-<runToken>/` נמחק בסוף.

ייבוא חוזר: החלטה פתוחה עם תשובות — רק `score`/`hints` מתעדכנים (המקום, ההקשר והמילים כפי שהמתנדבים ראו); בלי תשובות —
הכול. `obsolete` שחוזרת בחבילה — נפתחת נקייה (בלי תשובות ונקודות). `full:true` — פתוחות שאינן בחבילה ← `obsolete`, חוץ
מאלה שכבר יש להן תשובות (`summary.items.keptAnswered` — המנהל מחליט).
`pages.jsonl` ו-`items.jsonl` חייבים להימצא; המונים ב-manifest (אם סופקו) נבדקים לפני שינוי עמודים או תמונות.
`items.jsonl` ריק מותר כשהמונה 0. שגיאות רשומות/שמירה מונעות את שלב ה-obsolete של ייבוא מלא.
שאלה פתוחה ללא תשובות מקבלת `revision` חדש באותו עדכון שמשנה את תוכנה. לקוח עם גרסה ישנה מקבל `409 stale`.

דוגמה עם curl ומפתח-גישה (ראו §4):

```bash
T="Authorization: Bearer tht_…"; F=berakhot.zip; S=$(stat -c%s $F)
ID=$(curl -fsS -H "$T" -H 'Content-Type: application/json' -d "{\"name\":\"$F\",\"size\":$S}" \
  https://otzaria.org/api/admin/tzurat-hadaf/uploads | jq -r .id)
split -b 8388608 -d -a 4 $F part.
n=0; for p in part.*; do curl -fsS -X PUT -H "$T" -H 'Content-Type: application/octet-stream' --data-binary @$p \
  https://otzaria.org/api/admin/tzurat-hadaf/uploads/$ID/chunks/$n >/dev/null; n=$((n+1)); done
curl -fsS -X POST -H "$T" https://otzaria.org/api/admin/tzurat-hadaf/uploads/$ID/complete
```

## 2. nginx

לכל ה-location של האתר מספיק `client_max_body_size 16m;` (חלק של 8MB + מרווח). כדי שחלק לא ייחתך באמצע:
`proxy_request_buffering off;` ו-`proxy_read_timeout 300s;` ב-location של `/api/admin/tzurat-hadaf/`. דוגמה:

```nginx
location /api/admin/tzurat-hadaf/ {
    client_max_body_size 16m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    proxy_pass http://127.0.0.1:3000;
}
```

הייצוא (`GET …/export`) זורם — `proxy_buffering off;` באותו location מונע החזקה של כל התשובה ב-nginx.

## 3. תיקיות

| מה | איפה | הערות |
|---|---|---|
| העלאות גולמיות | `storage/tzurat-hadaf/uploads/<id>/` (`<n>.part`, `package.zip`, `staging/`) | `TZURAT_STORAGE_DIR` משנה את השורש |
| חיתוכים שמורים | `storage/tzurat-hadaf/crops/<slug>/`, `crops/pages/<pageId>/` | נוצרים מחדש לפי הצורך; מותר למחוק |
| תמונות העמודים | `public/uploads/tzurat-hadaf/<slug>/` (`UPLOAD_DIR` אם מוגדר) | חסום ב-`/uploads` (`BLOCKED_PREFIXES`) — רק דרך ה-API |

גיבוי: רק `public/uploads/tzurat-hadaf` (אפשר גם לייבא מחדש מהחבילה). `storage/` אינו נכנס ל-build.

## 4. מפתחות-גישה (`tht_`)

בדף הניהול (רק session): `GET/POST /api/admin/tzurat-hadaf/tokens`, `DELETE …/tokens/<id>`. המפתח מוצג פעם אחת.
הרשאות: `read` (stats, רשימות, export, guide GET), `import` (uploads, sync, השהיית מסכת), `review` (הכרעות, אישור/דחייה,
דיווחים, עריכת ההנחיות). המפתח פועל רק תחת `/api/admin/tzurat-hadaf/**` (חוץ מ-`/tokens`), וכל עוד בעליו עדיין
`admin` או `admin_books`. ניסיונות שגויים — האטה לפי IP (10 ב-10 דקות).

## 5. ייצוא וסנכרון

- `GET /api/admin/tzurat-hadaf/export?since=<iso>&types=decision,anchor,check,report,contributor` (גם `parts=`) — NDJSON
  זורם. `since` לפי `updatedAt`. ייצוא שכולל `anchor` או `check` מחזיר בשורת ה־meta גם `exportId`.
  לאחר שהלקוח קיבל את כל הקובץ הוא שולח `POST /api/admin/tzurat-hadaf/export` עם `{exportId}`;
  רק ה־ACK מסמן `exportedAt`, ורק להגשות שעדיין מאושרות ואינן בתהליך דחייה. ניתוק לפני קבלת הקובץ
  אינו נועל הגשות. עבודת ACK שלא הושלמה פגה אוטומטית אחרי 24 שעות.
  ניתוק הזרם אחרי הסימון עשוי לנעול דחייה גם לפני קבלת השורה אצל הצרכן; הייצוא ניתן להרצה חוזרת ללא אובדן הנתונים.
- `POST /api/admin/tzurat-hadaf/sync` `{reports:[{id, status, note, buildId}], pages:[{slug, dafKey, action:'reopen'|'close'}]}`.
  דיווח `fixed` מזכה את המדווח ב-2 נקודות (פעם אחת).

## 6. ניקוי

`cleanupOldUploads()` (`src/lib/tzuratHadaf/uploads.js`) מוחק קובצי העלאות בנות יותר משבוע (הרשומה נשארת; העלאה
שלא הושלמה מסומנת `failed`) ותיקיות יתומות. הוא רץ ברקע בכל יצירת העלאה חדשה (`POST uploads`) — אין cron נפרד.
אם רוצים ניקוי קבוע גם בלי העלאות: לחבר אותו ל-route תחת `/api/cron` (מחוץ לתחום הקוד של המודול כרגע).
`storage/tzurat-hadaf/crops/` אפשר למחוק בכל עת.

## 7. נקודות

הכרעה מוסכמת: +1 לכל מסכים (פעם אחת, `pointsAwarded` מתהפך באותו עדכון שסוגר את הפריט); הכרעת מנהל: +1 למי
שענה כמוה (אם עוד לא חולקו). הגשה מאושרת: +10 (דחייה של מאושרת שלא יצאה — −10). דיווח שתוקן: +2.


## 8. חידוש שמירת הגשה

הקלט המנורמל נשמר בהגשה בסטטוס `processing` לפני תשובות, פריטים ידניים ודיווחים. רק בסיום כל הכתיבות
הסטטוס הופך ל-`submitted`, המנהל יכול לבדוק, והטיוטה נמחקת. כשל מסד מחזיר `503 retry`: המתנדב פותח
את העמוד ולוחץ "המשך שמירת ההגשה". השרת משתמש בקלט השמור, גם אם הועלתה בינתיים בנייה חדשה;
התשובות מתויגות במזהה ההגשה ולדיווחים מזהים קבועים, כך שחידוש אינו יוצר כפילויות.

נעילת העיבוד נבדקת לפני כתיבה ומתחדשת לכל היותר כל 30 שניות (וגם לפני השלמת ההגשה). בכשל מטופל היא משתחררת מיד; לאחר הריגת תהליך/ניתוק מסד ייתכן
שצריך לנסות שוב אחרי עד 10 דקות. עד אז `409 processing` מונע שני עובדים במקביל. אין צורך ב-replica set
או בטרנזקציות מרובות מסמכים. תשובות לשאלות שנסגרו או השתנו בזמן העיבוד נשמרות עם אזהרה מפורשת
למנהל (`answerIssues` והקלט המקורי `input`), במקום להתעלם מהן.

אישור ודחייה משתמשים ב־`reviewAction`/`reviewData` ובמזהי אירוע אטומיים במסמכי המשתמש והעמוד.
הסטטוס הסופי נכתב רק אחרי כל תופעות הלוואי; אם התהליך נעצר, שליחת אותה פעולה שוב ממשיכה מהקלט
שהוקפא בלי להכפיל נקודות או מונים. אין למחוק ידנית `reviewAction` תקוע — ניסיון חוזר הוא מנגנון ההתאוששות.

אינדקסי תור המסלול המהיר כוללים את כל המיון (`status,kind,score,_id` וגם `status,score,_id` למסננים
על כמה סוגים). הם נוצרים עם המודל ב-autoIndex הרגיל; בסביבה עם autoIndex כבוי יש להריץ
`TzuratItem.createIndexes()` לפני הפעלת המסלול. אין צורך לשנות או למחוק מסמכים קיימים: `revision` חסר
מפורש כ-0. טיוטה ללא `version` אינה מיושמת על הבנייה הנוכחית; הנתונים הישנים נשארים במסד.
