import Link from 'next/link';
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader';
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter';
import { getUserGuideNav, iconForSlug } from '@/lib/wiki';

export const revalidate = 1800;

export const metadata = {
  title: 'מדריך למשתמש - אוצריא',
  description: 'המדריך המלא לשימוש בתוכנת אוצריא: התקנה, ספרייה, קריאה, חיפוש, הגדרות ועוד',
};

export default async function DocsIndexPage() {
  let nav = [];
  try {
    nav = await getUserGuideNav();
  } catch {
    /* בתקלה זמנית מציגים את הדף עם המדריכים הקבועים בלבד */
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Hero */}
          <div className="text-center mb-12 glass-strong rounded-2xl p-12">
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">menu_book</span>
            <h1 className="text-4xl font-bold text-primary-dark mb-4 font-frank">מדריך למשתמש</h1>
            <p className="text-xl text-on-surface/70 max-w-2xl mx-auto">
              כל מה שצריך לדעת על אוצריא — מההתקנה הראשונה ועד הכלים המתקדמים.
              המדריך מתעדכן אוטומטית מוויקי הפרויקט.
            </p>
          </div>

          {/* דפי המדריך — נטענים דינמית מהוויקי */}
          {nav.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
              {nav.map((item) => (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  className="glass-strong rounded-xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all group"
                >
                  <span className="material-symbols-outlined text-4xl text-primary mb-3 block group-hover:scale-110 transition-transform">
                    {iconForSlug(item.slug)}
                  </span>
                  <h2 className="text-xl font-bold text-primary-dark">{item.title}</h2>
                </Link>
              ))}
            </div>
          ) : (
            <div className="glass-strong rounded-xl p-8 text-center mb-12">
              <p className="text-lg text-on-surface/70">
                המדריך אינו זמין כרגע — נסו לרענן בעוד רגע, או עיינו בו ישירות{' '}
                <a
                  href="https://github.com/Otzaria/otzaria/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  בוויקי הפרויקט
                </a>
                .
              </p>
            </div>
          )}

          {/* מדריכים נוספים (תוכן ייחודי שאינו בוויקי) */}
          <h2 className="text-2xl font-bold text-primary-dark mb-5 font-frank">מדריכים נוספים</h2>
          <div className="grid sm:grid-cols-2 gap-5 mb-12">
            <Link href="/docs/dicta" className="glass-strong rounded-xl p-6 hover:shadow-lg transition-shadow">
              <span className="material-symbols-outlined text-3xl text-primary mb-2 block">edit</span>
              <h3 className="text-lg font-bold text-primary-dark mb-1">מדריך לטיפול בספרי דיקטה</h3>
              <p className="text-sm text-on-surface/60">יצירת כותרות וניווט בספרים — כולל כלים אוטומטיים</p>
            </Link>
            <Link href="/docs/development" className="glass-strong rounded-xl p-6 hover:shadow-lg transition-shadow">
              <span className="material-symbols-outlined text-3xl text-primary mb-2 block">code</span>
              <h3 className="text-lg font-bold text-primary-dark mb-1">מדריך פיתוח — עריכת אוצריא</h3>
              <p className="text-sm text-on-surface/60">איך לערוך ולשפר את התוכנה בעצמכם</p>
            </Link>
          </div>

          {/* קישור לתיעוד מפתחים */}
          <div className="glass-strong rounded-xl p-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-primary">terminal</span>
              <div>
                <div className="font-bold text-primary-dark">מפתחים?</div>
                <div className="text-sm text-on-surface/60">תיעוד הארכיטקטורה המלא נמצא בוויקי הפרויקט ב-GitHub</div>
              </div>
            </div>
            <a
              href="https://github.com/Otzaria/otzaria/wiki"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2 bg-surface-variant rounded-lg hover:bg-neutral-200 transition-colors font-bold text-primary-dark"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              <span>לתיעוד המפתחים</span>
            </a>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  );
}
