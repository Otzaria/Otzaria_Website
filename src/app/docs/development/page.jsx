import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import DocsArticle from '@/components/docs/DocsArticle'
import DocsBreadcrumbs from '@/components/docs/DocsBreadcrumbs'
import DocsCallout from '@/components/docs/DocsCallout'
import DocsCodeBlock from '@/components/docs/DocsCodeBlock'
import DocsHelpCard from '@/components/docs/DocsHelpCard'
import DocsHero from '@/components/docs/DocsHero'
import DocsLayout from '@/components/docs/DocsLayout'
import DocsSection from '@/components/docs/DocsSection'
import { DocsStep, DocsSteps } from '@/components/docs/DocsSteps'
import { PROSE } from '@/components/docs/proseClasses'
import Button from '@/components/ui/Button'

const tocItems = [
  { href: '#intro', label: 'הקדמה' },
  { href: '#requirements', label: 'דרישות מערכת' },
  { href: '#git-install', label: 'התקנת Git' },
  { href: '#flutter-install', label: 'התקנת Flutter' },
  { href: '#editor-install', label: 'התקנת עורך קוד' },
  { href: '#fork', label: 'יצירת Fork' },
  { href: '#clone', label: 'הורדת המאגר' },
  { href: '#editing', label: 'עריכת הקוד' },
  { href: '#testing', label: 'בדיקה ובנייה' }
]

/** קישור חיצוני בתוך הטקסט */
function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={PROSE.link}>
      {children}
    </a>
  )
}

// עיצוב כיוון א': אותה מעטפת כמו דפי הוויקי (DocsLayout). השלבים — רשימה ממוספרת (DocsSteps).
// הנוסח — ללא שינוי.
export default function DevelopmentTutorialPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <DocsLayout
          titleId="development-title"
          breadcrumbs={
            <DocsBreadcrumbs
              items={[
                { label: 'בית', href: '/', prefetch: false },
                { label: 'מדריכים', href: '/docs' },
                { label: 'מדריך פיתוח' }
              ]}
            />
          }
          hero={
            <DocsHero
              id="development-title"
              icon="code"
              title="רוצה לערוך את תוכנת אוצריא?"
              subtitle="עכשיו זה אפשרי! גם ללא ידע מעמיק בתכנות"
            />
          }
          toc={{ title: 'תוכן עניינים', items: tocItems }}
          after={
            <>
              <DocsCallout tone="success" icon="celebration" className="mt-8">
                <p><strong>כל הכבוד!</strong> עכשיו אתם מפתחים של אוצריא! המשיכו ללמוד ולשפר את התוכנה.</p>
              </DocsCallout>

              <DocsHelpCard
                id="development-help"
                title="זקוק לעזרה?"
                action={
                  <Button href="https://github.com/otzaria/otzaria" external icon="open_in_new">
                    למאגר ב-GitHub
                  </Button>
                }
              >
                הצטרפו לקהילה ב-GitHub או שאלו שאלות בפורומים.
              </DocsHelpCard>
            </>
          }
        >
          <DocsArticle>
            <DocsSection id="intro" icon="rocket_launch" title="הקדמה">
              <p><strong className={PROSE.strong}>גם אתה רוצה להוסיף שיפורים לאוצריא?</strong> אבל אין לך כח לחכות עד שזה יתווסף, אם בכלל...</p>
              <p><strong className={PROSE.strong}>אז תקשיב למשפט הבא:</strong> אתה בעצמך תעשה את זה, בצורה שתרצה ובאופן שהכי מוצא חן בעיניך!!</p>
              <p>נשמע לך לא אפשרי? אתה טועה! תיכף תראה כמה זה אפשרי!</p>
              <p>תוכל לעשות הכל באמצעות בקשה פשוטה בשפה שלך לסוכן AI שיעשה כל מה שרק תבקש ממנו!!</p>
              <DocsCallout tone="tip" icon="tips_and_updates">
                <p><strong>טיפ חשוב:</strong> תתחילו מדברים קטנים ממש ממש, לאט לאט מתקדמים בחיים, לא קופצים מידי גבוה על ההתחלה.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="requirements" icon="checklist" title="דרישות מערכת">
              <p>לפני שמתחילים, וודאו שיש לכם:</p>
              <ul className={PROSE.ul}>
                <li><strong className={PROSE.strong}>פרופיל בגיטהאב</strong> - אם אין לכם, צרו אחד ב-<ExternalLink href="https://github.com">GitHub.com</ExternalLink></li>
                <li><strong className={PROSE.strong}>Windows 10 או 11</strong> של 64 סיביות</li>
                <li><strong className={PROSE.strong}>לפחות 8 ג&apos;יגה RAM</strong> (עדיף 16)</li>
                <li><strong className={PROSE.strong}>בין 15 ל-20 ג&quot;ב פנויים</strong> במחשב</li>
                <li><strong className={PROSE.strong}>רשת יציבה</strong> - בדר&quot;כ גלישה באמצעות סטיק לא תספיק</li>
              </ul>
              <DocsCallout tone="info" icon="info">
                <p>ההדרכה מתאימה למי שעובד דרך Windows.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="git-install" icon="download" title="התקנת Git">
              <p>תחילה, יש להתקין Git, מערכת בקרת הגרסאות שתאפשר לנו לנהל את קוד הפרויקט.</p>
              <DocsSteps>
                <DocsStep title="הורדה והתקנה">
                  <p>למשתמשי Windows, התקינו את <ExternalLink href="https://git-scm.com/download/win">Git for Windows</ExternalLink></p>
                </DocsStep>
                <DocsStep title="בדיקת ההתקנה">
                  <p>פתחו את ה-CMD והריצו את הפקודה:</p>
                  <DocsCodeBlock>git --version</DocsCodeBlock>
                  <p>אם לא מופיע מספר גירסה, זה אומר שצריך להכניס את נתיב ההתקנה למשתני הסביבה של PATH.</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>

            <DocsSection id="flutter-install" icon="flutter" title="התקנת Flutter">
              <p>Flutter הוא הפריימוורק שבו נבנתה אוצריא. יש להתקין אותו כדי לפתח את התוכנה.</p>
              <DocsSteps>
                <DocsStep title="הורדת Visual Studio">
                  <p>הורידו והתקינו את <ExternalLink href="https://visualstudio.microsoft.com/downloads/">Visual Studio Community</ExternalLink> (גרסה חינמית)</p>
                </DocsStep>
                <DocsStep title="הורדת Flutter SDK">
                  <p>הורידו את <ExternalLink href="https://docs.flutter.dev/get-started/install/windows">Flutter SDK</ExternalLink> וחלצו אותו לתיקייה (למשל: C:\flutter)</p>
                </DocsStep>
                <DocsStep title="הוספה ל-PATH">
                  <p>הוסיפו את התיקייה C:\flutter\bin למשתני הסביבה PATH</p>
                </DocsStep>
                <DocsStep title="בדיקת ההתקנה">
                  <p>הריצו בטרמינל:</p>
                  <DocsCodeBlock>flutter doctor</DocsCodeBlock>
                  <p>הפקודה תבדוק מה חסר ותציג הוראות להשלמת ההתקנה.</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>

            <DocsSection id="editor-install" icon="edit_note" title="התקנת עורך קוד">
              <p>מומלץ להשתמש ב-VS Code עם תוסף Flutter.</p>
              <DocsSteps>
                <DocsStep title="הורדת VS Code">
                  <p>הורידו והתקינו את <ExternalLink href="https://code.visualstudio.com/">Visual Studio Code</ExternalLink></p>
                </DocsStep>
                <DocsStep title="התקנת תוסף Flutter">
                  <p>פתחו את VS Code, לחצו על <bdi dir="ltr">Extensions (Ctrl+Shift+X)</bdi> וחפשו &quot;Flutter&quot;. התקינו את התוסף הרשמי.</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>

            <DocsSection id="fork" icon="fork_right" title="יצירת Fork">
              <p>Fork הוא עותק של הפרויקט שלך ב-GitHub, שם תוכל לעשות שינויים.</p>
              <DocsSteps>
                <DocsStep title="גשו למאגר">
                  <p>היכנסו ל-<ExternalLink href="https://github.com/otzaria/otzaria">מאגר אוצריא ב-GitHub</ExternalLink></p>
                </DocsStep>
                <DocsStep title="לחצו על Fork">
                  <p>לחצו על כפתור &quot;Fork&quot; בפינה הימנית העליונה. זה ייצור עותק של הפרויקט בחשבון שלכם.</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>

            <DocsSection id="clone" icon="cloud_download" title="הורדת המאגר">
              <p>עכשיו נוריד את הקוד למחשב שלכם.</p>
              <DocsSteps>
                <DocsStep title="העתקת הקישור">
                  <p>במאגר שלכם ב-GitHub, לחצו על &quot;Code&quot; והעתיקו את ה-URL</p>
                </DocsStep>
                <DocsStep title="Clone המאגר">
                  <p>פתחו טרמינל והריצו:</p>
                  <DocsCodeBlock>git clone [URL שהעתקתם]</DocsCodeBlock>
                </DocsStep>
                <DocsStep title="פתיחה ב-VS Code">
                  <p>פתחו את התיקייה שהורדה ב-VS Code</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>

            <DocsSection id="editing" icon="edit" title="עריכת הקוד">
              <p>עכשיו אתם יכולים לערוך את הקוד! כמה טיפים:</p>
              <ul className={PROSE.ul}>
                <li>השתמשו ב-AI (כמו ChatGPT, Claude, או Copilot) כדי לעזור לכם לכתוב קוד</li>
                <li>התחילו משינויים קטנים - שינוי טקסט, צבעים, וכו&apos;</li>
                <li>קראו את הקוד הקיים כדי להבין איך הוא עובד</li>
                <li>אל תפחדו לנסות - תמיד אפשר לחזור אחורה!</li>
              </ul>
              <DocsCallout tone="tip" icon="tips_and_updates">
                <p><strong>טיפ:</strong> השתמשו ב-Ctrl+F כדי לחפש טקסט בקוד. זה יעזור לכם למצוא איפה לעשות שינויים.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="testing" icon="bug_report" title="בדיקה ובנייה">
              <DocsSteps>
                <DocsStep title="הרצת הפרויקט">
                  <p>בטרמינל, הריצו:</p>
                  <DocsCodeBlock>flutter run</DocsCodeBlock>
                  <p>זה יריץ את התוכנה במצב פיתוח ותוכלו לראות את השינויים שלכם.</p>
                </DocsStep>
                <DocsStep title="בניית הפרויקט">
                  <p>כשאתם מרוצים מהשינויים, בנו את הפרויקט:</p>
                  <DocsCodeBlock>flutter build windows</DocsCodeBlock>
                </DocsStep>
                <DocsStep title="שיתוף השינויים">
                  <p>אם אתם רוצים לשתף את השינויים עם הקהילה, צרו Pull Request ב-GitHub.</p>
                </DocsStep>
              </DocsSteps>
            </DocsSection>
          </DocsArticle>
        </DocsLayout>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
