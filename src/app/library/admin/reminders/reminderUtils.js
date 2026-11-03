/**
 * לוגיקה טהורה (ללא state/DOM) של דף שליחת תזכורות לעורכים — חולצה
 * מ-page.jsx כדי לאפשר בדיקות ישירות בלי רינדור, ללא שינוי בהתנהגות.
 */

/** מנרמל מזהה משתמש (יכול להגיע כ-ObjectId/מחרוזת/undefined) למחרוזת אחידה */
export function normalizeId(id) {
  if (!id) return null;
  return String(id).toString();
}

/** תיאור יחסי בעברית של הזמן שעבר מאז תאריך נתון (למשל "לפני 3 שעות") */
export function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'ממש עכשיו';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours === 1 ? 'שעה' : hours + ' שעות'}`;

  const days = Math.floor(hours / 24);
  return `לפני ${days === 1 ? 'יום אחד' : days + ' ימים'}`;
}

/** בניית מפת משתמשים לפי מזהה (_id ו-id כאחד) מרשימת המשתמשים */
function buildUserMap(allUsers) {
  const userMap = new Map();
  allUsers.forEach((u) => {
    if (u._id) userMap.set(normalizeId(u._id), u);
    if (u.id) userMap.set(normalizeId(u.id), u);
  });
  return userMap;
}

/**
 * איתור נמעני תזכורת עבור ספר רגיל: משתמשים שתפסו עמודים בסטטוס
 * in-progress בספר, שהם רשומים, מאמתים ומאשרים קבלת תזכורות.
 *
 * @param {Array} pages - עמודי הספר (data.pages מ-/api/book/[path])
 * @param {Array} allUsers - כל המשתמשים (מ-/api/admin/users)
 * @returns {Array<{email:string,name:string,id:string}>}
 */
export function computeRegularRecipients(pages, allUsers) {
  const userMap = buildUserMap(allUsers);
  const uniqueUsers = new Map();

  pages.forEach((page) => {
    if (page.status === 'in-progress') {
      let rawUserId = page.claimedById || page.holder;
      if (rawUserId && typeof rawUserId === 'object' && rawUserId._id) {
        rawUserId = rawUserId._id;
      }
      const userId = normalizeId(rawUserId);

      if (userId) {
        const userDetails = userMap.get(userId);
        if (userDetails && userDetails.email && userDetails.acceptReminders && userDetails.isVerified) {
          uniqueUsers.set(userDetails.email, {
            email: userDetails.email,
            name: userDetails.name || 'משתמש ללא שם',
            id: userId,
          });
        }
      }
    }
  });

  return Array.from(uniqueUsers.values());
}

/** בניית ה-HTML של מייל התזכורת */
export function generateEmailHtml(bookName, messageBody) {
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const formattedBody = messageBody.replace(/\n/g, '<br/>');
  const bookLink = `${siteUrl}/library/books/${bookName}`;

  return `
        <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px; text-align: center;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background-color: #ffffff; padding: 20px; border-bottom: 3px solid #d4a373;">
                    <img src="https://www.otzaria.org/logo.png" alt="Otzaria Logo" style="width: 120px; height: auto;">
                    <h2 style="color: #d4a373; margin: 5px 0 0 0; font-size: 20px; font-weight: bold;">ספריית אוצריא</h2>
                </div>
                <div style="padding: 30px; color: #333333;">
                    <h1 style="color: #2c3e50; font-size: 24px; margin-bottom: 10px;">הודעה בנוגע לספר: ${bookName}</h1>
                    <div style="font-size: 18px; line-height: 1.6; text-align: right; margin-bottom: 30px;">
                        ${formattedBody}
                    </div>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${bookLink}" style="background-color: #d4a373; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                            כנס לספרייה
                        </a>
                    </div>
                </div>
            </div>
        </div>
        `;
}
