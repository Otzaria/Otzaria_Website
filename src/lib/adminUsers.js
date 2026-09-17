import dbConnect from '@/lib/db'
import User from '@/models/User'
import Page from '@/models/Page'
import DictaBook from '@/models/DictaBook'

// שליפת רשימת כל המשתמשים + סטטיסטיקות עמודים/ספרי-דיקטה, עבור דף ניהול המשתמשים
// (/library/admin/users). הרשימה זהה בדיוק לכל מנהל-על (role === 'admin') שצופה
// בה — אין כאן שום סינון לפי זהות הצופה. פונקציה זו משמשת גם את
// GET /api/admin/users (ללא מטמון — רענון מיידי אחרי פעולה בצד הלקוח) וגם את
// ה-Server Component של הדף עצמו (עם מטמון, ראו src/app/library/admin/users/page.jsx),
// כדי שהשאילתה תישאר זהה בשני המקומות ולא תתפצל בטעות.
export async function getAdminUsersWithStats() {
  await dbConnect()

  // 1. שליפת כל המשתמשים
  const users = await User.find({})
    .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires -verificationRequestHistory -lastResetRequest -dailyResetRequestsCount')
    .sort({ createdAt: -1 })
    .lean()

  // 2. חישוב סטטיסטיקות מתקדם (Aggregation)
  // סופר גם Completed וגם In-Progress
  const pagesStats = await Page.aggregate([
    {
      $match: {
        claimedBy: { $ne: null } // רק עמודים שיש להם משתמש משויך
      }
    },
    {
      $group: {
        _id: '$claimedBy',
        completedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        inProgressCount: {
          $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
        },
        totalCount: { $sum: 1 }
      }
    }
  ])

  // 2.5. חישוב סטטיסטיקות ספרי דיקטה - רק ספרים שהושלמו
  const dictaBooksStats = await DictaBook.aggregate([
    {
      $match: {
        claimedBy: { $ne: null },
        status: 'completed' // רק ספרים שהושלמו
      }
    },
    {
      $group: {
        _id: '$claimedBy',
        dictaBooksCount: { $sum: 1 }
      }
    }
  ])

  // 3. יצירת מפה לגישה מהירה
  const statsMap = {}
  pagesStats.forEach((stat) => {
    if (stat._id) {
      statsMap[stat._id.toString()] = {
        completed: stat.completedCount,
        inProgress: stat.inProgressCount,
        total: stat.totalCount
      }
    }
  })

  // 3.5. יצירת מפה לספרי דיקטה
  const dictaBooksMap = {}
  dictaBooksStats.forEach((stat) => {
    if (stat._id) {
      dictaBooksMap[stat._id.toString()] = stat.dictaBooksCount
    }
  })

  // 4. מיזוג הנתונים למשתמשים
  const usersWithStats = users.map((user) => {
    const stats = statsMap[user._id.toString()] || { completed: 0, inProgress: 0, total: 0 }
    const dictaBooksCount = dictaBooksMap[user._id.toString()] || 0
    return {
      ...user,
      completedPages: stats.completed, // עמודים גמורים
      inProgressPages: stats.inProgress, // עמודים בטיפול
      totalPages: stats.total, // סה"כ עמודים משויכים
      dictaBooks: dictaBooksCount // ספרי דיקטה
    }
  })

  // JSON round-trip: הופך ObjectId/Date של Mongoose לפלט JSON-רגיל, כפי שכבר
  // קורה בפועל דרך NextResponse.json ב-route — נחוץ גם כדי ש-unstable_cache
  // (המטמון בצד השרת) יוכל לשמור את הערך, וגם כדי שאפשר יהיה להעביר אותו
  // כ-prop מ-Server Component ל-Client Component.
  return JSON.parse(JSON.stringify(usersWithStats))
}
