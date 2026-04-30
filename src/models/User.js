import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
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
  }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);


export default User;

