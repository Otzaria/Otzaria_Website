import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  // sender=null בהודעת מערכת; בהודעת משתמש הראוטים תמיד מזינים שולח
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = הודעה למנהלים
  subject: { type: String, required: true },
  content: { type: String, required: true },
  messageType: { type: String, enum: ['user', 'system'], default: 'user' },
  allowReplies: { type: Boolean, default: true },
  senderLabel: { type: String, default: null }, // שם השולח המוצג כשאין שולח-משתמש
  systemSource: { type: String, default: null }, // מקור ההודעה במערכת
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isRead: { type: Boolean, default: false },
  replies: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// בדיקה אם המודל כבר קיים כדי למנוע שגיאות ב-Hot Reload
export default mongoose.models.Message || mongoose.model('Message', MessageSchema);