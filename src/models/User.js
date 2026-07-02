import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'admin_plugins', 'admin_books', 'admin_books_only'], default: 'user' },
  points: { type: Number, default: 0 },
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
    dicta: { type: Boolean, default: false },
    fullBook: { type: Boolean, default: false },
    singlePage: { type: Boolean, default: false }
  },
  
  // הגדרות התראות על תוספים (נפרד)
  pluginNotifications: {
    enabled: { type: Boolean, default: false }
  },

  // --- מרחב עריכת הספרים הערוכים ---
  // מפקח: משתמש מהימן שעריכותיו מוחלות מיד והוא יכול לאשר הצעות של אחרים
  isSupervisor: { type: Boolean, default: false },
  // חסימה מעריכה במרחב
  dictaEditBlocked: { type: Boolean, default: false },
  dictaEditBlockedReason: { type: String, default: '' },
  dictaEditBlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dictaEditBlockedAt: { type: Date, default: null },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);


export default User;

