import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. הגדרת נתיבים (כי אין __dirname ב-ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. טעינת משתני סביבה מקובץ .env או .env.local
// אנחנו עולים תיקייה אחת למעלה (..) כי הסקריפט נמצא בתוך scripts/
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
// גיבוי: נסה לטעון גם מ-.env רגיל אם ה-local לא קיים
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error('❌ Error: ADMIN_PASSWORD is not set in .env file');
    process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';

async function createAdmin() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected successfully.');

        // --- הגדרות האדמין ---
        const email = ADMIN_EMAIL;
        const password = ADMIN_PASSWORD; 
        const name = 'Admin';
        // ---------------------

        const hashedPassword = await bcrypt.hash(password, 12);

        // גישה ישירה ל-Collection כדי למנוע בעיות עם מודלים שלא נטענו
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        const result = await usersCollection.updateOne(
            { email }, // תנאי חיפוש
            { 
                $set: { 
                    name: name, 
                    email: email, 
                    password: hashedPassword, 
                    role: 'admin',
                    // תפקידים מרובים (src/lib/roles.js): roles הוא מקור האמת — מסונכרן עם role
                    roles: ['admin'],
                    points: 1000,
                    createdAt: new Date(),
                    updatedAt: new Date()
                } 
            },
            { upsert: true } // צור אם לא קיים
        );

        if (result.upsertedCount > 0) {
            console.log(`🎉 Admin user CREATED successfully! (${email})`);
        } else {
            console.log(`♻️  Admin user UPDATED successfully! (${email})`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
        process.exit();
    }
}

createAdmin();