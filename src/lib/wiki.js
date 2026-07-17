// שכבת הגישה לוויקי של GitHub — טעינה בצד שרת עם קאש (ISR) ורענון דרך tag.
// דפי המדריך למשתמש הם דפי "User-*" בוויקי; הרשימה נגזרת דינמית מ-_Sidebar.md,
// כך שדף חדש שיתווסף לוויקי יופיע באתר אוטומטית ללא deploy.

const WIKI_RAW = 'https://raw.githubusercontent.com/wiki/Otzaria/otzaria';
const WIKI_WEB = 'https://github.com/Otzaria/otzaria/wiki';
export const WIKI_CACHE_TAG = 'wiki';

const FETCH_OPTS = { next: { revalidate: 1800, tags: [WIKI_CACHE_TAG] } };

// אייקונים לפי slug (fallback כללי לדפים חדשים)
const PAGE_ICONS = {
  'getting-started': 'rocket_launch',
  library: 'local_library',
  reading: 'menu_book',
  pdf: 'picture_as_pdf',
  search: 'search',
  'find-ref': 'my_location',
  'tabs-workspaces': 'tab',
  personal: 'bookmark',
  'personal-books': 'upload_file',
  settings: 'settings',
  backup: 'cloud_upload',
  plugins: 'extension',
  tools: 'construction',
};

export function iconForSlug(slug) {
  return PAGE_ICONS[slug] || 'menu_book';
}

function pageToSlug(pageName) {
  return pageName.replace(/^User-/, '').toLowerCase();
}

/**
 * מחזיר את ניווט המדריך למשתמש מתוך _Sidebar.md של הוויקי.
 * כל שורה בצורת "- [[כותרת עברית|User-Page]]" הופכת לפריט ניווט.
 */
export async function getUserGuideNav() {
  const res = await fetch(`${WIKI_RAW}/_Sidebar.md`, FETCH_OPTS);
  if (!res.ok) throw new Error(`wiki sidebar fetch failed: ${res.status}`);
  const md = await res.text();

  const nav = [];
  const linkRe = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = linkRe.exec(md)) !== null) {
    const [title, page] = splitWikiLink(m[1]);
    if (page.startsWith('User-')) {
      nav.push({ page, slug: pageToSlug(page), title });
    }
  }
  return nav;
}

/** ממפה slug לשם דף וויקי, על סמך הניווט הדינמי. */
async function resolvePageName(slug, nav) {
  const list = nav || (await getUserGuideNav());
  const hit = list.find((item) => item.slug === slug.toLowerCase());
  if (hit) return hit.page;
  // דף שקיים בוויקי אך טרם נוסף לסרגל הצד — ניסיון גזירה ישירה
  const guessed = `User-${slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')}`;
  return guessed;
}

/** מזהה עוגן לכותרת — משמש גם לרינדור וגם ל-TOC, כדי שיהיו זהים תמיד. */
export function headingId(text) {
  return String(text)
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * ממיר תחביר וויקי של GitHub לקישורי Markdown רגילים:
 * - [[טקסט|User-Page]] ← קישור פנימי /docs/slug (ניווט SPA)
 * - [[טקסט|Page]] אחר ← קישור לוויקי בגיטהאב (דפי מפתחים)
 * - קישורי otzaria.org ← נתיב פנימי באתר
 * - תמונות בנתיב יחסי ← URL מלא ל-raw של הוויקי
 */
function transformWikiMarkdown(md) {
  let out = md;

  // הסרת עטיפת ה-RTL (האתר כולו RTL ממילא)
  out = out.replace(/<div dir="rtl">\s*/g, '').replace(/\s*<\/div>\s*$/g, '');

  // קישורי [[...|...]] ו-[[...]]
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [text, target] = splitWikiLink(inner);
    if (target.startsWith('User-')) {
      return `[${text}](/docs/${pageToSlug(target)})`;
    }
    return `[${text}](${WIKI_WEB}/${encodeURIComponent(target)})`;
  });

  // קישורים מוחלטים לאתר עצמו → נתיב פנימי (Link של Next, בלי טעינת דף)
  // eslint-disable-next-line security/detect-unsafe-regex -- ללא קבוצות מקוננות, אין backtracking אקספוננציאלי
  out = out.replace(/\]\(https?:\/\/(?:www\.)?otzaria\.org(\/[^)]*)?\)/g, (_, path) => `](${path || '/'})`);

  // תמונות בנתיב יחסי → raw של הוויקי (מוחלט/data: נשארים כמו שהם)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, src) => {
    if (/^(?:https?:\/\/|\/|data:)/.test(src)) return full;
    return `![${alt}](${WIKI_RAW}/${src})`;
  });

  return out.trim();
}

/** מפצל תוכן קישור וויקי "טקסט|יעד" (או "יעד" בלבד) לזוג [טקסט, יעד]. */
function splitWikiLink(inner) {
  const idx = inner.indexOf('|');
  if (idx === -1) {
    const both = inner.trim();
    return [both, both];
  }
  return [inner.slice(0, idx).trim(), inner.slice(idx + 1).trim()];
}

/**
 * טוען דף מדריך מהוויקי ומחזיר: כותרת, תוכן Markdown מעובד, ו-TOC.
 * מחזיר null אם הדף לא קיים (404 → not-found באתר).
 */
export async function getWikiPage(slug, nav) {
  const pageName = await resolvePageName(slug, nav);
  const res = await fetch(`${WIKI_RAW}/${encodeURIComponent(pageName)}.md`, FETCH_OPTS);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`wiki page fetch failed: ${res.status}`);

  let md = transformWikiMarkdown(await res.text());

  // הכותרת הראשית מוצגת ב-hero של האתר — מוציאים אותה מהגוף
  let title = null;
  md = md.replace(/^#\s+(.+)\s*\n/, (_, t) => {
    title = t.replace(/^מדריך למשתמש:\s*/, '').trim();
    return '';
  });

  const toc = [];
  for (const match of md.matchAll(/^##\s+(.+)$/gm)) {
    const text = match[1].trim();
    toc.push({ text, id: headingId(text) });
  }

  return { pageName, title, markdown: md, toc };
}
