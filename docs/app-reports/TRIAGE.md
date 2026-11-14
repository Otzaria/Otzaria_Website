# בדיקה אוטומטית של תקיעות וקריסות

דיווח מסוג תקיעה או קריסה של אוצריא (`isHangReport`/`isCrashReport`) לא נפתח מיד ב-GitHub. הוא נשמר במצב
`triage.state: pending`, ושירות בדיקה חיצוני מחליט אם לפתוח אותו. השירות נמצא במאגר הפרטי
`Otzaria/app-report-triage`. כל שאר הדיווחים נפתחים מיד, כמו קודם. בלי `APP_REPORTS_TRIAGE_SECRET` גם תקיעות
וקריסות נפתחות מיד.

התוכנה לא ממתינה להחלטה: היא מקבלת מיד `issuePending: true` בלי מספר issue, ומציגה "הדיווח נקלט".

השירות רק מחזיר החלטה. **כל הכתיבה ב-GitHub נעשית באתר**, במפתח הבוט:
- תגובת הפענוח, פעם אחת לכל דיווח;
- השיוך והסגירה. בשבילם חשבון הבוט צריך הרשאת Triage במאגר.

אם GitHub נכשל, `triage.followUp` נשאר `pending`, וה-cron משלים. השירות לא צריך הרשאת כתיבה ב-GitHub.

## הזרימה

1. **קליטה:** `triage = {state: 'pending', deadline: now + APP_REPORTS_TRIAGE_WAIT_MINUTES}`. האתר שולח `repository_dispatch` (`event_type: app-report`,
   `client_payload.report`) כדי להעיר את השירות. כשל ב-dispatch לא מעכב את הקליטה, כי השירות מושך את התור גם בעצמו.
2. **ההחלטה:** השירות קורא את הדיווח מ-Mongo, מפענח ובודק, ושולח `POST /api/app-reports/triage/{reportId}`.
   - `open`: האתר מפרסם מיד. הוא פותח issue חדש, או מגיב על issue פתוח עם אותה חתימה. אחר כך הוא כותב בו את
     הפענוח (`summary`) ומשייך אותו ל-`APP_REPORTS_TRIAGE_ASSIGNEE`.
   - `hold`: לא נפתח. ההחלטה והפענוח נשמרים בדיווח ומוצגים בדף הניהול. עם `linkIssue` הדיווח מקושר
     לכפילות (כמו צירוף שקט): הסנכרון מעדכן את מצבה, ומדווח עם מייל מקבל מייל כשהיא נסגרת.
   - `questions`: נשלחים למדווח במייל עם כתובת המענה של הדיווח, אם השאיר מייל ולא הסיר את עצמו. אם יש issue,
     נכתבת בו גם תגובה כמו בפנייה ידנית.
   - `awaitingReply` (רק עם `hold`): הדיווח מחכה לתשובה. כשאי אפשר לשאול בפועל, ההחלטה הופכת ל-`open`:
     אין מייל, המדווח הסיר את עצמו, `APP_REPORTS_REPLY_DOMAIN` לא מוגדר, או שהמייל נכשל.
3. **תשובת המדווח** על דיווח שלא נפתח, או שעוד ממתין, נשמרת עם `issueComment: 'triage'` ולא מתפרסמת.
   - דיווח שלא נפתח חוזר ל-`pending` עם deadline חדש, וקישור הכפילות שלו מתבטל.
   - תשובה שהגיעה בזמן שהבדיקה רצה מפעילה בדיקה חוזרת אחרי `hold`.
   - כשהדיווח נפתח בכל דרך, כולל `timeout`, התשובות האלה עוברות ל-`pending` ומתפרסמות ב-issue.
   - אחרי 5 בדיקות לאותו דיווח, תשובה נוספת כבר לא מפעילה בדיקה, והדיווח נפתח בסנכרון הבא.
4. **אם השירות לא ענה:** אחרי ה-deadline ה-cron (`app-reports-sync`, פעם בשעה) מפרסם כרגיל, ומסמן
   `triage.state: timeout`. החלטה שמגיעה אחר כך חלה על ה-issue שנפתח, פעם אחת (`lateDecidedAt`):
   - האתר כותב את הפענוח.
   - ב-`open` הוא משייך.
   - ב-`hold` הוא סוגר:
     - `fixed` כמתוקן;
     - `duplicate` ככפול של `linkIssue`;
     - `external` ו-`no_info` כלא רלוונטי;
     - `fix_pending` נשאר פתוח.
   - issue שנפתח ידנית (`forced`), או issue משותף לדיווחים אחרים, מקבל פענוח בלבד.
5. **"פתח כרטיס בכל זאת"** בדף הדיווח (`POST /api/app-reports/admin/{reportId}/publish`) פותח דיווח שלא נפתח
   או שעוד ממתין, ומסמן אותו `forced`.

מצבים: `pending` → `opened` | `held` | `timeout` | `forced`. ממצב `held` דיווח חוזר ל-`pending` רק בבדיקה חוזרת.

דיווח `held`:
- לא משמש בסיס לאיחוד לפי חתימה, גם כשהוא מקושר לכפילות.
- הצרופות שלו לא נמחקות בניקוי של דיווחים סגורים, כי הן נדרשות לבדיקה חוזרת.

## החוזה מול השירות

כל הנתיבים: `Authorization: Bearer <APP_REPORTS_TRIAGE_SECRET>`, ותשובות JSON עם `no-store`.
- `503`: הסוד לא מוגדר באתר. `401`: סוד שגוי. שני אלה הם בעיית תצורה.
- `5xx` אחר, וגם `503` של שער השבת: תקלה זמנית, והשירות ינסה שוב.

| נתיב | תשובה |
|---|---|
| `GET /api/app-reports/triage` | `{items: [{reportId, requestedAt, deadline, runs}], late: [{reportId, issueNumber, merged}]}`. `items` הם עד 50 הדיווחים הממתינים, מהוותיק לחדש. `late` הם דיווחים שנפתחו בלי החלטה (`timeout` או `forced`) בשלושת הימים האחרונים ועוד לא קיבלו החלטה מאוחרת. |
| `GET /api/app-reports/triage/{reportId}` | `{reportId, state, issuePending, issueNumber, issueUrl, merged}`. בדיווח `held` הערכים `issueNumber` ו-`issueUrl` הם `null`, גם כשהוא מקושר לכפילות. `404` אם הדיווח לא קיים. |
| `POST /api/app-reports/triage/{reportId}` | גוף ההחלטה (טבלה למטה). `200`: המצב אחרי ההחלטה, ועוד `questionsSent`. ב-`hold` מוחזר גם `retriage`. בהחלטה על דיווח שכבר נפתח מוחזר `late: true`. `409`: כבר הוחלט, והתשובה כוללת את המצב. `422`: גוף לא תקין (`field`). `404`: הדיווח לא קיים. |

| שדה | |
|---|---|
| `action` | `open` או `hold` |
| `verdict` | `fixed`, `fix_pending`, `duplicate`, `external`, `no_info`, `ask_reporter`, `needs_human`, `needs_instrumentation` |
| `confidence` | `high`, `medium`, `low` |
| `summary` | הפענוח ב-Markdown, עד 20,000 תווים. מוצג בדף הניהול, ונכתב בתגובה ב-issue. |
| `questions` | עד 5 שאלות, כל אחת עד 500 תווים (אופציונלי) |
| `linkIssue` | מספר issue של הכפילות או התיקון, רק עם `hold` (אופציונלי) |
| `awaitingReply` | רק עם `hold` ועם שאלות (אופציונלי) |
| `note` | הערה קצרה לשורת הסיכום שבתחתית התגובה, עד 500 תווים (אופציונלי) |

`open` ב-`200` בלי `issueNumber` אומר ש-GitHub נכשל. ה-cron יפרסם את הדיווח וישלים את הפענוח ואת השיוך.

## משתני סביבה

| משתנה | |
|---|---|
| `APP_REPORTS_TRIAGE_SECRET` | מפעיל את הבדיקה ומאמת את השירות. |
| `APP_REPORTS_TRIAGE_DISPATCH_TOKEN` | אופציונלי. ברירת המחדל היא `DICTA_LIBRARY_GITHUB_TOKEN`, שיש לו הרשאת כתיבה על מאגר השירות. טוקן אחר כאן גובר עליו, ו-`off` מכבה את ההערה. |
| `APP_REPORTS_TRIAGE_DISPATCH_REPO` | ברירת מחדל `Otzaria/app-report-triage`. |
| `APP_REPORTS_TRIAGE_ASSIGNEE` | למי לשייך issue שנפתח אחרי בדיקה. ברירת מחדל `palmoni5`. |
| `APP_REPORTS_TRIAGE_WAIT_MINUTES` | כמה זמן לחכות להחלטה לפני פתיחה רגילה. ברירת מחדל 60. |

## העברת השירות לשרת האתר

השירות לא תלוי במחשב שעליו הוא רץ. הוא צריך:
- גישה ל-Mongo, לקריאה בלבד;
- את הסוד;
- גישת קריאה ל-GitHub (קוד, issues ו-releases), לניתוח.

יש שתי דרכים:
- **runner במחשב אחר:** מתקינים אותו שם ומשאירים את ה-dispatch.
- **על השרת עצמו, בלי runner:** קובעים `APP_REPORTS_TRIAGE_DISPATCH_TOKEN=off` ומריצים את השירות מ-cron במצב
  משיכה (`poll`).
