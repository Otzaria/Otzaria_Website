import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import slugify from 'slugify';
import { fileURLToPath } from 'url';

// 1. טעינת משתני סביבה
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// הגדרת נתיבים
const __filename = fileURLToPath(import.meta.url);

// קבצי המקור
const FILES_JSON_PATH = 'files.json';
const MESSAGES_JSON_PATH = 'messages.json';
const BACKUPS_JSON_PATH = 'backups.json'; // הוספנו את זה

// --- הגדרת סכמות ---
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    points: { type: Number, default: 0 },
}, { timestamps: true });

const BookSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, index: true },
    totalPages: { type: Number, default: 0 },
    completedPages: { type: Number, default: 0 },
    category: { type: String, default: 'כללי' },
    folderPath: { type: String },
}, { timestamps: true });

const PageSchema = new mongoose.Schema({
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    pageNumber: { type: Number, required: true },
    content: { type: String, default: '' },
    status: { type: String, enum: ['available', 'in-progress', 'completed'], default: 'available' },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claimedAt: { type: Date },
    completedAt: { type: Date },
    imagePath: { type: String, required: true },
}, { timestamps: true });

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    subject: { type: String, default: 'ללא נושא' },
    content: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    replies: [{
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: String,
      createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Book = mongoose.models.Book || mongoose.model('Book', BookSchema);
const Page = mongoose.models.Page || mongoose.model('Page', PageSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// --- כלי עזר ---

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    try {
        return JSON.parse(content);
    } catch (e) {
        try {
            // תמיכה ב-NDJSON (Mongo Export)
            return content.trim().split('\n').map(line => JSON.parse(line));
        } catch (e2) {
            console.error(`❌ Failed to parse ${filePath}`);
            return [];
        }
    }
}

function decodeFileName(encodedName) {
    try {
        const uriComponent = encodedName.replace(/_/g, '%');
        return decodeURIComponent(uriComponent);
    } catch (e) {
        return encodedName;
    }
}

// --- משתני מיפוי גלובליים ---
const userMap = new Map(); 
const bookMap = new Map(); 

async function restore() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.');

        // ניקוי מסד (אופציונלי)
        // await User.deleteMany({}); await Book.deleteMany({}); await Page.deleteMany({}); await Message.deleteMany({});

        console.log('📖 Reading raw files...');
        const rawFiles = readJsonFile(FILES_JSON_PATH);
        const rawBackups = readJsonFile(BACKUPS_JSON_PATH); // קריאת הגיבויים
        const rawMessages = readJsonFile(MESSAGES_JSON_PATH);

        // איחוד רשומות רלוונטיות (קבצים וגיבויים) לצורך חיפוש דפים
        const allMetadataSources = [...rawFiles, ...rawBackups];

        // ---------------------------------------------------------
        // שלב 1: משתמשים (נמצאים רק ב-files.json בד"כ)
        // ---------------------------------------------------------
        const usersEntry = rawFiles.find(f => f.path === 'data/users.json');
        if (usersEntry && usersEntry.data) {
            console.log(`Processing ${usersEntry.data.length} users...`);
            for (const u of usersEntry.data) {
                const newId = new mongoose.Types.ObjectId();
                userMap.set(u.id, newId);

                const points = u.points?.$numberInt ? parseInt(u.points.$numberInt) : (u.points || 0);

                await User.updateOne(
                    { email: u.email },
                    {
                        $set: {
                            _id: newId,
                            name: u.name,
                            password: u.password,
                            role: u.role,
                            points: points,
                            createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                        }
                    },
                    { upsert: true }
                );
            }
            console.log('✅ Users imported.');
        }

        // ---------------------------------------------------------
        // שלב 2: ספרים
        // ---------------------------------------------------------
        const booksEntry = rawFiles.find(f => f.path === 'data/books.json');
        if (booksEntry && booksEntry.data) {
            console.log(`Processing ${booksEntry.data.length} books...`);
            for (const b of booksEntry.data) {
                const newId = new mongoose.Types.ObjectId();
                const slug = slugify(b.name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
                
                bookMap.set(b.name, { _id: newId, slug });

                const totalPages = b.totalPages?.$numberInt ? parseInt(b.totalPages.$numberInt) : (b.totalPages || 0);

                await Book.updateOne(
                    { name: b.name },
                    {
                        $set: {
                            _id: newId,
                            slug: slug,
                            totalPages: totalPages,
                            completedPages: 0,
                            folderPath: `/uploads/books/${slug}`,
                            createdAt: b.createdAt ? new Date(b.createdAt) : new Date()
                        }
                    },
                    { upsert: true }
                );
            }
            console.log('✅ Books imported.');
        }

        // ---------------------------------------------------------
        // שלב 3: איחוי דפים (מ-Files ומ-Backups יחד)
        // ---------------------------------------------------------
        console.log('🧩 Merging page metadata (from files & backups) and content...');
        const pageOperations = [];
        const mergedPages = {};

        // א. מעבר על מטא-דאטה מכל המקורות (קבצים + גיבויים)
        // המיון חשוב: אם יש כפילות, האחרון קובע (אלא אם נרצה לוגיקה אחרת)
        // נרוץ קודם על files ואז על backups, בהנחה ש-backups אולי עדכני יותר או מלא יותר
        
        allMetadataSources.filter(f => f.path.startsWith('data/pages/')).forEach(fileRecord => {
            const bookName = path.basename(fileRecord.path, '.json');
            
            // דילוג אם המידע ריק (data: null)
            if (!fileRecord.data || !Array.isArray(fileRecord.data)) return;

            if (!mergedPages[bookName]) mergedPages[bookName] = {};

            fileRecord.data.forEach(p => {
                const num = p.number?.$numberInt ? parseInt(p.number.$numberInt) : p.number;
                
                // יוצרים אובייקט, דורסים אם כבר קיים (כך נתוני הגיבוי ישלימו נתונים חסרים)
                mergedPages[bookName][num] = {
                    ...mergedPages[bookName][num], // שמירה על מידע קיים אם יש
                    status: p.status,
                    claimedById: p.claimedById,
                    claimedAt: p.claimedAt,
                    completedAt: p.completedAt,
                    // השתמש בקישור מהגיבוי אם קיים, אחרת צור נתיב ברירת מחדל
                    thumbnail: p.thumbnail || `/uploads/books/${slugify(bookName, {lower:true, strict:true})}/page.${num}.jpg`
                };
            });
        });

        // ב. הוספת תוכן טקסטואלי מ-files.json (נמצא רק שם)
        rawFiles.filter(f => f.path.startsWith('data/content/')).forEach(fileRecord => {
            const fileName = path.basename(fileRecord.path, '.txt');
            const decodedName = decodeFileName(fileName);
            
            const splitIndex = decodedName.lastIndexOf('_page_');
            if (splitIndex !== -1) {
                const bookNameRaw = decodedName.substring(0, splitIndex).trim();
                let validBookName = bookNameRaw;

                // נרמול שם הספר
                if (!bookMap.has(validBookName)) {
                    const spaceName = bookNameRaw.replace(/_/g, ' ');
                    if (bookMap.has(spaceName)) validBookName = spaceName;
                }

                const pageNumStr = decodedName.substring(splitIndex + 6);
                const pageNum = parseInt(pageNumStr);

                if (bookMap.has(validBookName)) {
                    if (!mergedPages[validBookName]) mergedPages[validBookName] = {};
                    if (!mergedPages[validBookName][pageNum]) {
                        // אם לא היה מטא-דאטה, ניצור רשומה חדשה
                        mergedPages[validBookName][pageNum] = { 
                            status: 'available',
                            // השתמש בקישור מהגיבוי אם קיים, אחרת צור נתיב ברירת מחדל
                            thumbnail: p.thumbnail || `/uploads/books/${slugify(bookName, {lower:true, strict:true})}/page.${num}.jpg`
                        };
                    }
                    mergedPages[validBookName][pageNum].content = fileRecord.data?.content || '';
                }
            }
        });

        // ג. הכנה להכנסה ל-DB
        let totalPagesCount = 0;
        const bookCompletedCounts = {};

        for (const [bookName, pagesObj] of Object.entries(mergedPages)) {
            const bookInfo = bookMap.get(bookName);
            if (!bookInfo) continue;

            bookCompletedCounts[bookInfo._id] = 0;

            for (const [pageNumStr, pageData] of Object.entries(pagesObj)) {
                // המרת ID של משתמש
                let claimedByNewId = null;
                if (pageData.claimedById && userMap.has(pageData.claimedById)) {
                    claimedByNewId = userMap.get(pageData.claimedById);
                } else if (pageData.claimedById) {
                     // Fallback לאדמין אם המשתמש המקורי לא נמצא
                     claimedByNewId = userMap.values().next().value; 
                }

                if (pageData.status === 'completed') {
                    bookCompletedCounts[bookInfo._id]++;
                }

                pageOperations.push({
                    book: bookInfo._id,
                    pageNumber: parseInt(pageNumStr),
                    content: pageData.content || '',
                    status: pageData.status || 'available',
                    claimedBy: claimedByNewId,
                    claimedAt: pageData.claimedAt ? new Date(pageData.claimedAt) : null,
                    completedAt: pageData.completedAt ? new Date(pageData.completedAt) : null,
                    imagePath: pageData.thumbnail
                });
                totalPagesCount++;
            }
        }

        if (pageOperations.length > 0) {
            console.log(`Inserting ${totalPagesCount} pages...`);
            await Page.deleteMany({});
            
            const chunkSize = 500;
            for (let i = 0; i < pageOperations.length; i += chunkSize) {
                await Page.insertMany(pageOperations.slice(i, i + chunkSize));
                process.stdout.write('.');
            }
            console.log('\n✅ Pages imported.');
        }

        console.log('🔄 Updating book statistics...');
        for (const [bookId, count] of Object.entries(bookCompletedCounts)) {
            await Book.findByIdAndUpdate(bookId, { completedPages: count });
        }

        // ---------------------------------------------------------
        // שלב 4: הודעות
        // ---------------------------------------------------------
        if (rawMessages && rawMessages.length > 0) {
            console.log(`📨 Importing ${rawMessages.length} messages...`);
            const messagesToInsert = [];

            for (const msg of rawMessages) {
                const senderId = userMap.get(msg.senderId);
                
                const replies = (msg.replies || []).map(r => ({
                    sender: userMap.get(r.senderId),
                    content: r.message,
                    createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
                })).filter(r => r.sender);

                if (senderId) {
                    messagesToInsert.push({
                        sender: senderId,
                        subject: msg.subject || 'ללא נושא',
                        content: msg.message,
                        isRead: !!msg.readAt,
                        replies: replies,
                        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
                    });
                }
            }

            if (messagesToInsert.length > 0) {
                await Message.deleteMany({});
                await Message.insertMany(messagesToInsert);
            }
            console.log('✅ Messages imported.');
        }

        console.log('🎉 RESTORE COMPLETE!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error during restore:', error);
        process.exit(1);
    }
}

restore();