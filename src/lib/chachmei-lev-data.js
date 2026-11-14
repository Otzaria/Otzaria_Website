// נתוני דף "חכמי לב" (/chachmei-lev) — הקדשות, חברות תורמות, תורמים, מפתחים, מקורות הספרים
// ומהדירים. לוגיקה טהורה בלבד (בלי React/DOM), כדי שהוספת שם או חברה תהיה שורה אחת כאן.
//
// המקור: מסך "חכמי לב" בתוכנה (otzaria: lib/settings/tabs/about_settings_data.dart +
// about_settings_tab.dart), ותוכן חלון "אוצריא מתגייסת לעזרת לומדי התורה"
// (assets/support_organizations.json). בעדכון שם/טלפון בתוכנה — לעדכן גם כאן.
//
// פריט אדם: { name, url?, description? } — url ריק/חסר = שם בלי קישור.

/** הציטוט שבראש הדף (בתוכנה: _ClosingQuote) */
export const QUOTE = {
  verse: 'וְצִדְקָתוֹ עֹמֶדֶת לָעַד',
  verseSource: '(תהילים קיב, ג)',
  explanation: 'זֶה הַכּוֹתֵב סְפָרִים וּמַשְׁאִילָן לַאֲחֵרִים',
  explanationSource: '(כתובות נ.)'
}

/**
 * הניווט המהיר שבראש הדף — לפי סדר האזורים בדף: id של כל אזור, תווית קצרה ואייקון (חייב להיות
 * בגופן המוקטן). התוויות קצרות בכוונה: שישה שבבים נכנסים בשורה אחת במחשב ובשתי שורות של שלושה
 * בנייד — בלי שבב בודד בשורה.
 */
export const PAGE_SECTIONS = [
  { id: 'memorial', label: 'הנצחה', icon: 'candle' }, // כמו הנר שבכרטיסי ההנצחה
  { id: 'companies', label: 'חברות', icon: 'business' },
  { id: 'contributors', label: 'תורמים', icon: 'group' },
  { id: 'developers', label: 'מפתחים', icon: 'code' },
  { id: 'library', label: 'הספרייה', icon: 'library_books' },
  { id: 'aid', label: 'סיוע', icon: 'shield' }
]

// ── סיוע ללומדי תורה ────────────────────────────────────────────────────────

export const AID = {
  heading: 'סיוע ללומדי תורה',
  title: 'אוצריא מתגייסת לעזרת לומדי התורה',
  subtitle: 'מרכז המידע על ארגוני סיוע ללומדי התורה',
  emergencyLabel: 'קווי חירום',
  supportLabel: 'ארגוני סיוע'
}

/**
 * ארגון: name, phone, logo (נתיב ב-public), registeredCount?,
 * details — שורות "אפשרויות הקו"; `**טקסט**` מסמן הדגשה, ו-{registered} מוחלף בכמות הנרשמים.
 */
export const EMERGENCY_LINES = [
  {
    name: 'צבע שחור',
    phone: '073-888-1234',
    logo: '/support-orgs/tzeva-shahor.png',
    registeredCount: 111220,
    details: [
      '**לדיווח בעת ניסיון מעצר הקש כוכבית**',
      '0 - הרשמה לקבלת התרעות',
      '1 - היסטוריית ההתרעות',
      '2 - שלוחת הרכבים',
      '5 - שלוחת רישום למקבלי הצווים',
      '7 - כמות הנרשמים (מעל {registered})',
      '8 - דיווח על תקלות במערכת',
      '9 - הסרה מרשימת התפוצה',
      '',
      'לאחר לחיצה על 0:',
      '1 - ירושלים',
      '2 - בני ברק',
      '3 - בית שמש',
      '4 - מודיעין עילית',
      '5 - אלעד',
      '6 - לוד גני איילון אחיסמך וכפר חב"ד',
      '7 - ביתר עילית',
      '8 - אשדוד',
      '9 - ערים נוספות',
      '',
      'לאחר לחיצה על 9 (ערים נוספות):',
      '1 - ערים בצפון',
      '2 - ערים במרכז',
      '3 - ערים בדרום',
      '',
      'ערים בצפון (לחיצה על 1):',
      '1 - חיפה',
      '2 - זכרון יעקב',
      '3 - טבריה',
      '4 - גליל',
      '5 - רכסים והקריות',
      '6 - בית שאן',
      '7 - חדרה והאזור',
      '8 - עפולה, מגדל העמק, הר יונה',
      '9 - יבניאל',
      '10 - נהריה ומעלות תרשיחא',
      '',
      'ערים במרכז (לחיצה על 2):',
      '1 - תל אביב יפו',
      '2 - פתח תקווה',
      '3 - רמת גן',
      '4 - אזור רחובות',
      '5 - ערים שונות בגוש דן',
      '6 - אזור השרון',
      '7 - חולון ובת ים',
      '8 - קרית מלאכי',
      '9 - קרית יערים תלסטון',
      '10 - עמנואל',
      '',
      'מזרח גוש דן (לחיצה על 5 ואז 0):',
      '0 - כל אזור מזרח גוש דן',
      '1 - גבעת שמואל',
      '2 - יהוד',
      '3 - קרית אונו וגני תקווה',
      '4 - אור יהודה',
      '',
      'ערים בדרום (לחיצה על 3):',
      '1 - באר שבע',
      '2 - אשקלון',
      '3 - ירוחם',
      '4 - דימונה',
      '5 - ערים נוספות',
      '6 - ערד',
      '7 - קרית גת',
      '',
      'אופקים, נתיבות ותפרח (לחיצה על 5):',
      '0 - אופקים, נתיבות ותפרח ביחד',
      '1 - אופקים',
      '2 - נתיבות',
      '3 - תפרח'
    ]
  },
  {
    name: 'החוטפים הגיעו',
    phone: '02-800-8080',
    logo: '/support-orgs/hachotfim-higiu.jpg',
    registeredCount: 118310,
    details: [
      '1 - לרישום',
      '2 - להסרה מרשימת התפוצה',
      '3 - להגבלת שעות כפי המידע שנמסר בהוראות',
      '(לע"ע האפשרות להגבלת שעות היא רק על מבזקים ולא על צינתוקים)',
      '4 - **לדיווח חירום בעת נסיון מעצר**',
      '5 - לדיווח על מחסומים',
      '6 - להשארת הודעות למערכת',
      '7 - להוראות רישום ומידע מורחב על המערכת החדשה',
      '8 - כמות הנרשמים (מעל {registered})',
      '',
      'לאחר לחיצה על 1 (לרישום):',
      '1 - להרשמה לפי עיר',
      '2 - להרשמה לפי אזור בארץ',
      '3 - להרשמה לכל הארץ',
      '',
      'לאחר לחיצה על 1 (להרשמה לפי עיר)',
      'יושמע התקליט הבא:',
      'בחר את העיר הרצויה, אם ידוע לך קוד העיר הקש אותו בכל שלב',
      'רשימת הערים יוקראו ברצף -',
      'לבחירת העיר הקש 0',
      'למעבר מהיר לעיר הבאה הקש #',
      'לעיר הקודמת הקש *',
      '',
      '1 בני ברק',
      '2 ירושלים',
      '3 בית שמש',
      '4 מודיעין עילית',
      '5 ביתר',
      '6 אשדוד',
      '7 אלעד',
      '8 אופקים',
      '9 אור יהודה',
      '10 אשקלון',
      '11 באר יעקב',
      '12 באר שבע',
      '13 בית חלקיה',
      '14 בית שאן',
      '15 בת ים',
      '16 גני תקוה',
      '17 דימונה',
      '18 זכרון יעקב',
      '19 חדרה',
      '20 חולון',
      '21 חיפה',
      '22 חצור',
      '23 חריש',
      '24 טבריה',
      '25 טלסטון',
      '26 יבניאל',
      '27 יהוד',
      '28 יסודות',
      '29 ירוחם',
      '30 כרמיאל',
      '31 לוד - אחיסמך',
      '32 לוד כללי',
      '33 מגדל העמק',
      '34 מירון',
      '35 מעלה אדומים',
      '36 מעלות',
      '37 נהריה',
      '38 נצרת נוף הגליל',
      '39 נתיבות',
      '40 נתניה',
      '41 עמנואל',
      '42 עפולה',
      '43 ערד',
      '44 פתח תקוה',
      '45 צפת',
      '46 קוממיות חזון יחזקאל',
      '47 קרית אתא',
      '48 קרית גת',
      '49 קרית מלאכי',
      '50 ראשון לציון',
      '51 רחובות',
      '52 רכסים',
      '53 רמת גן',
      '54 תל אביב יפו',
      '55 תל ציון',
      '56 תפרח',
      '57 אילת',
      '58 הרצליה',
      '59 רמת השרון',
      '',
      'לאחר בחירת עיר מסוימת, יושמע התקליט הבא:',
      'לאישור הקש 1',
      'להקשה מחודשת הקישו 2',
      '(אחרי לחיצה על 1 לאישור)',
      'להוספת מספרכם לרשימת הצינתוקים הקישו 1',
      'להסרת מספרכם מרשימת הצינתוקים הקישו 2',
      'להוספת מספרכם לרשימת הצינתוקים לזמן מסוים הקישו 3',
      'להשתקת קבלת צינתוקים עד לזמן מסוים הקישו 4',
      'ליציאה הקישו *',
      '',
      'לאחר לחיצה על 2 (להרשמה לפי אזור)',
      'יושמע התקליט הבא:',
      'הקש את קוד האזור, ובסיום הקש סולמית',
      '1 אזור המרכז',
      '2 אזור ירושלים ובית שמש',
      '3 אזור הדרום - אזור אשדוד',
      '4 אזור הדרום - אזור הנגב',
      '5 אזור הגליל והגולן',
      '6 אזור הצפון - קו החוף'
    ]
  }
]

export const SUPPORT_ORGS = [
  {
    name: 'נותנים גב',
    phone: '04-313-2000',
    logo: '/support-orgs/notnim-gav.png',
    details: [
      'לאנגלית הקש 4',
      '1 - מוקד רישום לבחורים מקבלי הצווים',
      '2 - אגף ייעוץ מקצועי',
      '3 - אגף תמיכה לנשים ואמהות',
      '5 - הדרכה מוקלטת למקבלי הצווים',
      '8 - הרשמה להתנדבות בארגון',
      '9 - השארת הודעה למנהלי הארגון',
      '0 - תרומות במענה אנושי או אוטומטי',
      '* - מוקד חרום בעת מעצר'
    ]
  },
  {
    name: 'עם קדוש',
    phone: '*5172',
    logo: '/support-orgs/am-kadosh.png',
    details: [
      'גימטריא קטנה של "נאזר" בגבורה',
      '1 - בחור מגיל 18 ומעלה שקיבל צו',
      '2 - מגיל 16 וחצי עד 18',
      '3 - השארת הודעה',
      '4 - מענה בעת ניסיון מעצר או בשעת מעצר',
      '5 - דיווח על מחסומים ברחבי הארץ',
      '8 - תרומות'
    ]
  },
  {
    name: 'עזרם ומגינם',
    phone: '02-500-0110',
    logo: '/support-orgs/ezram-maginam.png',
    details: [
      '1 - מידע והנחיות',
      '2 - מענה אנושי',
      '3 - פניה בעת מעצר',
      '4 - מזכירות הארגון',
      '9 - הרשמה לקבלת התרעות בעת מעצר'
    ]
  },
  {
    name: 'הפקדתי שומרים',
    phone: '09-313-2142',
    logo: '/support-orgs/hifkadeti-shomrim.jpg',
    details: [
      'ארגון לתושבי ביתר',
      'הפועל בצמוד ובתמיכת רבני העיר',
      '* - מוקד החירום במקרי מעצר',
      '1 - רישום למקבלי צווי הגיוס',
      '2 - לייעוץ משפטי למקבלי הצווים',
      '3 - מוקד התמיכה לאמהות ונשות מקבלי הצווים',
      '4 - מענה מנציגים',
      '9 - להנהלת הארגון',
      '0 - לתרומות'
    ]
  },
  {
    name: 'אגודת בני הישיבות',
    phone: '02-994-0030',
    logo: '/support-orgs/agudat-bnei-hayeshivot.png',
    details: [
      '1 - לרישום',
      '2 - מענה והכוונה משפטית',
      '3 -מענה בשפות נוספות',
      '7 - מוקד משפטי למנהלי הישיבות',
      '9 - שלוחת החירום למקרי מעצר',
      'קו תוכן שע"י האגודה: 077-226-2626',
      'אפשרויות קו התוכן:',
      '1 - עדכונים',
      '5 - רישום, תמיכה וסיוע משפטי',
      '6 - תרומות',
      '9 - הרשמה והסרה מרשימות התפוצה'
    ]
  },
  {
    name: 'הצלה לאחים',
    phone: '02-502-3231',
    logo: '/support-orgs/hatzala-laachim.png',
    details: [
      '1 - לפניות חדשות והמשך טיפול',
      '2 - לפניות בנושא עיכוב יציאה מהארץ',
      '3 - לפניות בנושא עצורים בכלא הצבאי',
      '6 - לקבלת כתובת המייל והפקס',
      '8 - לשמיעת הסטטוס בתיק שלכם',
      '9 - לשמיעה חוזרת'
    ]
  },
  {
    name: 'אחים אנחנו',
    phone: '02-579-5252',
    logo: '/support-orgs/achim-anachnu.png',
    details: [
      '1 - למקבלי צווי ההתיצבות והגיוס',
      '2 - לבעיות מול הצבא',
      '4 - להשארת הודעה',
      '5 - לקבלת מספר הפקס ודואר אלקטרוני',
      '6 - לכל נושא אחר'
    ]
  },
  {
    name: 'כלא 1000',
    phone: '03-313-1000',
    logo: '/support-orgs/kele-1000.png',
    details: [
      '1 - הרשמה',
      '2 - שמיעת כמות הרשומים',
      '3 - תקנון',
      '4 - שאלות ותשובות',
      '5 - השארת הודעה',
      '6 - העברה לנציג',
      '7 - תרומות',
      '',
      'לאחר לחיצה על 1 (הרשמה):',
      '1 - הרשמה ממוחשבת',
      '2 - הרשמה - מענה אנושי'
    ]
  },
  {
    name: 'מגן ומושיע',
    phone: '*9273',
    logo: '/support-orgs/magen-umoshia.png',
    details: ['ארגון סיוע ללומדי תורה']
  }
]

/** 102631 → "102,631" (כמו בתוכנה) */
export function withThousandsSeparator(value) {
  return Math.trunc(value).toLocaleString('en-US')
}

/**
 * שורות "אפשרויות הקו" של ארגון, אחרי החלפת {registered} בכמות הנרשמים
 * @param {{ details?: string[], registeredCount?: number }} org
 * @returns {string[]}
 */
export function orgDetailLines(org) {
  const lines = org.details ?? []
  if (typeof org.registeredCount !== 'number') return lines
  const count = withThousandsSeparator(org.registeredCount)
  return lines.map((line) => line.replaceAll('{registered}', count))
}

/**
 * שורה עם הדגשות `**...**` → מקטעים [{ text, bold }]. כוכבית בודדת (שלוחת "*") נשארת טקסט.
 * @param {string} line
 * @returns {{ text: string, bold: boolean }[]}
 */
export function splitBold(line) {
  const segments = []
  const pattern = /\*\*(.+?)\*\*/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: line.slice(last, match.index), bold: false })
    segments.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }
  if (last < line.length) segments.push({ text: line.slice(last), bold: false })
  return segments
}

/** קישור חיוג: "073-888-1234" → "tel:0738881234"; "*5172" → "tel:*5172" */
export function telHref(phone) {
  return `tel:${phone.replace(/[^\d*#+]/g, '')}`
}

// ── לוח הנצחה ───────────────────────────────────────────────────────────────

/** ההקדשות — בנוסח המדויק שבתוכנה (_MemorialCardsGrid). description — שורות נפרדות ב-\n */
export const MEMORIALS = [
  {
    title: 'לע"נ ר\' משה בן יהודה ראה ז"ל',
    description: 'סכום משמעותי לפיתוח התוכנה'
  },
  {
    title: 'לע"נ ר\' משה ב"ר פרץ ובנו ר\' יצחק ב"ר משה, והאשה הכשרה מרת רחל יהודית בת אליעזר',
    description: 'ולהצלחת דוד ב"ר יחזקאל ומשפחתו בתורה וביראת שמים\nתרומה גדולה ורבה לפיתוח התוכנה'
  }
]

export const MEMORIAL_OPEN_SLOT = 'מקום זה יכול להיות מונצח לע"נ יקירך'

// ── חברות שתרמו ─────────────────────────────────────────────────────────────

/**
 * חברה: name, url, logo (public/sponsors), width/height — היחס של הלוגו (viewBox), ל-next/image.
 * הלוגו מוצג בצבעיו המקוריים.
 */
export const SPONSOR_COMPANIES = [
  {
    name: 'קשר פתרונות תקשורת',
    url: 'https://קשר.ישראל/',
    logo: '/sponsors/kesher.svg',
    width: 380,
    height: 240
  }
]

export const COMPANY_OPEN_SLOT = 'מקום זה יכול להיות שלך'

// ── משבצות פנויות: פנייה במייל ──────────────────────────────────────────────

/**
 * הנצחה ותרומת חברה — בתיאום אישי במייל, ולא דרך דף התרומה. זהה ל-CONTACT_EMAIL
 * (components/notFound/notFoundLinkData.ts) — עותק כי קובץ זה נטען גם ב-node:test, שאינו טוען TS;
 * הטסט ב-ChachmeiLev.test.tsx מוודא שהשניים לא נפרדים.
 */
export const SLOT_EMAIL = 'otzaria.1@gmail.com'

/** קישור mailto עם נושא מוכן מראש (מקודד). */
export function slotMailto(subject) {
  return `mailto:${SLOT_EMAIL}?subject=${encodeURIComponent(subject)}`
}

export const MEMORIAL_MAILTO = slotMailto('הנצחה בלוח ההנצחה של אוצריא')
export const COMPANY_MAILTO = slotMailto('חברה תורמת לאוצריא')

// ── תרמו מהונם ומזמנם ───────────────────────────────────────────────────────

export const ESSENTIAL_PEOPLE = [
  { name: 'דוד אריאל' },
  { name: 'רפאל א.' },
  { name: 'יעקב מ. פינס', url: 'https://github.com/ymp112' }
]

// ── פיתוח התוכנה ────────────────────────────────────────────────────────────

export const DEVELOPERS = [
  { name: 'sivan22', url: 'https://github.com/Sivan22' },
  { name: 'ר. נבון', url: 'https://github.com/rachelGrayover', description: 'השקעה עצומה במעבר ל-SQLite' },
  { name: 'ב.ש. כלטוב', url: 'https://github.com/BatshevaRich', description: 'שיפור ושכלול מסד הנתונים' },
  { name: 'Y.PL.', url: 'https://github.com/Y-PLONI' },
  { name: 'palmoni', url: 'https://github.com/palmoni5' },
  { name: 'YOSEFTT', url: 'https://github.com/YOSEFTT' },
  { name: 'zevisvei', url: 'https://github.com/zevisvei' },
  { name: 'evel-avalim', url: 'https://github.com/evel-avalim' },
  { name: 'userbot', url: 'https://github.com/userbot000' },
  { name: 'abaye', url: 'https://github.com/abaye123' },
  { name: 'יעקב מ. פינס', url: 'https://github.com/YMP112' },
  { name: 'shlomo', url: 'https://github.com/DeveShlomo' },
  { name: 'mosh-dvd', url: 'https://github.com/mosh-dvd' },
  { name: 'NHLOCAL', url: 'https://github.com/NHLOCAL/Shamor-Zachor', description: "מפתח 'שמור וזכור'" },
  { name: 'michaelush', url: 'https://github.com/mmichaelush' }
]

// ── ספריית אוצריא: מקור הספרים ──────────────────────────────────────────────

/**
 * פסקת הפתיחה של "מקור הספרים" — שני המשפטים שבתוכנה (על ספריא ודיקטה, ועל ההתאמה לאוצריא
 * והמהדירים) בפסקה אחת, בלי תארי שבח.
 */
export const LIBRARY_INTRO =
  'חלק ניכר מהספרים בספריית אוצריא נלקח מהפרויקטים של ספריא ושל עמותת דיקטה. הספרים הותאמו במיוחד עבור אוצריא, וספרים רבים נוספו בזכות עבודתם המסורה של מהדירי הספרים.'

export const ADDITIONAL_SOURCES_LABEL = 'כמו כן נוספו ספרים חשובים רבים מהפרויקטים הבאים:'

/**
 * מקור: name, url?, logo? (public/sources), ratio — רוחב/גובה של הלוגו (חובה כשיש logo).
 * כל הלוגואים נצבעים בצבע אחד (primary כשיש קישור, ואחרת הצבע השקט), כדי שהקיר ייראה אחיד — גם
 * אלה שבתוכנה בצבעיהם המקוריים (logoOriginalColor). מקור בלי logo — השם עצמו בתפקיד הלוגו.
 * אורייתא וויקיטקסט בלי לוגו בכוונה: בצבע אחד הלוגו שלהם נראה כמלבן מלא / ככתם עגול.
 */
export const MAIN_SOURCES = [
  {
    name: 'ספריא',
    url: 'https://www.sefaria.org/texts',
    // הסמל והכיתוב בלבד, בלי מסגרת "Powered by" שבקובץ המקור (safria logo.svg), עם שוליים
    // אנכיים — כדי שגובה הכיתוב ישתווה ל-DICTA שלצדו
    logo: '/sources/sefaria-mark.png',
    ratio: 431 / 160
  },
  {
    name: 'דיקטה',
    url: 'https://github.com/Dicta-Israel-Center-for-Text-Analysis/Dicta-Library-Download',
    logo: '/sources/dicta.svg',
    ratio: 1158 / 582
  }
]

export const ADDITIONAL_SOURCES = [
  { name: 'פרויקט פרידברג', url: 'https://fjms.genizah.org/', logo: '/sources/friedberg.svg', ratio: 1516 / 340 },
  { name: 'הספרייה הלאומית', url: 'https://www.nli.org.il/', logo: '/sources/national-library.svg', ratio: 1000 / 252 },
  {
    name: 'תורת אמת',
    url: 'http://www.toratemetfreeware.com/index.html?downloads;1;',
    logo: '/sources/torat-emet.svg',
    ratio: 18.83 / 18.87
  },
  { name: 'אורייתא', url: 'https://github.com/MosheWagner/Orayta-Books' },
  { name: 'ובלכתך בדרך', url: 'http://mobile.tora.ws', logo: '/sources/on-your-way.svg', ratio: 284.1 / 409.13 },
  { name: 'פנינים', url: 'https://pninim.org/', logo: '/sources/pninim.svg', ratio: 243 / 79 },
  { name: 'ויקיטקסט', url: 'https://he.wikisource.org/wiki' },
  {
    name: 'אוצר הספרים היהודי',
    url: 'https://wiki.jewishbooks.org.il/mediawiki/wiki/%D7%A2%D7%9E%D7%95%D7%93_%D7%A8%D7%90%D7%A9%D7%99',
    logo: '/sources/jewish-books.svg',
    ratio: 2093 / 1840
  },
  { name: 'תא שמע', url: 'https://tashma.co.il/', logo: '/sources/tashma.svg', ratio: 769.45 / 954.19 },
  { name: 'מיקרופדיה תלמודית', url: 'https://www.yadharavherzog.net/', logo: '/sources/mikrapedia-talmudit.svg', ratio: 192 / 326 },
  { name: 'מכון שלמה אומן', url: 'https://www.machonso.org/', logo: '/sources/machon-shlomo-oman.svg', ratio: 103 / 144 },
  { name: 'מכון פי ישרים', logo: '/sources/pi-yesharim.svg', ratio: 198.43 / 226.77 },
  { name: 'פרויקט בן י.', url: 'https://github.com/projectbenyehuda/public_domain_dump' },
  {
    name: 'ים החכמה',
    url: 'https://github.com/torahtyh/yam-HaHachma',
    logo: '/sources/yam-hahachma.png',
    ratio: 491 / 512
  },
  { name: 'מכון בית אהרן וישראל', url: 'https://machon.co.il/' }
]

// ── ספריית אוצריא: מהדירי ספרים ─────────────────────────────────────────────

export const EDITOR_GROUPS = [
  {
    label: 'מהדירים שההדירו 10 ספרים ומעלה',
    editors: [
      { name: 'חנניה', url: 'https://otzaria.org/forum/user/%D7%97%D7%A0%D7%A0%D7%99%D7%94', description: 'טרח והשיג ספרים רבים לאוצריא' },
      { name: 'י. פל', url: 'https://forum.otzaria.org/user/%D7%99.-%D7%A4%D7%9C.' },
      { name: 'האדם החושב', url: 'https://forum.otzaria.org/user/%D7%94%D7%90%D7%93%D7%9D-%D7%94%D7%97%D7%95%D7%A9%D7%91' },
      // בתוכנה הכתובת שבורה (%D%93 במקום %D7%93 — האות ד'); כאן מתוקנת
      { name: 'י. ח. מ.', url: 'https://forum.otzaria.org/user/%D7%99%D7%95%D7%9D-%D7%97%D7%93%D7%A9-%D7%9E%D7%AA%D7%97%D7%99%D7%9C' },
      { name: 'ס. כב.', url: 'https://mitmachim.top/user/sivan22' },
      { name: 'י. צ.', url: 'https://forum.otzaria.org/user/%D7%99%D7%94%D7%95%D7%93%D7%99-%D7%A6%D7%A2%D7%99%D7%A8' },
      { name: 'קטנטן', url: 'https://forum.otzaria.org/user/%D7%A7%D7%98%D7%A0%D7%98%D7%9F' },
      { name: 'ד.', url: 'https://forum.otzaria.org/user/%D7%93%D7%90%D7%A0%D7%A6%D7%99%D7%92' },
      { name: 'י. א.' },
      { name: '333', url: 'https://forum.otzaria.org/user/333' },
      { name: 'ט. ג.', url: 'https://forum.otzaria.org/user/%D7%98%D7%9B%D7%A0%D7%95%D7%9C%D7%95%D7%92%D7%99-%D7%92%D7%95-%D7%A0%D7%99%D7%95%D7%A8' },
      { name: 'ה. ה.', url: 'https://forum.otzaria.org/user/%D7%94%D7%91%D7%9C-%D7%94%D7%91%D7%9C%D7%99%D7%9D' },
      { name: 'י. א. ח.', url: 'https://otzaria.org/forum/user/u88' },
      { name: 'מיכאלוש', url: 'https://otzaria.org/forum/user/%D7%9E%D7%99%D7%9B%D7%90%D7%9C%D7%95%D7%A9' },
      { name: 'א. צ. מ.', url: 'https://forum.otzaria.org/user/%D7%90%D7%99%D7%A9-%D7%A6%D7%93%D7%99%D7%A7-%D7%9E%D7%99%D7%93%D7%99' },
      { name: 'obs', url: 'https://otzaria.org/forum/user/ori-bensimon' },
      { name: 'shlomlaolam.' },
      { name: 'o.t.p.' }
    ]
  },
  {
    label: 'מהדירים שההדירו בין 5 ל-10 ספרים',
    editors: [
      { name: 'מויטיו', url: 'https://mitmachim.top/user/%D7%9E%D7%95%D7%99%D7%98%D7%99%D7%95' },
      { name: 'ד. מ. א.', url: 'https://forum.otzaria.org/user/%D7%93%D7%95%D7%93-%D7%9E%D7%A9%D7%94-1' },
      { name: 'שני אנשים', url: 'https://forum.otzaria.org/user/%D7%A9%D7%A0%D7%99-%D7%90%D7%A0%D7%A9%D7%99%D7%9D' },
      { name: 'י. ד.', url: 'https://forum.otzaria.org/user/%D7%99%D7%90%D7%99%D7%A8-%D7%93%D7%A0%D7%99%D7%90%D7%9C' },
      { name: 'ש. נ.' }
    ]
  }
]

/** ההערה שבסוף רשימת המהדירים — בפנייה ביחיד (בתוכנה: "באם שמכם אינו מופיע..."); המייל מצורף ברכיב */
export const EDITORS_NOTE = 'אם שמך אינו מופיע ברשימה או שברצונך בשינוי, אפשר לפנות למייל המערכת:'

// ── קרדיט זית ───────────────────────────────────────────────────────────────

/** באנגלית ו-LTR, כמו בתוכנה (_ZayitCredit) */
export const ZAYIT_CREDIT = {
  before: 'Sefaria book conversion, the fuzzy search, and the library updates are powered by the technologies that drive Zayit — ',
  url: 'https://zayitapp.com/',
  after: ' (licensed under GNU AGPL v3).'
}

/**
 * כתובת שאפשר לקשר אליה: http(s) בלבד
 * @param {unknown} url
 * @returns {url is string}
 */
export function isLinkable(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}
