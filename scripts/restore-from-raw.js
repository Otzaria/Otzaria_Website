import mongoose from 'mongoose';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// 1. טעינת משתני סביבה
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const FILES_JSON_PATH = 'files.json';
const MESSAGES_JSON_PATH = 'messages.json';
const BACKUPS_JSON_PATH = 'backups.json';

// --- הגדרת סכמות (בדיוק כמו בפרויקט) ---
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

const UploadSchema = new mongoose.Schema({
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookName: { type: String, required: true },
    originalFileName: { type: String },
    content: { type: String }, // כאן נכנס הטקסט
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
const Upload = mongoose.models.Upload || mongoose.model('Upload', UploadSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// --- פונקציות עזר ---

async function loadDataFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found: ${filePath}`);
        return [];
    }

    const results = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    console.log(`📖 Streaming ${filePath}...`);

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const doc = JSON.parse(line);
            results.push(doc);
        } catch (err) {}
    }

    if (results.length === 0) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) return data;
            return [data];
        } catch (e) {}
    }
    return results;
}

function decodeFileName(encodedName) {
    try {
        const uriComponent = encodedName.replace(/_/g, '%');
        return decodeURIComponent(uriComponent);
    } catch (e) { return encodedName; }
}

// יצירת slug שמשמר עברית - קריטי לתיקון הקישורים!
function createHebrewSlug(name) {
    if (!name) return 'unknown';
    // מחליף רווחים במקפים, משאיר עברית ואנגלית ומספרים
    return name.trim().replace(/\s+/g, '-').replace(/[^\w\u0590-\u05FF\-]/g, '');
}

const userMap = new Map(); 
const bookMap = new Map(); 
// מפה לשמירת תוכן טקסטואלי: שם קובץ -> תוכן
const contentMap = new Map(); 

async function restore() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.');

        // קריאת הנתונים
        const rawFiles = await loadDataFromFile(FILES_JSON_PATH);
        const rawBackups = await loadDataFromFile(BACKUPS_JSON_PATH);
        const rawMessages = await loadDataFromFile(MESSAGES_JSON_PATH);
        const allMetadataSources = [...rawFiles, ...rawBackups];

        // ---------------------------------------------------------
        // שלב 0: בניית מפת תוכן (Content Cache)
        // ---------------------------------------------------------
        console.log('📝 Building content cache...');
        rawFiles.filter(f => f.path && f.path.startsWith('data/content/')).forEach(fileRecord => {
            if (fileRecord.data && fileRecord.data.content) {
                const fileName = path.basename(fileRecord.path); // שם הקובץ המקודד (כמו ב-files.json)
                const decoded = decodeFileName(fileName); // שם מפוענח
                
                // שמירה בשתי הווריאציות כדי להבטיח התאמה
                contentMap.set(fileName, fileRecord.data.content);
                contentMap.set(decoded, fileRecord.data.content);
            }
        });
        console.log(`✅ Cached ${contentMap.size} text files.`);

        // ---------------------------------------------------------
        // שלב 1: משתמשים
        // ---------------------------------------------------------
        const usersEntry = rawFiles.find(f => f.path === 'data/users.json');
        if (usersEntry && usersEntry.data) {
            console.log(`Processing users...`);
            for (const u of usersEntry.data) {
                const newId = new mongoose.Types.ObjectId();
                const existingUser = await User.findOne({ email: u.email });
                const finalId = existingUser ? existingUser._id : newId;
                
                userMap.set(u.id, finalId);

                const points = u.points?.$numberInt ? parseInt(u.points.$numberInt) : (u.points || 0);

                await User.updateOne(
                    { email: u.email },
                    {
                        $set: {
                            name: u.name,
                            password: u.password,
                            role: u.role,
                            points: points,
                            createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                        },
                        $setOnInsert: { _id: finalId }
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
            console.log(`Processing books...`);
            for (const b of booksEntry.data) {
                const newId = new mongoose.Types.ObjectId();
                const slug = createHebrewSlug(b.name); // שימוש ב-Slug עברי תקין!
                
                const existingBook = await Book.findOne({ name: b.name });
                const finalId = existingBook ? existingBook._id : newId;

                bookMap.set(b.name, { _id: finalId, slug });

                const totalPages = b.totalPages?.$numberInt ? parseInt(b.totalPages.$numberInt) : (b.totalPages || 0);

                await Book.updateOne(
                    { name: b.name },
                    {
                        $set: {
                            slug: slug,
                            totalPages: totalPages,
                            folderPath: `/uploads/books/${slug}`,
                            createdAt: b.createdAt ? new Date(b.createdAt) : new Date()
                        },
                        $setOnInsert: { _id: finalId, completedPages: 0 }
                    },
                    { upsert: true }
                );
            }
            console.log('✅ Books imported.');
        }

        // ---------------------------------------------------------
        // שלב 3: דפים
        // ---------------------------------------------------------
        console.log('🧩 processing pages...');
        const pageOperations = [];
        const mergedPages = {};

        // איסוף מטא-דאטה
        allMetadataSources.filter(f => f.path && f.path.startsWith('data/pages/')).forEach(fileRecord => {
            const bookName = path.basename(fileRecord.path, '.json');
            if (!fileRecord.data || !Array.isArray(fileRecord.data)) return;
            if (!mergedPages[bookName]) mergedPages[bookName] = {};

            const bookInfo = bookMap.get(bookName);
            const slugForThumb = bookInfo ? bookInfo.slug : createHebrewSlug(bookName);

            fileRecord.data.forEach(p => {
                const num = p.number?.$numberInt ? parseInt(p.number.$numberInt) : p.number;
                
                // שימוש בקישור מהגיבוי אם קיים
                const defaultThumb = `/uploads/books/${slugForThumb}/page.${num}.jpg`;
                
                // נסיון למצוא תוכן טקסטואלי תואם
                // שם הקובץ בדרך כלל: "שם ספר_page_1.txt"
                const contentKey = `${bookName}_page_${num}.txt`;
                const content = contentMap.get(contentKey) || '';

                mergedPages[bookName][num] = {
                    ...mergedPages[bookName][num],
                    status: p.status,
                    claimedById: p.claimedById,
                    claimedAt: p.claimedAt,
                    completedAt: p.completedAt,
                    thumbnail: p.thumbnail || defaultThumb,
                    content: content
                };
            });
        });

        // יצירת אובייקטים להכנסה
        const bookCompletedCounts = {};

        for (const [bookName, pagesObj] of Object.entries(mergedPages)) {
            const bookInfo = bookMap.get(bookName);
            if (!bookInfo) continue;

            bookCompletedCounts[bookInfo._id] = 0;

            for (const [pageNumStr, pageData] of Object.entries(pagesObj)) {
                let claimedByNewId = null;
                if (pageData.claimedById && userMap.has(pageData.claimedById)) {
                    claimedByNewId = userMap.get(pageData.claimedById);
                } else if (pageData.claimedById) {
                     claimedByNewId = userMap.values().next().value; 
                }

                if (pageData.status === 'completed') {
                    bookCompletedCounts[bookInfo._id]++;
                }

                pageOperations.push({
                    book: bookInfo._id,
                    pageNumber: parseInt(pageNumStr),
                    content: pageData.content,
                    status: pageData.status || 'available',
                    claimedBy: claimedByNewId,
                    claimedAt: pageData.claimedAt ? new Date(pageData.claimedAt) : null,
                    completedAt: pageData.completedAt ? new Date(pageData.completedAt) : null,
                    imagePath: pageData.thumbnail
                });
            }
        }

        if (pageOperations.length > 0) {
            console.log(`Inserting ${pageOperations.length} pages...`);
            await Page.deleteMany({});
            
            const chunkSize = 500;
            for (let i = 0; i < pageOperations.length; i += chunkSize) {
                await Page.insertMany(pageOperations.slice(i, i + chunkSize));
                process.stdout.write('.');
            }
            console.log('\n✅ Pages imported.');
        }

        for (const [bookId, count] of Object.entries(bookCompletedCounts)) {
            await Book.findByIdAndUpdate(bookId, { completedPages: count });
        }

        // ---------------------------------------------------------
        // שלב 4: Uploads (תיקון הורדות)
        // ---------------------------------------------------------
        let uploadsData = [];
        const mainFileRecord = rawFiles.find(f => f.data && f.data.uploads && Array.isArray(f.data.uploads));
        
        if (mainFileRecord) {
             uploadsData = mainFileRecord.data.uploads;
        } else {
             rawFiles.forEach(f => {
                 if (f.uploads && Array.isArray(f.uploads)) uploadsData = uploadsData.concat(f.uploads);
                 if (f.data && f.data.uploads && Array.isArray(f.data.uploads)) uploadsData = uploadsData.concat(f.data.uploads);
             });
        }

        if (uploadsData.length > 0) {
            console.log(`📂 Processing ${uploadsData.length} uploads...`);
            await Upload.deleteMany({}); 

            const uploadsToInsert = uploadsData.map(u => {
                let uploaderId = null;
                let reviewerId = null;

                if (u.uploadedById && userMap.has(u.uploadedById)) {
                    uploaderId = userMap.get(u.uploadedById);
                } else {
                    uploaderId = userMap.values().next().value;
                }

                // נסיון לאתר את התוכן האמיתי של הקובץ
                // ב-Uploads, ה-fileName הוא המפתח לקובץ התוכן ב-files.json
                let realContent = '';
                if (u.fileName && contentMap.has(u.fileName)) {
                    realContent = contentMap.get(u.fileName);
                } else if (u.originalFileName && contentMap.has(u.originalFileName)) {
                    realContent = contentMap.get(u.originalFileName);
                }

                // אם לא מצאנו תוכן, נשים הודעה, אבל לא ריק לגמרי כדי שהקובץ ייווצר
                const finalContent = realContent || u.content || "התוכן לא שוחזר מהגיבוי.";

                return {
                    uploader: uploaderId,
                    bookName: u.bookName || 'ספר ללא שם',
                    originalFileName: u.originalFileName || `upload-${Date.now()}.txt`,
                    content: finalContent, // כאן התיקון! התוכן נכנס ל-DB
                    status: u.status === 'approved' ? 'approved' : u.status === 'rejected' ? 'rejected' : 'pending',
                    reviewedBy: reviewerId,
                    createdAt: u.uploadedAt ? new Date(u.uploadedAt) : new Date(),
                    updatedAt: new Date()
                };
            });

            await Upload.insertMany(uploadsToInsert);
            console.log('✅ Uploads imported with content.');
        }

        // ---------------------------------------------------------
        // שלב 5: הודעות
        // ---------------------------------------------------------
        if (rawMessages && rawMessages.length > 0) {
            console.log(`📨 Importing messages...`);
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