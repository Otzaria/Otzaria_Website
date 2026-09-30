# דף הכינויים — תפעול

דף `/library/acronyms` קורא את הכינויים מהפורק [Otzaria/SeforimAcronymizer](https://github.com/Otzaria/SeforimAcronymizer)
(`data/acronymizer.sql` ב-`master`). כל סל שמשתמש מחובר שולח נפתח שם כ-PR נפרד בענף `site/acronyms-<id>`,
והמיזוג בפורק הוא האישור. Mongo שומר רק את הסלים ואת מצב ה-PR שלהם (`AcronymChangeSet`).
הקוד: `src/lib/acronyms/`.

## דרישות

- `DICTA_LIBRARY_GITHUB_TOKEN` — אותו טוקן של תיקוני הספרים. הוא צריך הרשאת כתיבה (contents + pull requests)
  ל-`Otzaria/SeforimAcronymizer`; בטוקן fine-grained יש להוסיף את הריפו לרשימה.
- `ACRONYMS_SIGNOFF` (אופציונלי) — שורת ה-DCO לקומיטים, למשל `Otzaria Bot <1+bot@users.noreply.github.com>`.
  בלעדיו נלקח המשתמש של הטוקן מ-`GET /user`. הפורק דוחה PR שקומיט בו חסר `Signed-off-by`.

## cron

הקובץ בפורק ממוין לפי id, ולכן כל שני PR-ים שמוסיפים שורות מתנגשים. אחרי כל מיזוג ה-cron בונה מחדש מעל
`master` כל PR פתוח של האתר (force-push לענף שלו), ומעדכן סלים שמוזגו או נסגרו:

```
*/10 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/acronyms-sync >> /var/log/acronyms-sync.log 2>&1
```

ענף שמישהו דחף אליו ידנית מסומן `modified` ואינו נבנה מחדש.
