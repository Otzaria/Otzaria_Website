# מתווך הבדיקות של תוספי שירות

תהליך Node שרץ על שרת בדיקה נפרד, מושך משימות מ־`/api/service-plugins/worker/*` באתר, ומריץ עליהן את צינור הבדיקה של תוספי שירות: אימות hashes, ClamAV, השוואה ל־GitHub Release, חילוץ סטטי ב־7-Zip, אימות אישור בנייה ב־`gh`, VirusTotal (אופציונלי), הכנת מקור, סינון קבוע, וסקירה אחת של Claude Code בכלים מוגבלים. ההחלטה (`0`/`1`) והדוח נשלחים לאתר, שמפרסם רק אם כל הקבלות שייכות לאותה הגשה.

- אפס תלויות זמן ריצה. Node 22.12 ומעלה.
- המתווך מייבא את `src/lib/servicePlugins/policy.js` בנתיב יחסי, ולכן רץ מתוך עותק של מאגר האתר (אין צורך ב־`npm install` של האתר).
- כל כלי חיצוני מופעל כמערך ארגומנטים, בלי shell, עם סביבה מינימלית ומפורשת. סוד המתווך אינו עובר לאף תהליך בן. `GH_TOKEN` עובר רק ל־`gh`, ואישורי Claude רק ל־`claude`.

## התקנה (Debian/Ubuntu)

```bash
# משתמש ייעודי
sudo useradd --system --home /var/lib/otzaria-broker/home --shell /usr/sbin/nologin otzaria-broker

# ClamAV + עדכון חתימות
sudo apt install clamav clamav-freshclam
sudo systemctl enable --now clamav-freshclam

# 7-Zip רשמי (7zz, גרסה 23 ומעלה). p7zip 16.02 ישן ואינו חוסם קישורים מסוכנים — לא להשתמש בו.
sudo apt install 7zip            # Debian 12 / Ubuntu 24.04: מתקין את 7zz

# בידוד לכלים שמפענחים קלט עוין
sudo apt install bubblewrap

# GitHub CLI (מאגר apt הרשמי: https://cli.github.com) — נדרשת גרסה עם `gh attestation verify`
sudo apt install gh

# Claude Code — מותקן עבור המשתמש הייעודי
sudo -u otzaria-broker -H bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
```

עותק המאגר: `/opt/otzaria-website` (קריאה בלבד למשתמש `otzaria-broker`). כל פריסה של האתר (`scripts/deploy-web.sh`) מעבירה את העותק הזה לקומיט שנפרס ומפעילה מחדש את `otzaria-service-broker` אם הוא רץ; כשל בשלב הזה מוצג כאזהרה ואינו מכשיל את הפריסה. יחידת systemd לדוגמה: [`deploy/service-plugin-broker.service`](deploy/service-plugin-broker.service). הסודות (`SERVICE_PLUGIN_WORKER_SECRET`, `GH_TOKEN`, `ANTHROPIC_API_KEY`, `VT_API_KEY`) נשמרים כקובץ לכל סוד ב־`/etc/otzaria/credentials/` (בעלות root, `0600`) ונטענים ב־`LoadCredential=`: systemd חושף אותם רק לתהליך המתווך תחת `$CREDENTIALS_DIRECTORY`, לא בסביבה. שאר ההגדרות בקובץ `/etc/otzaria/service-broker.env`.

```bash
sudo install -d -m 0700 /etc/otzaria/credentials
sudo install -m 0600 /dev/stdin /etc/otzaria/credentials/SERVICE_PLUGIN_WORKER_SECRET   # הדבקה ואז Ctrl-D
```

```bash
sudo cp deploy/service-plugin-broker.service /etc/systemd/system/otzaria-service-broker.service
sudo systemctl daemon-reload && sudo systemctl enable --now otzaria-service-broker
journalctl -u otzaria-service-broker -f
```

## משתני סביבה

| משתנה | חובה | תיאור |
|---|---|---|
| `SERVICE_BROKER_SITE_URL` | כן | כתובת האתר, למשל `https://otzaria.org` (http רק ל־localhost) |
| `SERVICE_PLUGIN_WORKER_SECRET` | כן | אותו סוד שמוגדר באתר; אותה בדיקת חוזק כמו באתר: 43–1024 תווי ASCII מודפסים, לפחות 8 שונים |
| `SERVICE_BROKER_DATA_DIR` | כן | נתיב מוחלט לתיקיית העבודה (`jobs/` לכלים, `private/` לסקירה ולתוצאת Claude, `snapshots/`) |
| `CLAUDE_AUTH_MODE` | כן | `api_key` או `subscription` — אין ברירת מחדל; ראו בהמשך |
| `ANTHROPIC_API_KEY` | ב־`api_key` | מפתח API; מועבר רק ל־Claude ורק במצב זה |
| `SERVICE_BROKER_ID` | לא | מזהה הבודק בתור (ברירת מחדל: hostname-pid) |
| `CLAUDE_BIN` / `CLAMSCAN_BIN` / `SEVEN_ZIP_BIN` / `GH_BIN` | לא | נתיבי הכלים (ברירת מחדל: `claude`, `clamscan`, `7z`, `gh`). מומלץ `SEVEN_ZIP_BIN=7zz` |
| `GH_TOKEN` | מומלץ | טוקן GitHub לקריאה בלבד (ללא הרשאות מאגר) עבור `gh attestation verify`; מועבר רק ל־`gh` |
| `VT_API_KEY` | לא | מפעיל את VirusTotal. רק אחרי אישור תנאי השימוש ורישיון מתאים |
| `SANDBOX_WRAPPER` | ב־`NODE_ENV=production` | תבנית בידוד ל־7-Zip ול־ClamAV (מערך JSON או מילים מופרדות ברווח) עם `{in}` ו־`{out}`; ראו בהמשך. `unsafe-none` מריץ בלי בידוד במפורש (אזהרה בולטת ביומן) |
| `CLAUDE_CONFIG_DIR` | לא | תיקיית הגדרות חלופית ל־Claude |
| `CREDENTIALS_DIRECTORY` | — | נקבע בידי systemd (`LoadCredential=`). קובץ בשם הסוד שם קודם למשתנה הסביבה בשם זה |

המתווך מסרב לעלות (קוד יציאה 78) כשחסר משתנה חובה, כש־`NODE_ENV=production` בלי `SANDBOX_WRAPPER`, כשנמצא `CLAUDE.md` / `.claude` / `.mcp.json` באחת מתיקיות האב של תיקיית הנתונים, או (במצב `subscription`) כש־`~/.claude/settings.json` של המשתמש הייעודי מגדיר `hooks`, `permissions.allow` או `additionalDirectories` — כל אלה היו נטענים לבודק. בנוסף, מיד לפני כל הפעלה של Claude נבדק שתיקיית הסקירה וכל תיקיות האב שלה עד תיקיית הנתונים מכילות רק שמות צפויים.

## בחירת `CLAUDE_AUTH_MODE`

| מצב | מה קורה | הערות |
|---|---|---|
| `api_key` | `claude --bare` עם `ANTHROPIC_API_KEY`. `--bare` מדלג על הגדרות, hooks, CLAUDE.md ו־OAuth | המצב המתאים לשירות שפועל עבור אחרים |
| `subscription` | בלי `--bare`, עם `--setting-sources user` ו־`--settings '{"disableAllHooks":true}'`; ההתחברות היא OAuth שנשמר ב־HOME של המשתמש הייעודי (`claude` → `/login` פעם אחת) | `~/.claude/settings.json` של המשתמש הייעודי חייב להיות מינימלי: בלי hooks, בלי `permissions.allow`, בלי `additionalDirectories` ובלי שרתי MCP (נבדק בעלייה) |

**לפני בחירת `subscription`:** לפי [עמוד המשפט והציות של Anthropic](https://code.claude.com/docs/en/legal-and-compliance.md), התחברות OAuth של מנוי Pro/Max מיועדת לשימוש אישי רגיל, ושירותים שפועלים עבור אחרים צריכים להשתמש במפתחות API. הבודק סורק הגשות של מפתחים חיצוניים, ולכן יש לוודא שהשימוש המתוכנן תואם את תנאי המנוי לפני הפעלה. אין ברירת מחדל כדי שההחלטה תתקבל במודע.

## בידוד (`SANDBOX_WRAPPER`)

7-Zip ו־ClamAV מפענחים קבצים עוינים, ולכן חייבים לרוץ בלי רשת ועם גישה רק לקלט ולפלט של ההפעלה הנוכחית. `SANDBOX_WRAPPER` הוא תבנית: בכל הפעלה `{in}` מוחלף בקלט (הארכיון, או תיקיית הקבצים ל־ClamAV) ו־`{out}` בתיקיית הפלט שלה בלבד (תיקיית החילוץ, או תיקייה ריקה). תוצאת Claude ותיקיית הסקירה נמצאות ב־`private/`, שלעולם אינה נקשרת לבידוד, כך שכלי מפענח שנפרץ אינו יכול לזייף אותן או לשתול הגדרות ל־Claude.

**bubblewrap (מומלץ; `--size` דורש bubblewrap 0.10 ומעלה — בגרסה ישנה יותר יש להשמיט את `--size` ואת ערכו):**

```bash
SANDBOX_WRAPPER='["bwrap","--unshare-all","--die-with-parent","--new-session","--clearenv","--setenv","PATH","/usr/bin","--setenv","LANG","C.UTF-8","--setenv","TMPDIR","/tmp","--ro-bind","/usr","/usr","--symlink","usr/lib","/lib","--symlink","usr/lib64","/lib64","--symlink","usr/bin","/bin","--ro-bind","/etc/ld.so.cache","/etc/ld.so.cache","--ro-bind","/var/lib/clamav","/var/lib/clamav","--proc","/proc","--dev","/dev","--size","1073741824","--tmpfs","/tmp","--ro-bind","{in}","{in}","--bind","{out}","{out}","--"]'
SEVEN_ZIP_BIN=/usr/bin/7zz
CLAMSCAN_BIN=/usr/bin/clamscan
```

- `--clearenv` מוחק את הסביבה בתוך הבידוד, ולכן נתיבי הכלים מוחלטים ו־`PATH`/`TMPDIR` נקבעים מחדש. `--new-session` עם `--die-with-parent`: תהליך שבורח מקבוצת התהליכים נהרג כש־bwrap נהרג.
- `--size` מגביל את ה־tmpfs של `/tmp`. הפלט עצמו נכתב ל־`{out}` שעל הדיסק: המתווך מודד אותו כל חצי שנייה בזמן `7z x` ועוצר את החילוץ בחריגה מהתקרה, כי הגודל המוצהר בארכיון (למשל ISIZE של gzip) אינו אמין.
- תבנית בלי `{in}`/`{out}` עדיין מתקבלת, עם אזהרה: כל ההפעלות מקבלות אז את אותן הרשאות קבצים.
- **לא מספיק:** `unshare --net --map-root-user --` מנתק רק את הרשת; הכלי עדיין יכול לכתוב לכל מה שמשתמש המתווך יכול, כולל `private/` והגדרות Claude. אין להשתמש בו לבדו.
- ב־Ubuntu 24.04 מרחבי משתמש לא מורשים מוגבלים ב־AppArmor; ל־bwrap יש פרופיל מאושר.

**משתמשי מערכת נפרדים (מומלץ, לא נבדק בסביבת הפיתוח):** הבידוד חזק יותר כשהכלים ו־Claude רצים כ־uid שונים מהמתווך — למשל משתמש `otzaria-scan` לכלים ו־`otzaria-claude` ל־Claude, בלי הרשאת קריאה ל־`private/` של משימות אחרות ולתיקיית הסודות. אפשר לעשות זאת ב־`systemd-run --uid=<user> --pipe --wait --collect --quiet --property=PrivateNetwork=yes --` כחלק מהתבנית (דורש כלל polkit שמתיר למשתמש `otzaria-broker` להפעיל יחידות זמניות, ותיקיות פלט בבעלות קבוצה משותפת), ול־Claude דרך `CLAUDE_BIN` שמצביע על סקריפט root-owned שמפעיל את `claude` באותו אופן עם `--same-dir`. יש לבדוק בשרת היעד שהבעלות על קבצים מחולצים ושגישת הקריאה של המתווך לפלט נשמרות.

## צינור הבדיקה בקצרה

| שלב | עושה | כישלון |
|---|---|---|
| `hashes` | הורדת הקבצים מהאתר ואימות גודל ו־SHA-256 | אי־התאמה → טיפול תפעולי |
| `clamav` | `clamscan --no-summary --stdout ... -- <files>` | חתימה → דחייה; סריקה חלקית/שגיאה → תפעולי |
| `release` | הורדת קובץ ה־Release (https, github.com ו־CDN של GitHub בלבד) והשוואת SHA-256 | שונה/חסר → דחייה |
| `extract` | `7z l -slt` (בדיקת מגבלות) ואז `7z x -- <installer>` עם מדידת הפלט תוך כדי, עד 3 שכבות מקוננות; השוואת התוסף הכלול לתוסף העצמאי | לא ניתן לחילוץ / לא נמצא / שונה / פלט מעל התקרה → דחייה (Inno Setup ו־WiX Burn מזוהים בדוח) |
| `attestation` | `gh attestation verify --repo <repo> --format json --deny-self-hosted-runners -- <file>` ובדיקת digest, מאגר+commit, runner ונתיב workflow | אין אישור תואם → דחייה; gh לא מחובר → תפעולי |
| `virustotal` | רק עם `VT_API_KEY` והסכמת המפתח: hash, העלאה, המתנה מוגבלת | malicious/suspicious → דחייה; 429 → המתנה מקומית ואז כשל זמני |
| `source` | עץ ה־commit (`git/trees?recursive=1`) ו־tarball מ־`api.github.com` (בלי git), קורא tar.gz עצמאי עם מגבלות. הארכיון חייב להיות זהה לעץ: כל blob קיים, git blob SHA-1 תואם לכל קובץ, בלי submodule, בלי מצביע Git LFS ובלי עץ קטוע (GitHub מכבד `export-ignore`/`export-subst` בארכיון, בעוד `actions/checkout` בונה את העץ המלא). UTF-16 עם BOM מפוענח לטקסט; קבצים בשמות מספריים `files/<n>.txt`; `INDEX.txt` ו־`DIFF.txt`. כל workflow מאישור הבנייה חייב להיות קובץ טקסט במקור | חריגה ממגבלות, אי־התאמה לעץ, התנגשות נתיבים ברישיות/Unicode, קובץ קוד/בנייה/מניפסט בינארי, או workflow חסר → דחייה ("אינה אישור חלקי") |
| `prescan` | `HOTSPOTS.txt` דטרמיניסטי; `.gitattributes`, `.gitmodules` ו־`.lfsconfig` תמיד ברשימה | רשימה מעבר ל־100,000 שורות → דחייה (לא קיצור שקט); אחרת אינו מחליט דבר |
| `claude` | ריצה אחת של Claude Code בתיקייה שמכילה רק את קובצי הסקירה | ראו בהמשך |

לכל שלב נשלחת קבלה (`checkpoint`) עם digest ההגשה, גם לשלב שדחה (`data: {rejected: true, reason}`, לפני שליחת התוצאה). בתפיסה חוזרת של אותה הגשה מדולגים שלבים שיש להם קבלה, וקבלת דחייה מחזירה מיד החלטה 0; **קבלת `claude` קיימת לעולם אינה מריצה את Claude שוב**. תוצאת Claude נשמרת גם מקומית (`private/<id>/claude-result.json`, חתומה ב־HMAC מסוד המתווך) לפני שליחת הקבלה, כך שניתוק בזמן השליחה אינו מצריך סקירה חדשה. חתימה שגויה היא טיפול תפעולי ולא הרצה חוזרת שקטה (גם החלפת הסוד בזמן שמשימה ממתינה תגרום לכך). שדות המשימה נבדקים בתחילת הצינור באותם מאמתים של האתר; משימה לא תקינה → טיפול תפעולי.

## הערות תפעול

- **מכסת Claude:** אירוע `rate_limit_event` עם `status: "rejected"` מדווח כ־`quota` עם מועד האיפוס. האתר משהה את כל תור Claude עד המועד ועוד דקה (או 6 שעות ודקה כשאין מועד אמין). המתווך מכבד `204` עם `Retry-After` ואינו מנסה בינתיים.
- **`needs_operator`:** נדרש טיפול של אחראי השרת — Claude לא מחובר או חסום (`authentication_failed`, `billing_error` וכו'), חריגת הקשר, `gh` לא מחובר, ClamAV/7-Zip חסרים, סריקה חלקית, תצורת כלים לא מוגבלת (כולל מצב הרשאות שאינו `dontAsk` באירוע ה־init), קובץ לא צפוי בתיקיית הסקירה, או תוצאת Claude מקומית שאינה מאומתת. אחרי התיקון המנהל לוחץ "נסה שוב" (`retry`).
- **מגבלת קצב של GitHub:** 429, או 403 עם `x-ratelimit-remaining: 0`, בהורדת העץ או ה־tarball → המתנה מקומית עד `x-ratelimit-reset` (עד שעה, עד 3 פעמים) לפני כשל זמני, כדי לא לבזבז את ניסיונות השרת.
- **שומר תקיעה:** 10 דקות בלי שום שורת stdout או פלט stderr מ־Claude → SIGTERM לקבוצת התהליכים, SIGKILL לקבוצה אחרי 10 שניות (גם אם המנהיג כבר יצא), וכשל זמני `claude_stalled`. החלטה תקינה שכבר התקבלה לפני התקיעה נשמרת ואינה נמחקת. אין מגבלת זמן כוללת: סקירה ארוכה שממשיכה להפיק אירועים לא נעצרת.
- **שבת ויום טוב:** האתר מחזיר 503 לכל הבקשות. המתווך ממשיך לנסות בהמתנה הולכת וגדלה ואינו קורס. משימה שרצה בכניסת שבת תאבד את ה־lease אחרי 100 שניות בלי חידוש, תיעצר, ותיתפס שוב אחרי צאת השבת. אם Claude כבר סיים, התוצאה המקומית משמשת שוב.
- **Heartbeat:** כל 25 שניות לאורך כל המשימה. `409 lease_lost` או 100 שניות בלי חידוש → עצירת המשימה והתהליכים, בלי לשלוח תוצאה.
- **SIGTERM/SIGINT:** עצירה מסודרת; תהליכי בן נהרגים, וה־lease פג מעצמו.
- **יומנים:** שורות JSON ב־stdout (journald), ויומן שלבים לכל משימה ב־`private/<id>/stages.log`, כולל `session_id` של Claude וניסיונות גישה שנחסמו.
- **ניקוי:** פעם בשעה המתווך מבקש מהאתר את רשימת ההגשות לשמירה ומוחק תיקיות עבודה ותמונות מקור אחרות. תמונת המקור של ההגשה המאושרת נשמרת לטובת ה־DIFF הבא; כשהיא חסרה, הסקירה מלאה והדבר מצוין בדוח.

## מגבלות אבטחה ידועות

- Claude מקבל את הכלים `Read`/`Grep`/`Glob` ב־`--tools` **בלי** `--allowedTools`: אישור מראש של `Read` חל על כל נתיב, בעוד `--permission-mode dontAsk` דוחה בלי לשאול קריאה מחוץ לתיקיית העבודה. המתווך מוודא באירוע ה־init שהמצב הוא `dontAsk`. ניסיונות שנחסמו (`permission_denials`) נרשמים ביומן ומצורפים לדוח, והחלטה 1 עם ניסיון גישה מחוץ לתיקיית הסקירה הופכת ל־0. זו עדיין אכיפה של Claude Code עצמו, ו־Claude רץ באותו משתמש מערכת כמו המתווך; המתווך גם חוסם דוח שמכיל ערך של סוד מוכר או מחרוזת בצורת טוקן (`sk-ant-…`, `ghp_…`). להקשחה נוספת מומלץ להריץ את Claude כמשתמש מערכת נפרד בלי גישה לתיקיית הסודות (ראו "משתמשי מערכת נפרדים").
- אי אפשר לשלול לחלוטין השפעה של טקסט בקוד הנבדק על המודל; זו מגבלה מוצהרת של הסקירה.

## בדיקות

```bash
npm run test:service-broker      # משורש המאגר
```

הבדיקות משתמשות בתסריטי Node מזויפים במקום `clamscan`, `7z`, `gh` ו־`claude`, ובשרת API מזויף. הן אינן דורשות את הכלים האמיתיים או רשת.
