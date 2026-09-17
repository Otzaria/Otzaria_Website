# מערכת תיקוני הטקסט — מדריך תפעול

מסמך זה מיועד למפעילי האתר. החוזים עצמם: [`CONTRACT.md`](CONTRACT.md). הוראות למפתח שירות
הבדיקה החיצוני: [`VERIFY_SERVICE_GUIDE.md`](VERIFY_SERVICE_GUIDE.md).

## 1. מבט על

```
תוכנת אוצריא ──POST /api/reportingerrors──▶ ErrorReport (insert יחיד: דיווח + תור ידני / outbox, או email_only)
                                                 │
            worker (/api/cron/corrections-worker: מיד אחרי דיווח/אישור, ו-cron כל 10 דקות כרשת ביטחון)
                 ├─ outbox → CorrectionJob (verify / publish)
                 ├─ verify: resolver (GitHub, קריאה בלבד) → שירות הבדיקה → ניתוב לפי מדיניות
                 ├─ publish: PR מבודד או קומיט ישיר ליעד הקבוע בקוד → reconciliation → מעקב מיזוג
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
| migration | `src/lib/corrections/migrate.js`, `scripts/migrate-corrections.mjs` |

**תקרות בקליטה.** נדחים (413/400, בלי חיתוך) רק השדות המדויקים של `correction` (20,000 כל אחד) וגוף
מעל 256KB. שדות התצוגה הישנים (`error_details`, `selected_text`, `context_text` וכו') נבדקים לטיפוס בלבד:
`error_details` נושא את בלוק ה-fallback של §2.5 (עד 2×20,000). הם נשמרים ונשלחים במייל מקוצצים לתצוגה,
כמו בלקוח ישן, וה-`content_digest` מחושב על מה שהתקבל — ההצעה המדויקת נשמרת רק מ-`correction`.

## 2. מצבים

המצב מפוצל לשדות נפרדים על מסמך הדיווח (לא enum יחיד):

| שדה | ערכים |
|---|---|
| `state` | `open`, `email_only`, `closed_published`, `closed_already_fixed`, `closed_rejected`, `closed_manual` |
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

## 3. הגדרות

ההגדרות מפוצלות לשלוש שכבות, ובכוונה:

### 3.1 מתגי התנהגות — מסך הניהול בלבד

דף **ניהול ובריאות** (`/library/corrections/admin`, מנהל כללי בלבד) שומר אותם במסמך
`SystemConfig` בשם `corrections.runtime` דרך `POST /api/corrections/admin/settings`:

| מתג | ברירת מחדל | משמעות |
|---|---|---|
| `intakeEnabled` | פעיל | קבלת דיווחים (כבוי → 503, התוכנה שומרת בתור שלה) |
| `publishMode` | `disabled` | `disabled` / `pr` / `direct` |
| `autoPublish` | כבוי | פרסום אוטומטי אחרי אישור מלא של השירות |
| `verifyPaused` | לא מושהה | השהיית שירות הבדיקה — הממתינים עוברים לידני |

`direct` כותב ישירות לענף בלי PR; המסך דורש אישור מפורש לפני המעבר אליו. `publishMode` שאינו
מהרשימה נדחה (400) ואינו נשמר; ערך פגום שכבר קיים במסמך נקרא כ-`disabled`.

### 3.2 env — סודות וכתובות בלבד

| משתנה | משמעות |
|---|---|
| `CRON_SECRET` | Bearer לכל `/api/cron/*`, כולל ה-worker |
| `DICTA_LIBRARY_GITHUB_TOKEN` | הטוקן היחיד לכתיבות GitHub של האתר: עריכת הספרייה, פרסום תיקונים, issues של דיווחי התוכנה. בלעדיו הפרסום כבוי (`publish_token_missing`) |
| `CORRECTIONS_VERIFY_ENABLED` + `_URL` + `_SECRET` | הפעלת שירות הבדיקה (כבוי כברירת מחדל) |
| `CORRECTIONS_VERIFY_AUTHORITY` | הסמכות שהאתר מעניק לשירות (`none`/`technical_only`/`technical_and_content`) |
| `CORRECTIONS_VERIFY_REQUESTED_SCOPE` | מה מבקשים מהשירות (לא יותר מהסמכות) |
| `CORRECTIONS_VERIFY_AUTO_REJECT` | האם `rejected` מהשירות סוגר אוטומטית |
| `CORRECTIONS_VERIFY_MOCK` | הכתובת היא שרת דמה (אסור בייצור) |

### 3.3 קבוע בקוד (`src/lib/corrections/config.js`)

יעד הפרסום והמקור הם `Otzaria/otzaria-library@main` — אותו ריפו וענף לקריאה ולכתיבה. גם כל
הכוונון קבוע ומיוצא כקבועים: `VERIFY_MAX_ATTEMPTS` (6), `VERIFY_MAX_TOTAL_SECONDS` (86400),
`VERIFY_TIMEOUT_MS` (20000), `VERIFY_BACKOFF_BASE_SECONDS` (30) ו-`_CAP_SECONDS` (3600),
`PUBLISH_MAX_REF_RETRIES` (3), `PUBLISH_MAX_ATTEMPTS` (5), `WORKER_BATCH_SIZE` (10),
`WORKER_CONCURRENCY` (2), `JOB_LEASE_SECONDS` (120), `HEARTBEAT_STALE_SECONDS` (300),
`MANUAL_CLAIM_MINUTES` (120), `SOURCE_CACHE_BYTES` (64MB), `SOURCE_HEAD_TTL_SECONDS` (30),
`DIFF_CONTEXT_LINES` (3 — "הרחב הקשר" בתצוגת המתנדב מוסיף עד 50). שינוי דורש שינוי קוד.

כללי בטיחות שנאכפים בקוד (`config.js`):

- בייצור (`NODE_ENV=production`): `CORRECTIONS_VERIFY_MOCK=1` משבית את השירות, מאפס את הסמכות
  ל-`none` ומכבה פרסום ודחייה אוטומטיים; כתובת `http://` או `localhost` נדחית.
- חוסר בסוד/כתובת/הגדרה = השירות כבוי עם סיבה מפורשת → כל דיווח לידני, בלי ניסיונות.
- יעד הפרסום אינו מגיע לעולם מהבקשה, מהתוכנה או מהשירות. הנתיב בקובץ נבדק מול שורשי הספרים
  (`isAllowedRepoPath`) — אין כתיבה ל-`.github/` או מחוץ ל-`<מקור>/ספרים/אוצריא/`.

## 4. ה-worker

### מתי הוא רץ

עבודה חדשה מריצה אצווה **מיד בסיום הבקשה שיצרה אותה**, דרך `after()` של Next: קליטת דיווח
שנכנס למערכת (לא `email_only`), ואישור/עריכה-ואישור/שליחה-מחדש של מתנדב. ההרצה best-effort —
כשל בה נרשם ללוג ואינו מכשיל את הבקשה. שתי אצוות אינן יכולות לרוץ במקביל באותו תהליך:
הכל עובר דרך `runBatchOnce()` ב-`src/lib/corrections/run-batch.js`.

התזמון הוא **רשת ביטחון בלבד** — ניסיונות חוזרים אחרי כשל, lease שפג, והמתנה לתשובת שירות
הבדיקה. מספיקה הרצה אחת כל 10 דקות:

```
*/10 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/corrections-worker >> /var/log/corrections-worker.log 2>&1
```

`scripts/corrections-worker.mjs` נשאר בריפו להרצה ידנית ולפיתוח (`--once` מריץ אצווה אחת
ויוצא). אין צורך בשירות pm2/systemd קבוע. משתני הסקריפט: `CRON_SECRET`, `CORRECTIONS_WORKER_URL`
(ברירת מחדל `http://127.0.0.1:3000`), `CORRECTIONS_WORKER_ID`; הוא נטען מ-`.env` אם קיים.

- **עמידות**: כל המצב ב-MongoDB. אין `setTimeout`/זיכרון/Promise אחרי תשובה. restart של האתר
  לא מאבד עבודה.
- **תפיסה**: `findOneAndUpdate` אטומי; lease (`JOB_LEASE_SECONDS`, 120; פרסום ×5)
  עם fence שעולה בכל תפיסה. worker שה-lease שלו פג ומנסה לסיים — נכשל בשקט.
- **משימה פעילה יחידה** לכל פעולה/דיווח: אינדקס ייחודי על `activeKey`.
- **מקביליות**: `WORKER_BATCH_SIZE` (10) משימות לאצווה, `WORKER_CONCURRENCY` (2) במקביל;
  אותו תהליך לא מריץ שתי אצוות במקביל. כמה תהליכים/שרתים במקביל — בטוח.
- **שבת/יו"ט**: ה-worker מושהה תמיד (דופק נרשם עם `paused: shabbat`), גם בהרצה שנוצרה מבקשה.

### Retries (שירות הבדיקה)

המסווג היחיד `classifyVerifyFailure` (`classify.js`):

| סיווג | מקרים | פעולה |
|---|---|---|
| transient | timeout, ECONNRESET/ECONNREFUSED/EAI_AGAIN, 408/429/500/502/503/504, `service_capacity` | backoff מעריכי עם jitter; `Retry-After` מכובד עד התקרה |
| permanent | כבוי/לא מוגדר/חסר סוד, 400/401/403/404/405/410/422, ENOTFOUND, TLS, JSON פגום, שדות חסרים, מזהים לא תואמים, api_version לא נתמך | ידני מיד |
| unknown | כל השאר (כולל 3xx — הפניות נחסמות) | ידני מיד |

גבולות (קבועים ב-`config.js`): `VERIFY_MAX_ATTEMPTS` (6), `VERIFY_MAX_TOTAL_SECONDS` (86400),
`VERIFY_BACKOFF_BASE_SECONDS` (30), `_CAP_SECONDS` (3600), `VERIFY_TIMEOUT_MS` (20000).
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
6. 422 (הענף התקדם) → חוזרים ל-1 (עד `PUBLISH_MAX_REF_RETRIES`). שינוי לא קשור באותו קובץ
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
דופק אחרון, גיל המשימה הוותיקה (בדיקה/פרסום), ספירות, ותיאור ההגדרות בלי סודות. `runtimeSwitches`
בתשובה מציין אילו מתגים מגיעים ממסך הניהול ולא מ-env.
`healthy=false` כאשר: אין דופק טרי (`HEARTBEAT_STALE_SECONDS`, 300) ויש עבודה ממתינה; האצווה
האחרונה נכשלה; יש פרסום בתוצאה לא ידועה; יש שגיאות הגדרה.

## 6. פעולות מפעיל

| מצב | מה עושים |
|---|---|
| `worker_not_running` | לוודא ש-`CRON_SECRET` זהה באתר ובתזמון, ושה-cron רץ; לאבחון: `node scripts/corrections-worker.mjs --once` |
| `worker_paused` | ה-worker מושהה בשבת/יו"ט; התור ממשיך בצאת השבת. אין צורך בפעולה |
| השירות מחזיר שגיאות רבות | להשהות מדף הניהול (הממתינים עוברים לידני). ביטול ההשהיה **לא** מחזיר לשירות דיווחים שבידי מתנדבים; שליחה מחודשת רק ידנית |
| `publish_unknown_pending` | בדרך כלל נפתר לבד באצווה הבאה (reconciliation). אם GitHub לא זמין — ממתין; אין לפרסם ידנית בינתיים |
| `publish.status=failed` | הדיווח חוזר לתור הידני עם `publish_failed`; האישור וההצעה נשמרים. לתקן את הסיבה (טוקן/הרשאות/branch protection) ולקחת את הדיווח מחדש |
| 401/403 מ-GitHub | ל-`DICTA_LIBRARY_GITHUB_TOKEN` חסרה הרשאת contents+pull_requests. הקוד לא עוקף branch protection — יש להשתמש ב-`pr` |
| מתנדב חדש | דף **ניהול ובריאות** → מתנדבי תיקונים → סימון "מתנדב" (מנהל ספרים/כללי). ההרשאה אינה נותנת גישה לפאנל הניהול |
| דיווח תקוע בבדיקה | מתנדב לוקח אותו (הבדיקה נפסלת), או השהיית השירות |

## 7. דיווחים שאינם נכנסים למערכת (`email_only`)

הזכאות נקבעת לפי ניתוב המייל הקיים (`getEmailRecipients` ב-`report-email.js`, דרך `reachesOtzariaInbox`)
ולפי אותו `source_folder` (CONTRACT §1.4):

- המייל מגיע לתיבת אוצריא (ראשי או עותק) → הדיווח נכנס למערכת; המייל למקור (אם יש) ממשיך במקביל.
- המייל לא מגיע לאוצריא (היום: `source_folder` שמכיל `sefaria`, בלי תלות ברישיות) → `state=email_only`:
  נשמר ונשלח במייל בדיוק כמו קודם, בלי תור ידני, בלי בדיקה ובלי פרסום. מופיע רק בלשונית "הכל".
- שינוי נמעני המייל ב-`getEmailRecipients` משנה אוטומטית גם את הזכאות. דיווחים ישנים שעוד לא עברו
  migration ממופים לפי אותו כלל (`NON_OTZARIA_SOURCE_FOLDER_RE` — חייב להישאר תואם, מכוסה בבדיקה).

## 8. Rollout

1. **אתר חדש, ידני** — לפרוס; להריץ `node scripts/migrate-corrections.mjs` (dry-run) ואז `--apply`.
   השירות כבוי, `publishMode=disabled`. לקוחות ישנים ממשיכים לעבוד (200, `duplicate`, `reportId`, `savedToDatabase`).
2. **worker** — להגדיר `CRON_SECRET` ולהוסיף cron כל 10 דקות. לוודא דופק בדף הבריאות.
   להגדיר `DICTA_LIBRARY_GITHUB_TOKEN` ולבחור `publishMode=pr` במסך הניהול כדי שאישורי מתנדבים ייצאו כ-PR.
3. **גרסת תוכנה** עם `schema_version: 2` — ההצעות המובנות מופיעות בממשק.
4. **חיבור השירות** — `CORRECTIONS_VERIFY_ENABLED/URL/SECRET`, סמכות `technical_only`. כל אישור עדיין עובר למתנדב.
5. **אוטומציה** — רק אחרי תקופת מעקב: `CORRECTIONS_VERIFY_AUTHORITY=technical_and_content`,
   `CORRECTIONS_VERIFY_REQUESTED_SCOPE=technical_and_content`, ו"פרסום אוטומטי" במסך הניהול (עדיין PR).

שלבים 1–3 שימושיים בלי 4–5.

## 9. Rollback

- **קוד**: פריסת הגרסה הקודמת. כל השדות החדשים אופציונליים ומתעלמים מהם בקוד הישן; `status` הישן
  מסונכרן, ולכן הדיווחים נראים כרגיל. אין לבצע migration הפוכה — **אין למחוק** דיווחים, החלטות, חבילות
  שינוי, ניסיונות פרסום או יומן (`CorrectionEvent`).
- **הקוד הישן מחזיר 500 כש-SMTP נכשל** — לקוח ישן יחזור וינסה; זו ההתנהגות שהייתה.
- **חזרה לגרסה החדשה אחרי rollback**: דיווחים שנקלטו בקוד הישן (בלי `state`) משודרגים בעצלות בפתיחה/לקיחה,
  או ב-`scripts/migrate-corrections.mjs --apply` (אידמפוטנטי).
- **עצירת אוטומציה בלי rollback**: מדף הניהול — השהיית השירות ו/או `publishMode=disabled`
  (אישורים נשמרים כ"אושר וממתין לפרסום" ויפורסמו כשיופעל מחדש).
- עצירת ה-worker: ביטול ה-cron. משימות פתוחות ממשיכות מאותו מקום בהרצה הבאה.

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
