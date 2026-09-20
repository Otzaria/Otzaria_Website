import mongoose from 'mongoose';

// הרשמה עם Google שטרם הושלמה: המייל כבר אומת אצל Google, אך עדיין חסר שם
// משתמש. שומרים רשומה זמנית במקום ליצור משתמש חלקי — כך נטישה באמצע התהליך
// לא משאירה חשבון פגום, והרשומה נמחקת אוטומטית (TTL) אחרי חצי שעה.
const PendingGoogleSignupSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  // השם מחשבון ה-Google — משמש רק להצעת שם משתמש ראשוני.
  googleName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 60 * 30 },
});

const PendingGoogleSignup =
  mongoose.models.PendingGoogleSignup ||
  mongoose.model('PendingGoogleSignup', PendingGoogleSignupSchema);

export default PendingGoogleSignup;
