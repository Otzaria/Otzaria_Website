import mongoose from 'mongoose';

// מתי שירות הבדיקה במצב משיכה פנה לאחרונה ל-API שלו (/api/worker/v1/corrections) — לדף הבריאות
// בלבד. לעולם לא סיבה לכשל או לביטול של משימה.
const CorrectionsAgentStateSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  lastSeenAt: { type: Date },
  // תפיסה או תוצאה אחרונה — עבודת התור עצמה (במשיכה בלי cron היא מחליפה את דופק האצווה בדף הבריאות).
  lastWorkAt: { type: Date },
  lastRoute: { type: String },
  agentVersion: { type: String, default: null },
}, { timestamps: true });

export default mongoose.models.CorrectionsAgentState || mongoose.model('CorrectionsAgentState', CorrectionsAgentStateSchema);
