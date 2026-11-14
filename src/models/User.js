import mongoose from 'mongoose';
import { ROLE_ENUM, ASSIGNABLE_ROLES } from '../lib/roles.js';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  // אופציונלי: חשבון שנוצר דרך התחברות עם Google אין לו סיסמה כלל (ההתחברות
  // בסיסמה נדחית עבורו). בהרשמה הרגילה הסיסמה עדיין חובה, ונאכפת בראוט ההרשמה.
  password: { type: String },
  // תפקידים (src/lib/roles.js): roles הוא מקור האמת — משתמש יכול להחזיק כמה תפקידים יחד. role הוא
  // התפקיד הראשי (primaryRole של roles), נשמר מסונכרן לתאימות לאחור; רשומה ישנה בלי roles — התפקיד
  // שלה הוא role. לבדוק הרשאות רק דרך העוזרים ב-roles.js (getRoles/hasXAccess), לא בהשוואה ל-role.
  role: { type: String, enum: ROLE_ENUM, default: 'user' },
  roles: { type: [{ type: String, enum: ASSIGNABLE_ROLES }], default: undefined },
  points: { type: Number, default: 0 },
  // מזהי תופעות לוואי של צורת הדף — מאפשרים ניקוד idempotent ללא transaction מרובת מסמכים.
  tzuratPointEvents: { type: [String], default: [] },
  acceptReminders: { type: Boolean, default: false },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  lastResetRequest: { type: Date },
  dailyResetRequestsCount: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpires: { type: Date },
  verificationRequestHistory: [{ type: Date }],
  lastSubscriptionReminderDismissedAt: { type: Date },
  
  savedSearches: [{
    id: { type: String },
    findText: { type: String },
    replaceText: { type: String },
    label: { type: String },
    isRemoveDigits: { type: Boolean, default: false }
  }],
  hiddenInstructionsBooks: { type: [String], default: [] },
  spellWords: { type: [String], default: [] },
  
  // הגדרות התראות על העלאות
  uploadNotifications: {
    enabled: { type: Boolean, default: false },
    fullBook: { type: Boolean, default: false },
    singlePage: { type: Boolean, default: false }
  },
  
  // הגדרות התראות על תוספים (נפרד)
  pluginNotifications: {
    enabled: { type: Boolean, default: false }
  },

  // הודעת המערכת החד-פעמית על דיווחי תוספים כבר נשלחה למשתמש זה
  pluginReportNoticeSent: { type: Boolean, default: false },

  // --- מרחב עריכת הספרים הערוכים ---
  // מפקח: משתמש מהימן שעריכותיו מוחלות מיד והוא יכול לאשר הצעות של אחרים
  isSupervisor: { type: Boolean, default: false },
  // חסימה מעריכה במרחב
  dictaEditBlocked: { type: Boolean, default: false },
  dictaEditBlockedReason: { type: String, default: '' },
  dictaEditBlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dictaEditBlockedAt: { type: Date, default: null },

  // מתנדב תיקוני טקסט: רשאי לטפל ולאשר תיקונים (נפרד מהרשאות ניהול המערכת)
  isCorrectionsVolunteer: { type: Boolean, default: false },

  // צורת הדף (docs/tzurat-hadaf/CONTRACT.md): המתנדב סיים את התרגול של המסלול המהיר
  tzuratPracticeDone: { type: Boolean, default: false },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);


export default User;

