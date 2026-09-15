# מערכת תיקוני הטקסט — מדריך תפעול

מסמך זה מיועד למפעילי האתר. החוזים עצמם: [`CONTRACT.md`](CONTRACT.md). הוראות למפתח שירות
הבדיקה החיצוני: [`VERIFY_SERVICE_GUIDE.md`](VERIFY_SERVICE_GUIDE.md).

## 1. מבט על

```
תוכנת אוצריא ──POST /api/reportingerrors──▶ ErrorReport (insert יחיד: דיווח + תור ידני / outbox / טיפול חיצוני)
                                                 │
            worker (/api/cron/corrections-worker, כל ~30 שניות)
                 ├─ outbox → CorrectionJob (verify / publish)
                 ├─ verify: resolver (GitHub, קריאה בלבד) → שירות הבדיקה → ניתוב לפי מדיניות
                 ├─ publish: PR מבודד או קומיט ישיר ליעד מההגדרה → reconciliation → מעקב מיזוג
                 └─ heartbeat (WorkerHeartbeat)
מתנדבים ── /library/corrections ── /api/corrections/* (הרשאה נבדקת בשרת בכל פעולה)
```

האתר מתפקד כמערכת **ידנית מלאה** כששירות הבדיקה לא הוגדר מעולם: כל דיווח נכנס לתור הידני,
מתנדב מאשר, והפרסום (אם הוגדר) יוצא כ-PR.

### קבצים מרכזיים

| תחום | קובץ |
|---|---|
| קליטה | `src/lib/corrections/reporting-handler.js`, `intake.js`, `payload.js`, `report-email.js` |
| digest | `src/lib/corrections/ocj1.js` (מאומת מול `fixtures/digest_fixtures.json`) |
| הגדרות | `src/lib/corrections/config.js`, `runtime.js` |
| תור ו-worker | `src/lib/corrections/worker.js`, `src/models/CorrectionJob.js` |
| שירות הבדיקה | `verify-client.js`, `verify-protocol.js`, `classify.js` |
| איתור מקור | `resolver.js`, `git-source.js`, `source-text.js` |
| פרסום | `publisher.js` מעל `src/lib/dicta/github-api.js` (`createRepoClient`) |
| מתנדבים | `volunteer.js`, `actions.js`, `http.js`, `src/app/api/corrections/**`, `src/app/library/corrections/**` |
| טיפול חיצוני (ספריא) | `external.js` (`buildExternalSefariaPackage`) |
| migration | `src/lib/corrections/migrate.js`, `scripts/migrate-corrections.mjs` |

## 2. מצבים

המצב מפוצל לשדות נפרדים על מסמך הדיווח (לא enum יחיד):

| שדה | ערכים |
|---|---|
| `state` | `open`, `awaiting_external`, `closed_published`, `closed_already_fixed`, `closed_rejected`, `closed_manual` |
| `verification.status` | `not_requested`, `queued`, `in_progress`, `completed`, `failed`, `superseded`, `skipped_service_disabled` |
| `approval.authority` / `approval.scope` | `none`/`service`/`volunteer` ו-`none`/`technical_only`/`technical_and_content` |
| `manual.status` | `none`, `queued`, `claimed`, `released` (+ `handoffReason`, `assignee`, `leaseExpiresAt`) |
| `publish.status` | `not_ready`, `ready`, `in_progress`, `unknown_needs_reconcile`, `pr_opened`, `committed`, `failed`, `skipped_already_fixed` |
| `inclusion.status` | `unknown`, `merged_to_main`, `included_in_release` |

- "אושר" אינו "פורסם": אישור מציב `publish.status=ready`. "PR נפתח" (`pr_opened`) אינו "מוזג";
  רק מיזוג שזוהה ע"י ה-worker מציב `committed` + `closed_published`. `merged_to_main` אינו "נכלל
  בגרסת ספרייה" — `included_in_release` אינו מוצב אוטומטית כלל.
- כל מעבר הוא `findOneAndUpdate` יחיד עם תנאי `workflowGeneration` (ולפעולות worker — גם fence של
  המשימה). ה-generation עולה בכל מעבר שמפסיל עבודה ישנה: לקיחה, העברה לידני, עריכה, שליחה מחדש.
- השדה הישן `status` (`pending`/`in_progress`/`resolved`/`rejected`) ממשיך להתעדכן לתאימות.

## 3. הגדרות (env)

כל ההגדרות מתועדות ב-`.env.example`. הדגלים **נפרדים** בכוונה:

| דגל | ברירת מחדל | משמעות |
|---|---|---|
| `CORRECTIONS_INTAKE_ENABLED` | `1` | קבלת דיווחים (כבוי → 503, התוכנה שומרת בתור שלה) |
| `CORRECTIONS_VERIFY_ENABLED` + `_URL` + `_SECRET` | כבוי | הפעלת שירות הבדיקה |
| `CORRECTIONS_VERIFY_AUTHORITY` | `technical_only` | הסמכות שהאתר מעניק לשירות (`none`/`technical_only`/`technical_and_content`) |
| `CORRECTIONS_VERIFY_REQUESTED_SCOPE` | `technical_only` | מה מבקשים מהשירות (לא יותר מהסמכות) |
| `CORRECTIONS_VERIFY_AUTO_REJECT` | כבוי | האם `rejected` מהשירות סוגר אוטומטית |
| `CORRECTIONS_AUTO_PUBLISH` | כבוי | פרסום אוטומטי אחרי אישור מלא של השירות |
| `CORRECTIONS_PUBLISH_MODE` | `pr` אם יש טוקן, אחרת `disabled` | `disabled`/`pr`/`direct` |
| `CORRECTIONS_GITHUB_REPO` / `_BRANCH` / `_TOKEN` | — | יעד הפרסום. **חובה להגדיר במפורש**; אין ברירת מחדל ליעד |
| `CORRECTIONS_ALLOW_DIRECT_COMMIT` | כבוי | נדרש בנוסף ל-`direct` |
| `CORRECTIONS_SOURCE_REPO` / `_REF` | `Otzaria/otzaria-library` / `main` | ממנו קוראים את המקור (קריאה בלבד) |
| `CORRECTIONS_SOURCE_TOKEN` | טוקן הפרסום אם יש | טוקן קריאה. **מומלץ**: בלי טוקן GitHub מגביל ל-60 בקשות לשעה |
| `CORRECTIONS_SOURCE_HEAD_TTL_SECONDS` / `_CACHE_BYTES` | 30 / 64MB | מטמון ראש הענף לתצוגות, ומטמון LRU לתוכן לפי blob sha ולרשימות תיקייה לפי קומיט |

כללי בטיחות שנאכפים בקוד (`config.js`):

- בייצור (`NODE_ENV=production`): `CORRECTIONS_VERIFY_MOCK=1` משבית את השירות, מאפס את הסמכות
  ל-`none` ומכבה פרסום ודחייה אוטומטיים; כתובת `http://` או `localhost` נדחית.
- חוסר בסוד/כתובת/הגדרה = השירות כבוי עם סיבה מפורשת → כל דיווח לידני, בלי ניסיונות.
- יעד הפרסום אינו מגיע לעולם מהבקשה, מהתוכנה או מהשירות. הנתיב בקובץ נבדק מול שורשי הספרים
  (`isAllowedRepoPath`) — אין כתיבה ל-`.github/` או מחוץ ל-`<מקור>/ספרים/אוצריא/`.

מתג חירום בזמן ריצה: בדף **ניהול ובריאות** (מנהל כללי בלבד) אפשר להשהות את שירות הבדיקה
(`SystemConfig` בשם `corrections.runtime`). המתג יכול רק לכבות — לא להפעיל מעבר ל-env.

## 4. ה-worker

### הפעלה (VPS עם pm2)

הנתיב `/api/cron/corrections-worker` (Bearer `CRON_SECRET`, פטור מחסימת השבת ב-proxy) מעבד אצווה
אחת מוגבלת ומחזיר JSON. הלולאה:

```bash
# לולאה קבועה תחת pm2 (מומלץ)
pm2 start scripts/corrections-worker.mjs --name corrections-worker --time
pm2 save

# או cron של המערכת (פעם בדקה)
* * * * * cd /var/www/otzaria-web && node scripts/corrections-worker.mjs --once >> /var/log/corrections-worker.log 2>&1
```

משתני הלולאה: `CRON_SECRET`, `CORRECTIONS_WORKER_URL` (ברירת מחדל `http://127.0.0.1:3000`),
`CORRECTIONS_WORKER_INTERVAL_SECONDS` (30). הלולאה נטענת מ-`.env` אם קיים.

- **עמידות**: כל המצב ב-MongoDB. אין `setTimeout`/זיכרון/Promise אחרי תשובה. restart של האתר
  או של הלולאה לא מאבד עבודה.
- **תפיסה**: `findOneAndUpdate` אטומי; lease (`CORRECTIONS_JOB_LEASE_SECONDS`, ברירת מחדל 120; פרסום ×5)
  עם fence שעולה בכל תפיסה. worker שה-lease שלו פג ומנסה לסיים — נכשל בשקט.
- **משימה פעילה יחידה** לכל פעולה/דיווח: אינדקס ייחודי על `activeKey`.
- **מקביליות**: `CORRECTIONS_WORKER_BATCH` (10) משימות לאצווה, `CORRECTIONS_WORKER_CONCURRENCY` (2) במקביל;
  אותו תהליך לא מריץ שתי אצוות במקביל. כמה תהליכים/שרתים במקביל — בטוח.
- **שבת/יו"ט**: ברירת המחדל משהה את ה-worker (דופק נרשם עם `paused: shabbat`). לביטול:
  `CORRECTIONS_WORKER_PAUSE_ON_SHABBAT=0`.

### Retries (שירות הבדיקה)

המסווג היחיד `classifyVerifyFailure` (`classify.js`):

| סיווג | מקרים | פעולה |
|---|---|---|
| transient | timeout, ECONNRESET/ECONNREFUSED/EAI_AGAIN, 408/429/500/502/503/504, `service_capacity` | backoff מעריכי עם jitter; `Retry-After` מכובד עד התקרה |
| permanent | כבוי/לא מוגדר/חסר סוד, 400/401/403/404/405/410/422, ENOTFOUND, TLS, JSON פגום, שדות חסרים, מזהים לא תואמים, api_version לא נתמך | ידני מיד |
| unknown | כל השאר (כולל 3xx — הפניות נחסמות) | ידני מיד |

גבולות: `CORRECTIONS_VERIFY_MAX_ATTEMPTS` (6), `CORRECTIONS_VERIFY_MAX_TOTAL_SECONDS` (86400),
`CORRECTIONS_VERIFY_BACKOFF_BASE_SECONDS` (30), `_CAP_SECONDS` (3600), `CORRECTIONS_VERIFY_TIMEOUT_MS` (20000).
מיצוי → ידני עם `retries_exhausted` / `deadline_exhausted`. `request_id` זהה בכל ניסיון חוזר; חדש רק בשליחה
מחודשת מפורשת. תשובת 202 = polling לכתובת הבסיס שבהגדרה בלבד (לעולם לא לכתובת מהתשובה).

תשובה מאוחרת (מתנדב לקח בינתיים / generation השתנה) נשמרת ב-`decisions` עם `stale:true` וביומן —
ולא מקדמת מצב.

### פרסום

1. קריאת ראש הענף + ה-blob מאותו קומיט.
2. אימות שהשורה ב-`line_index` היא בדיוק `original_line` (אחרת: אם היא כבר `new_line` → `skipped_already_fixed`
   בלי קומיט; אחרת → האישור נפסל, הדיווח חוזר לידני עם `source_changed_after_approval`).
3. תוכן חדש עם שימור BOM, סיומת השורה של כל שורה ושאר הקובץ בייט-לבייט.
4. blob → tree (base = אותו head) → commit (parent = אותו head).
5. `pr`: ענף `corrections/<report-id>-<publish-attempt-id>` + PR. `direct`: `PATCH refs` עם `force:false`.
6. 422 (הענף התקדם) → חוזרים ל-1 (עד `CORRECTIONS_PUBLISH_MAX_REF_RETRIES`). שינוי לא קשור באותו קובץ
   נשמר; תוכן מבסיס ישן לעולם לא משולב עם parent חדש.

הודעת הקומיט: `תיקון: <ספר> — <מיקום>` + `Report-Id:` + `Publish-Attempt:`. אין אימייל, נתיב מקומי או
הסבר המשתמש בקומיט/PR (כתובות מייל ונתיבי דיסק מסוננים מהכותרת).

**תוצאה לא ידועה** (נפילה אחרי כתיבה ל-GitHub ולפני עדכון ה-DB, או שגיאת רשת באמצע): הניסיון נשאר
`started`/`unknown`. לפני כל ניסיון נוסף ה-worker מבצע reconciliation — מחפש את `Publish-Attempt` בענף
ה-PR או ב-50 הקומיטים האחרונים שנגעו בקובץ — ורק אם לא נמצא, כותב מחדש.

**מעקב PR**: בכל אצווה נבדקים עד 10 PR פתוחים. מוזג → `committed`/`closed_published`; נסגר בלי מיזוג →
`failed` + ידני; בסיס השתנה בזמן שה-PR פתוח → `publish.conflictReason=base_changed_while_pr_open` (תווית "התנגשות").

## 5. בריאות

`GET /api/corrections/admin/health` (מנהל ספרים/כללי) ודף **ניהול ובריאות**:
דופק אחרון, גיל המשימה הוותיקה (בדיקה/פרסום), ספירות, ותיאור ההגדרות בלי סודות.
`healthy=false` כאשר: אין דופק טרי (`CORRECTIONS_HEARTBEAT_STALE_SECONDS`, 300) ויש עבודה ממתינה; האצווה
האחרונה נכשלה; יש פרסום בתוצאה לא ידועה; יש שגיאות הגדרה.

## 6. פעולות מפעיל

| מצב | מה עושים |
|---|---|
| `worker_not_running` | `pm2 logs corrections-worker`; לוודא `CRON_SECRET` זהה באתר ובלולאה; `node scripts/corrections-worker.mjs --once` |
| `worker_paused` | ה-worker מושהה בשבת (`CORRECTIONS_WORKER_PAUSE_ON_SHABBAT`); התור ממשיך בצאת השבת. אין צורך בפעולה |
| השירות מחזיר שגיאות רבות | להשהות מדף הניהול (הממתינים עוברים לידני). ביטול ההשהיה **לא** מחזיר לשירות דיווחים שבידי מתנדבים; שליחה מחודשת רק ידנית |
| `publish_unknown_pending` | בדרך כלל נפתר לבד באצווה הבאה (reconciliation). אם GitHub לא זמין — ממתין; אין לפרסם ידנית בינתיים |
| `publish.status=failed` | הדיווח חוזר לתור הידני עם `publish_failed`; האישור וההצעה נשמרים. לתקן את הסיבה (טוקן/הרשאות/branch protection) ולקחת את הדיווח מחדש |
| 401/403 מ-GitHub | טוקן חסר הרשאה. הקוד לא עוקף branch protection — יש להשתמש ב-`pr` |
| מתנדב חדש | דף **ניהול ובריאות** → מתנדבי תיקונים → סימון "מתנדב" (מנהל ספרים/כללי). ההרשאה אינה נותנת גישה לפאנל הניהול |
| דיווח תקוע בבדיקה | מתנדב לוקח אותו (הבדיקה נפסלת), או השהיית השירות |

## 7. ספרי ספריא — טיפול חיצוני

ספרים שמקורם ספריא (`source_folder` = `sefariaToOtzaria`/`Sefaria`, או `source_hint.source_name = "Sefaria"`)
אינם נבנים מקבצי `otzaria-library` אלא מארכיון `Otzaria/SefariaExport` בגנרטור. לכן:

- בקליטה הם מנותבים ל-`state=awaiting_external` (`external.target = sefaria_generator`) — לא לתור הידני,
  לא לשירות הבדיקה, ולעולם לא למפרסם. ה-resolver לא מנסה נתיבי `sefariaToOtzaria` כלל.
- נשמרת חבילת איתור (`external.package`, מ-`buildExternalSefariaPackage`): `book_title`, `he_ref`
  (`he_ref_stable:false`), `db_line_index`, `library_version`, `original_line` (הנוסח ב-DB אחרי ניקוי הגנרטור),
  `original_line_sha256`, `new_line` (או `null`), היסטי הבחירה, מזהי הדיווח. `generator_format: null` —
  פורמט הקובץ שהגנרטור יקלוט טרם נקבע; כשייקבע, מחליפים רק את `buildExternalSefariaPackage`.
- בממשק: לשונית **טיפול חיצוני (ספריא)**; מנהל ספרים/כללי יכול לסמן "טופל", "נדחה" (עם סיבה) או להחזיר
  לטיפול ידני. כל מעבר מותנה בגרסה.
- ייצוא: `GET /api/corrections/admin/external-export` (כפתור "ייצוא JSON") — כל הפריטים הממתינים. אין שליחה אוטומטית.
- מייל ההתראה הקיים לספריא (corrections@sefaria.org) ממשיך כמו קודם.

## 8. Rollout

1. **אתר חדש, ידני** — לפרוס; להריץ `node scripts/migrate-corrections.mjs` (dry-run) ואז `--apply`.
   השירות כבוי, פרסום `disabled`. לקוחות ישנים ממשיכים לעבוד (200, `duplicate`, `reportId`, `savedToDatabase`).
2. **worker** — להגדיר `CRON_SECRET` ולהפעיל את הלולאה תחת pm2. לוודא דופק בדף הבריאות.
   להגדיר `CORRECTIONS_GITHUB_*` (בלי `PUBLISH_MODE` → `pr`) כדי שאישורי מתנדבים ייצאו כ-PR.
3. **גרסת תוכנה** עם `schema_version: 2` — ההצעות המובנות מופיעות בממשק.
4. **חיבור השירות** — `CORRECTIONS_VERIFY_ENABLED/URL/SECRET`, סמכות `technical_only`. כל אישור עדיין עובר למתנדב.
5. **אוטומציה** — רק אחרי תקופת מעקב: `CORRECTIONS_VERIFY_AUTHORITY=technical_and_content`,
   `CORRECTIONS_VERIFY_REQUESTED_SCOPE=technical_and_content`, `CORRECTIONS_AUTO_PUBLISH=1` (עדיין PR).

שלבים 1–3 שימושיים בלי 4–5.

## 9. Rollback

- **קוד**: פריסת הגרסה הקודמת. כל השדות החדשים אופציונליים ומתעלמים מהם בקוד הישן; `status` הישן
  מסונכרן, ולכן הדיווחים נראים כרגיל. אין לבצע migration הפוכה — **אין למחוק** דיווחים, החלטות, חבילות
  שינוי, ניסיונות פרסום או יומן (`CorrectionEvent`).
- **הקוד הישן מחזיר 500 כש-SMTP נכשל** — לקוח ישן יחזור וינסה; זו ההתנהגות שהייתה.
- **חזרה לגרסה החדשה אחרי rollback**: דיווחים שנקלטו בקוד הישן (בלי `state`) משודרגים בעצלות בפתיחה/לקיחה,
  או ב-`scripts/migrate-corrections.mjs --apply` (אידמפוטנטי).
- **עצירת אוטומציה בלי rollback**: להשהות את השירות מדף הניהול, ו/או `CORRECTIONS_PUBLISH_MODE=disabled`
  (אישורים נשמרים כ"אושר וממתין לפרסום" ויפורסמו כשיופעל מחדש).
- ה-worker נעצר ב-`pm2 stop corrections-worker`; משימות פתוחות ממשיכות מאותו מקום כשהוא חוזר.

## 10. בדיקות

`npm test` מריץ גם את `src/lib/corrections/*.test.mjs`. בדיקות האינטגרציה (`*.int.test.mjs`) רצות מול
MongoDB אמיתי דרך `mongodb-memory-server-core` (הבינארי יורד בהרצה הראשונה ל-`~/.cache/mongodb-binaries`;
ברשת מסוננת: `NODE_EXTRA_CA_CERTS`). אם MongoDB לא זמין, הבדיקות מסומנות skip עם הסיבה — לא "עוברות".
GitHub ושירות הבדיקה מדומים בבדיקות בלבד (`src/lib/corrections/testing/`). כותרת כל בדיקה שמכסה מקרה
מרשימת הדרישות מתחילה ב-`[T<n>]`.

שרת דמה לפיתוח מקומי (אסור בייצור; מסרב לרוץ עם `NODE_ENV=production`):

```bash
MOCK_VERIFY_SECRET=dev node scripts/mock-verify-server.mjs
# באתר: CORRECTIONS_VERIFY_ENABLED=1 CORRECTIONS_VERIFY_URL=http://127.0.0.1:4555 CORRECTIONS_VERIFY_SECRET=dev CORRECTIONS_VERIFY_MOCK=1
```
