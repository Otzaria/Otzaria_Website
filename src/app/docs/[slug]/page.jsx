import Link from 'next/link';
import { notFound } from 'next/navigation';
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader';
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import { getUserGuideNav, getWikiPage, iconForSlug } from '@/lib/wiki';

export const revalidate = 1800;
// דפים חדשים בוויקי נטענים on-demand גם אם לא היו קיימים בזמן ה-build
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const nav = await getUserGuideNav();
    return nav.map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const nav = await getUserGuideNav();
    const item = nav.find((n) => n.slug === slug);
    if (item) {
      return {
        title: `${item.title} | מדריך למשתמש - אוצריא`,
        description: `מדריך למשתמש של תוכנת אוצריא: ${item.title}`,
      };
    }
  } catch {
    /* metadata היא תוספת בלבד — הדף עצמו יטופל ב-render */
  }
  return { title: 'מדריך למשתמש - אוצריא' };
}

export default async function WikiGuidePage({ params }) {
  const { slug } = await params;

  let nav = [];
  let page = null;
  try {
    nav = await getUserGuideNav();
    page = await getWikiPage(slug, nav);
  } catch {
    // תקלה זמנית מול GitHub — ISR ימשיך להגיש עותק קודם; כאן זה fetch ראשון שנכשל
    throw new Error('לא ניתן לטעון את המדריך כרגע, נסו לרענן בעוד רגע');
  }
  if (!page) notFound();

  const current = nav.find((n) => n.slug === slug);
  const title = current?.title || page.title || 'מדריך למשתמש';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-on-surface/60 mb-6">
            <Link href="/" className="hover:text-primary">בית</Link>
            <span>›</span>
            <Link href="/docs" className="hover:text-primary">מדריך למשתמש</Link>
            <span>›</span>
            <span className="text-on-surface">{title}</span>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1 space-y-6">
              {/* ניווט בין דפי המדריך — נבנה דינמית מהוויקי */}
              <div className="glass-strong rounded-xl p-5 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
                <h3 className="text-lg font-bold text-primary-dark mb-3">מדריך למשתמש</h3>
                <nav className="space-y-1 mb-5">
                  {nav.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/docs/${item.slug}`}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                        item.slug === slug
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-on-surface/70 hover:text-primary hover:bg-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{iconForSlug(item.slug)}</span>
                      {item.title}
                    </Link>
                  ))}
                </nav>

                {page.toc.length > 1 && (
                  <>
                    <h3 className="text-lg font-bold text-primary-dark mb-3 pt-4 border-t border-neutral-200">
                      בעמוד זה
                    </h3>
                    <nav className="space-y-1">
                      {page.toc.map((h) => (
                        <a
                          key={h.id}
                          href={`#${h.id}`}
                          className="block p-2 text-sm text-on-surface/60 hover:text-primary rounded-lg transition-colors"
                        >
                          {h.text}
                        </a>
                      ))}
                    </nav>
                  </>
                )}
              </div>
            </aside>

            {/* Content */}
            <article className="lg:col-span-3">
              <div className="glass-strong rounded-2xl p-8 md:p-12 mb-8">
                <div className="flex items-center gap-4 mb-8 pb-6 border-b-2 border-primary/20">
                  <span className="material-symbols-outlined text-6xl text-primary">{iconForSlug(slug)}</span>
                  <h1 className="text-4xl font-bold text-primary-dark font-frank">{title}</h1>
                </div>
                <WikiMarkdown markdown={page.markdown} />
              </div>

              {/* מקור התוכן ותיקונים */}
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-on-surface/50">
                <span className="material-symbols-outlined text-base">sync</span>
                <p>
                  דף זה נטען אוטומטית מהוויקי של הפרויקט ב-GitHub. מצאתם טעות או רוצים להוסיף?{' '}
                  <a
                    href={`https://github.com/Otzaria/otzaria/wiki/${page.pageName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary/80 hover:text-primary underline underline-offset-2 font-medium"
                  >
                    ערכו את הדף בוויקי
                  </a>{' '}
                  — והתיקון יופיע כאן.
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  );
}
