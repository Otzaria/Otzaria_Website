import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader';
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter';
import DocsDevelopersCard from '@/components/docs/DocsDevelopersCard';
import DocsGuideCard from '@/components/docs/DocsGuideCard';
import DocsHero from '@/components/docs/DocsHero';
import { PROSE } from '@/components/docs/proseClasses';
import Card from '@/components/ui/Card';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import { getUserGuideNav, iconForSlug } from '@/lib/wiki';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 1800;

export const metadata = pageMetadata({
  title: 'מדריך למשתמש',
  description: 'המדריך המלא לשימוש בתוכנת אוצריא: התקנה, ספרייה, קריאה, חיפוש, הגדרות ועוד',
  path: '/docs',
});

const WIKI_URL = 'https://github.com/Otzaria/otzaria/wiki';

// מדריכים נוספים (תוכן ייחודי שאינו בוויקי)
const MORE_GUIDES = [
  {
    href: '/docs/development',
    icon: 'code',
    title: 'מדריך פיתוח — עריכת אוצריא',
    description: 'איך לערוך ולשפר את התוכנה בעצמכם',
  },
  {
    href: '/docs/page-proof',
    icon: 'fact_check',
    title: 'הנחיות להגהת עמודים',
    description: 'דף אחד קצר למתנדבים: מבנה, טקסט, קישורים וזמנים — עם תמונות',
  },
  {
    href: '/docs/tzurat-hadaf',
    icon: 'auto_stories',
    title: 'הנחיות לצורת הדף',
    description: 'השוואת עמודי הגמרא שלנו לדפוס וילנא: החלטות נוסח, שבירת שורות ודיווחים',
  },
];

// עיצוב כיוון א': כותרת + קישוט, ומתחתיה דפי המדריך ככרטיסים בשפת כרטיסי דף הבית
// (אריח אייקון וכותרת). בלי אנימציית כניסה — הכותרת היא אלמנט ה-LCP.
export default async function DocsIndexPage() {
  let nav = [];
  try {
    nav = await getUserGuideNav();
  } catch {
    /* בתקלה זמנית מציגים את הדף עם המדריכים הקבועים בלבד */
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <Section labelledBy="docs-title" spacing="none" className="pt-10 pb-14 md:pt-14 md:pb-16">
          <DocsHero
            id="docs-title"
            icon="menu_book"
            title="מדריך למשתמש"
            subtitle={
              <>
                כל מה שצריך לדעת על אוצריא — מההתקנה הראשונה ועד הכלים המתקדמים.
                המדריך מתעדכן אוטומטית מוויקי הפרויקט.
              </>
            }
          />

          {/* דפי המדריך — נטענים דינמית מהוויקי, בסדר הסרגל שלו */}
          {nav.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {nav.map((item) => (
                <li key={item.slug}>
                  <DocsGuideCard href={`/docs/${item.slug}`} icon={iconForSlug(item.slug)} title={item.title} />
                </li>
              ))}
            </ul>
          ) : (
            <Card tone="tonal" padding="lg" role="note" className="mx-auto max-w-narrow text-center">
              <p className="text-body-md text-on-surface md:text-body-lg">
                המדריך אינו זמין כרגע — נסו לרענן בעוד רגע, או עיינו בו ישירות{' '}
                <a href={WIKI_URL} target="_blank" rel="noopener noreferrer" className={PROSE.link}>
                  בוויקי הפרויקט
                </a>
                .
              </p>
            </Card>
          )}
        </Section>

        <Section labelledBy="more-guides-heading" spacing="none" className="pb-14 md:pb-20">
          <SectionHeading id="more-guides-heading" title="מדריכים נוספים" />
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {MORE_GUIDES.map((guide) => (
              <li key={guide.href}>
                <DocsGuideCard {...guide} titleAs="h3" />
              </li>
            ))}
          </ul>

          <DocsDevelopersCard href={WIKI_URL} className="mt-8" />
        </Section>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  );
}
