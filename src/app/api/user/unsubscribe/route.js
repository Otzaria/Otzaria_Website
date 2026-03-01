import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import mongoose from 'mongoose';
import crypto from 'crypto';

// הגדרות הצפנה
const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.scryptSync(process.env.NEXTAUTH_SECRET || 'fallback-secret', 'salt', 32);
const IV_LENGTH = 16;

// פונקציה להצפנת טקסט (מייל/ID) לטוקן אחד
export function encryptToken(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // מחזירים את ה-IV יחד עם הטקסט המוצפן בפורמט Hex
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// פונקציה לפענוח הטוקן חזרה לטקסט
function decryptToken(token) {
    try {
        const textParts = token.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    const action = searchParams.get('action');

    if (!token) return new NextResponse("Missing token", { status: 400 });

    const email = decryptToken(token);
    if (!email) return new NextResponse("Invalid or expired token", { status: 403 });

    await connectDB();
    if (action === 'new_books') {
        // הסרה מרשימת תפוצה
        const MailingList = mongoose.models.MailingList || mongoose.model('MailingList', new mongoose.Schema({ listName: String, emails: [String] }));
        await MailingList.updateOne({ listName: 'new_books_subscribers' }, { $pull: { emails: email } });
    } else if (action === 'reminder') {
        // עדכון המשתמש
        await User.updateOne({ email }, { $set: { acceptReminders: false } });
    } else if (action === 'upload_notifications') {
        // כיבוי התראות על העלאות
        await User.updateOne({ email }, { $set: { 'uploadNotifications.enabled': false } });
    }
    return new NextResponse(`
        <div dir="rtl" style="font-family: system-ui; text-align: center; padding: 100px 20px;">
            <div style="max-width: 500px; margin: 0 auto; border: 1px solid #ddd; padding: 40px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <h1 style="color: #6b5d4f;">הוסרת בהצלחה</h1>
                <p style="font-size: 18px; color: #666;">כתובת האימייל שלך הוסרה מרשימת התפוצה.</p>
                <br>
                <a href="/" style="display: inline-block; padding: 10px 20px; background: #6b5d4f; color: white; text-decoration: none; border-radius: 8px;">חזרה לאתר</a>
            </div>
        </div>
    `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// תמיכה ב-One-Click של גוגל (POST)
export async function POST(request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    const action = searchParams.get('action');
    const email = decryptToken(token);
    
    if (email) {
        await connectDB();
        if (action === 'new_books') {
            const MailingList = mongoose.models.MailingList || mongoose.model('MailingList', new mongoose.Schema({ listName: String, emails: [String] }));
            await MailingList.updateOne({ listName: 'new_books_subscribers' }, { $pull: { emails: email } });
        } else if (action === 'reminder') {
            await User.updateOne({ email }, { $set: { acceptReminders: false } });
        } else if (action === 'upload_notifications') {
            await User.updateOne({ email }, { $set: { 'uploadNotifications.enabled': false } });
        }
        return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
}