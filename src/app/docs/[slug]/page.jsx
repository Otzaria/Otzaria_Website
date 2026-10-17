import { notFound } from 'next/navigation';
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader';
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import DocsArticle from '@/components/docs/DocsArticle';
import DocsBreadcrumbs from '@/components/docs/DocsBreadcrumbs';
import DocsGuideNav from '@/components/docs/DocsGuideNav';
import DocsHero from '@/components/docs/DocsHero';
import DocsLayout from '@/components/docs/DocsLayout';
import DocsPrevNext from '@/components/docs/DocsPrevNext';
import DocsWikiSourceNote from '@/components/docs/DocsWikiSourceNote';
import { getAdjacentGuides, wikiTocItems } from '@/components/docs/docsNav';
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
  const { prev, next } = getAdjacentGuides(nav, slug);
  const navProps = { title: 'מדריך למשתמש', items: nav, current: slug, iconFor: iconForSlug };

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <DocsLayout
          titleId="docs-title"
          breadcrumbs={
            <DocsBreadcrumbs
              items={[
                { label: 'בית', href: '/', prefetch: false },
                { label: 'מדריך למשתמש', href: '/docs' },
                { label: title },
              ]}
            />
          }
          hero={<DocsHero id="docs-title" icon={iconForSlug(slug)} title={title} align="start" />}
          nav={{
            // "בעמוד זה" משולב בניווט, מתחת לדף הנוכחי (DocsLayout)
            panel: (toc) => <DocsGuideNav {...navProps} variant="panel" currentChildren={toc} />,
            folded: <DocsGuideNav {...navProps} variant="folded" />,
          }}
          // תוכן העניינים מוצג רק כשיש בדף יותר מכותרת אחת
          toc={page.toc.length > 1 ? { title: 'בעמוד זה', items: wikiTocItems(page.toc) } : undefined}
          after={
            <>
              <DocsPrevNext prev={prev} next={next} className="mt-8" />
              <DocsWikiSourceNote pageName={page.pageName} className="mt-6" />
            </>
          }
        >
          <DocsArticle>
            <WikiMarkdown markdown={page.markdown} />
          </DocsArticle>
        </DocsLayout>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  );
}
