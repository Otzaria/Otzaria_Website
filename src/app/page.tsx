import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import FeaturesSection from '@/components/home/FeaturesSection'
import DownloadSection from '@/components/home/DownloadSection'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OtzariaSoftwareHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 px-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-bl from-primary/10 via-background to-secondary/10 opacity-50"></div>

            <div className="container mx-auto relative z-10 text-center max-w-4xl">
                {/* אנימציית CSS ולא framer-motion: כך הלוגו אינו מגיע מהשרת עם
                    transform:scale(0) ונשאר בלתי נראה עד שה-JavaScript עולה. */}
                <div className="mb-8 flex justify-center animate-enter-pop">
                    <img src="/logo.webp" alt="לוגו אוצריא" width={128} height={128} className="w-32 h-32 drop-shadow-2xl" />
                </div>

                <h1 className="text-5xl md:text-6xl font-bold mb-6 font-frank">
                    אוצריא
                </h1>

                <p className="text-xl md:text-2xl mb-6 text-foreground/80 leading-relaxed">
                    מאגר תורני רחב עם ממשק מודרני ומהיר
                </p>

                <p className="text-base md:text-lg mb-5 text-foreground/70 leading-relaxed max-w-3xl mx-auto">
                    אוצריא היא תוכנה חופשית ובקוד פתוח לקריאה וללימוד של ספרי קודש, לשולחן העבודה
                    (Windows, macOS, Linux) ולנייד (Android, iOS). התוכנה כוללת ספרייה תורנית רחבה,
                    חיפוש בכל הספרים, מפרשים והפניות, הערות אישיות וסימניות, ולוח שנה עברי עם זמני
                    היום. במסך לוח השנה ניתן לחבר את יומן Google של המשתמש, כדי לראות את האירועים
                    שלו לצד הלוח העברי ולהוסיף אירועים בלי לצאת מהתוכנה.
                </p>

                <div className="flex flex-col gap-4 justify-center items-center mt-8">
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        {/* עוגן באותו דף — <a> רגיל. כ-Link, Next התייחס אליו כמסלול
                            ופתח בקשות RSC ספקולטיביות לדף הנוכחי. */}
                        <a href="#download" className="px-8 py-4 bg-primary text-white rounded-lg text-lg font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl">
                            הורד עכשיו
                        </a>
                        <Link href="/about" prefetch={false} className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-primary text-primary rounded-lg text-lg font-medium hover:bg-primary/5 transition-all shadow-lg hover:shadow-xl">
                            <span className="material-symbols-outlined">info</span>
                            <span>אודות הספרייה</span>
                        </Link>
                    </div>
                    <Link href="/library" className="px-4 py-4 bg-white border-2 border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-all">
                        לפרוייקט ספריית אוצריא
                    </Link>
                </div>
            </div>
        </section>

        <FeaturesSection />

        <DownloadSection />

        {/* Offline Update Tool */}
        <section className="py-16 px-4 bg-surface">
            <div className="container mx-auto max-w-5xl">
                <div className="glass-strong rounded-2xl p-8 md:p-10 border border-surface-variant shadow-lg flex flex-col md:flex-row items-center gap-8 animate-enter-up">
                    <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-6xl text-primary">cloud_off</span>
                    </div>
                    <div className="flex-1 text-center md:text-right">
                        <h2 className="text-3xl font-bold mb-3 font-frank">המחשב שלכם לא מחובר לאינטרנט?</h2>
                        <p className="text-on-surface/70 leading-relaxed">
                            &quot;עדכוני אוצריא&quot; הוא כלי נפרד שמורידים במחשב מקוון על כונן USB, ומעדכנים
                            איתו במחשב הלא-מקוון את התוכנה, את ספריית הספרים ואת התוספים, בלי חיבור לרשת.
                        </p>
                    </div>
                    <Link href="/offline" prefetch={false} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-lg whitespace-nowrap">
                        <span className="material-symbols-outlined">usb</span>
                        לכלי העדכון הלא-מקוון
                    </Link>
                </div>
            </div>
        </section>

        {/* Contribute Link */}
        <section className="py-20 px-4 bg-primary/5 text-center">
            <div className="container mx-auto">
                 <h2 className="text-3xl font-bold mb-6">רוצים לתרום לפיתוח?</h2>
                 <Link href="/library/books" prefetch={false} className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary border border-primary rounded-lg font-medium hover:bg-primary hover:text-white transition-colors">
                    <span className="material-symbols-outlined">upload_file</span>
                    הצטרפו לקהילת העורכים
                 </Link>
            </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  );
}
