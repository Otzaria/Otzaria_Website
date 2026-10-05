import type { ReactNode } from 'react'

type PlatformLinks = Record<string, string | undefined>

type AssistantButton = {
  key: string
  icon: string
  title: string
  desc: string
}

type AssistantPlatformConfig = {
  buttons: AssistantButton[]
  steps: ReactNode[]
  note?: ReactNode
}

// שמות קבצים ופקודות הם LTR; בלי בידוד הסוגריים והנקודה סביבם מתהפכים בפסקה עברית.
function Ltr({ children }: { children: string }) {
  return <bdi dir="ltr" className="font-mono text-sm">{children}</bdi>
}

// ההוראות תואמות את docs/download_assistant.md בריפו של אוצריא — לא להוסיף שלב שאינו מתועד שם.
const ASSISTANT_CONFIG: Record<string, AssistantPlatformConfig> = {
  Windows: {
    buttons: [
      { key: 'assistant', icon: 'install_desktop', title: 'מסייע ההורדה של אוצריא', desc: 'ל-Windows 10 / 11 — מתאים גם למחשבי ARM, המסייע מזהה את סוג המעבד בעצמו' }
    ],
    steps: [
      <>הפעילו את הקובץ שהורד, <Ltr>Otzaria-Download-Assistant-windows.exe</Ltr>.</>,
      'בחרו "הורדה והתקנה במחשב הזה", או "הכנת התקנה למחשב אחר" (למשל מחשב ללא אינטרנט).',
      'המשיכו בשלבי המסייע עד הסוף. במחשב הזה הוא מפעיל בסיום את מתקין אוצריא; למחשב אחר הוא מכין את קובצי ההתקנה להעברה אליו.'
    ]
  },
  macOS: {
    buttons: [
      { key: 'assistant', icon: 'laptop_mac', title: 'מסייע ההורדה של אוצריא', desc: 'ל-macOS 12 ומעלה — Intel ו-Apple Silicon' }
    ],
    steps: [
      <>פתחו בלחיצה כפולה את הקובץ שהורד, <Ltr>Otzaria-Download-Assistant-macos.zip</Ltr>, והפעילו את <Ltr>Otzaria-Download-Assistant</Ltr> שנפתח לצדו.</>,
      'בפתיחה הראשונה macOS חוסם את המסייע מפני שאינו חתום בחתימת מפתחים של Apple — יש לאשר "פתח בכל זאת" בהגדרות המערכת.',
      'המשיכו בשלבי המסייע עד הסוף. הוא מכין תיקייה עם קובץ ההתקנה; בסיום פתחו את הקובץ שהוכן כדי להתקין את אוצריא.'
    ]
  },
  Linux: {
    buttons: [
      { key: 'assistantX64', icon: 'computer', title: 'מסייע ההורדה של אוצריא (x64)', desc: 'למחשב רגיל — מעבד Intel או AMD' },
      { key: 'assistantArm64', icon: 'memory', title: 'מסייע ההורדה של אוצריא (ARM64)', desc: 'למחשב עם מעבד מסוג ARM' }
    ],
    note: <>לא בטוחים איזו גרסה? הריצו בטרמינל <Ltr>uname -m</Ltr>: התשובה <Ltr>x86_64</Ltr> פירושה x64, והתשובה <Ltr>aarch64</Ltr> פירושה ARM64.</>,
    steps: [
      <>חלצו את הקובץ שהורד (<Ltr>tar.gz</Ltr>) בלחיצה כפולה במנהל הקבצים.</>,
      <>בתיקייה <Ltr>Otzaria-Download-Assistant</Ltr> שנוצרה, הפעילו את הקובץ <Ltr>Otzaria-Download-Assistant</Ltr>.</>,
      'המשיכו בשלבי המסייע עד הסוף. הוא מכין תיקייה עם קובצי ההתקנה; בסיום התקינו את אוצריא מהקובץ שהוכן.',
      <>אם מופיעה הודעה שחסרה החבילה <Ltr>glib-networking</Ltr> — התקינו אותה והפעילו את המסייע שוב.</>
    ]
  }
}

/** האם יש ב-release מסייע הורדה לפלטפורמה (Windows / macOS / Linux) */
export function hasDownloadAssistant(platform: string, links: PlatformLinks): boolean {
  const config = ASSISTANT_CONFIG[platform]
  return !!config && config.buttons.some((button) => links[button.key])
}

export default function DownloadAssistantOptions({ platform, links }: { platform: string; links: PlatformLinks }) {
  const config = ASSISTANT_CONFIG[platform]
  if (!config) return null
  const buttons = config.buttons.filter((button) => links[button.key])

  return (
    <div className="grid gap-4">
      <div role="note" className="flex gap-3 p-4 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-900">
        <span className="material-symbols-outlined text-3xl text-amber-600 flex-shrink-0">warning</span>
        <div>
          <p className="font-bold text-lg mb-1">שימו לב: זה אינו קובץ ההתקנה של אוצריא עצמה, אלא מסייע ההורדה.</p>
          <p>
            אחרי ההורדה יש להפעיל אותו ולהמשיך בשלביו — הוא יוריד את התוכנה (ואם תבחרו, גם את הספרייה המלאה)
            ויכין קובץ התקנה.
          </p>
        </div>
      </div>

      {buttons.map((button) => (
        <a
          key={button.key}
          href={links[button.key]}
          className="flex items-center gap-4 p-4 rounded-xl border-2 border-primary hover:shadow-md transition-all group bg-white"
        >
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-2xl">{button.icon}</span>
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-neutral-800">{button.title}</h4>
            <p className="text-sm text-neutral-500">{button.desc}</p>
          </div>
          <span className="material-symbols-outlined text-primary">download</span>
        </a>
      ))}

      {config.note && buttons.length > 1 && (
        <p className="text-sm text-neutral-600">{config.note}</p>
      )}

      <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
        <h4 className="font-bold text-neutral-800 mb-2">איך ממשיכים אחרי ההורדה</h4>
        <ol className="list-decimal pr-5 space-y-1 text-neutral-700">
          {config.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// מסייע ה-Windows יודע להכין גם יעד Android: ה-APK, או החבילה המלאה עם הספרייה.
export function AndroidAssistantNotice({ href }: { href: string }) {
  return (
    <div role="note" className="flex gap-3 p-4 mt-2 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-900">
      <span className="material-symbols-outlined text-3xl text-amber-600 flex-shrink-0">info</span>
      <div className="flex-1">
        <p className="font-bold text-lg mb-1">אין אינטרנט במכשיר?</p>
        <p>
          אפשר להוריד במחשב Windows את מסייע ההורדה של אוצריא, ולהכין בעזרתו התקנה לאנדרואיד — קובץ ה-APK בלבד,
          או חבילה מלאה הכוללת גם את הספרייה.
        </p>
        <p className="mt-2">
          במסייע בחרו &quot;הכנת התקנה למחשב אחר&quot; ואז Android. את קובצי ה-ZIP של החבילה המלאה מעבירים למכשיר
          ומחלצים לאותה תיקייה באפליקציית ZIP; ההוראות המלאות בקובץ README שבתוכם.
        </p>
        <a
          href={href}
          className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg border-2 border-primary bg-white text-primary font-bold hover:shadow-md transition-all"
        >
          <span className="material-symbols-outlined">download</span>
          <span>הורדת מסייע ההורדה ל-Windows</span>
        </a>
      </div>
    </div>
  )
}
