#!/usr/bin/env node

/**
 * סקריפט מיגרציה מלא - כולל uploads עם תוכן ופרטים
 */

const fs = require('fs');
const mongoose = require('mongoose');
const { readLargeJsonFile } = require('./safe-json-reader');

// ייבוא המודלים
const User = require('../src/models/User.js').default;
const Message = require('../src/models/Message.js').default;
const Book = require('../src/models/Book.js').default;
const Page = require('../src/models/Page.js').default;
const Upload = require('../src/models/Upload.js').default;

// הגדרות
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';

// פונקציות עזר
function extractValue(val) {
    if (val && typeof val === 'object') {
        if (val.$numberInt) return parseInt(val.$numberInt);
        if (val.$oid) return val.$oid;
        if (val.$date && val.$date.$numberLong) return new Date(parseInt(val.$date.$numberLong));
        if (val.$date) return new Date(val.$date);
    }
    return val;
}

function createSlug(name) {
    if (!name) return 'unknown-' + Date.now();
    return name.trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u0590-\u05FF\-]/g, '')
        .toLowerCase();
}

function safeParseDate(dateValue) {
    if (!dateValue) return new Date();
    
    try {
        const parsed = new Date(dateValue);
        if (isNaN(parsed.getTime())) {
            return new Date();
        }
        return parsed;
    } catch (e) {
        return new Date();
    }
}

function getLatestUpdateTime(pages) {
    let latestTime = new Date(0);
    
    pages.forEach(page => {
        if (page.updatedAt) {
            const updateTime = safeParseDate(page.updatedAt);
            if (updateTime > latestTime) {
                latestTime = updateTime;
            }
        }
        if (page.completedAt) {
            const completedTime = safeParseDate(page.completedAt);
            if (completedTime > latestTime) {
                latestTime = completedTime;
            }
        }
        if (page.claimedAt) {
            const claimedTime = safeParseDate(page.claimedAt);
            if (claimedTime > latestTime) {
                latestTime = claimedTime;
            }
        }
    });
    
    return latestTime;
}

// מיפוי משתמשים ישנים לחדשים
const userIdMapping = new Map();

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ התחברות למסד הנתונים הצליחה');
    } catch (error) {
        console.error('❌ שגיאה בהתחברות למסד הנתונים:', error);
        process.exit(1);
    }
}

async function clearDatabase() {
    console.log('🧹 מנקה מסד נתונים קיים...');
    await User.deleteMany({});
    await Message.deleteMany({});
    await Book.deleteMany({});
    await Page.deleteMany({});
    await Upload.deleteMany({});
    console.log('✅ מסד הנתונים נוקה');
}

async function migrateUsers() {
    console.log('\n👥 מתחיל מיגרציה של משתמשים...');
    
    const filesData = await readLargeJsonFile('files.json');
    
    let usersData = null;
    if (Array.isArray(filesData)) {
        usersData = filesData.find(item => item.path === 'data/users.json');
    } else if (filesData.path === 'data/users.json') {
        usersData = filesData;
    }
    
    if (usersData && Array.isArray(usersData.data)) {
        const users = usersData.data;
        console.log(`📊 נמצאו ${users.length} משתמשים`);
        
        let migratedCount = 0;
        
        for (const oldUser of users) {
            try {
                if (!oldUser.id || !oldUser.email) continue;
                
                const userName = oldUser.name || `משתמש_${oldUser.id}`;
                const userPassword = oldUser.password || '$2b$12$defaultHashedPassword';
                const userRole = oldUser.role || 'user';
                const userPoints = extractValue(oldUser.points) || 0;
                
                const newUser = new User({
                    name: userName,
                    email: oldUser.email,
                    password: userPassword,
                    role: userRole,
                    points: userPoints,
                    createdAt: safeParseDate(oldUser.createdAt),
                    updatedAt: safeParseDate(oldUser.passwordChangedAt) || safeParseDate(oldUser.createdAt)
                });
                
                const savedUser = await newUser.save();
                userIdMapping.set(oldUser.id, savedUser._id.toString());
                migratedCount++;
                
                if (migratedCount % 10 === 0) {
                    console.log(`✅ הועברו ${migratedCount} משתמשים`);
                }
            } catch (error) {
                console.error(`❌ שגיאה בהעברת משתמש ${oldUser.email || oldUser.id}:`, error.message);
            }
        }
        
        console.log(`✅ הושלמה מיגרציה של ${migratedCount} משתמשים`);
    }
}

async function migrateMessages() {
    console.log('\n💬 מתחיל מיגרציה של הודעות...');
    
    const messagesContent = fs.readFileSync('messages.json', 'utf8');
    
    const messageObjects = [];
    let currentObject = '';
    let braceCount = 0;
    
    for (let i = 0; i < messagesContent.length; i++) {
        const char = messagesContent[i];
        currentObject += char;
        
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        
        if (braceCount === 0 && currentObject.trim()) {
            try {
                const messageObj = JSON.parse(currentObject.trim());
                messageObjects.push(messageObj);
                currentObject = '';
            } catch (e) {
                // המשך לתו הבא
            }
        }
    }
    
    console.log(`📊 נמצאו ${messageObjects.length} הודעות`);
    
    let migratedCount = 0;
    let messagesWithoutSender = 0;
    let repliesWithoutSender = 0;
    
    for (const oldMessage of messageObjects) {
        try {
            if (!oldMessage.subject && !oldMessage.message) continue;
            
            const senderId = oldMessage.senderId ? userIdMapping.get(oldMessage.senderId) : null;
            const recipientId = oldMessage.recipientId ? userIdMapping.get(oldMessage.recipientId) : null;
            
            if (!senderId && oldMessage.senderId) {
                messagesWithoutSender++;
            }
            
            const processedReplies = (oldMessage.replies || []).filter(reply => {
                return reply.message;
            }).map(reply => {
                const replySenderId = reply.senderId ? userIdMapping.get(reply.senderId) : null;
                
                if (!replySenderId && reply.senderId) {
                    repliesWithoutSender++;
                }
                
                return {
                    sender: replySenderId,
                    content: reply.message,
                    createdAt: safeParseDate(reply.createdAt)
                };
            });
            
            const newMessage = new Message({
                sender: senderId,
                recipient: recipientId,
                subject: oldMessage.subject || 'ללא נושא',
                content: oldMessage.message || 'ללא תוכן',
                isRead: oldMessage.status === 'read',
                replies: processedReplies,
                createdAt: safeParseDate(oldMessage.createdAt),
                updatedAt: safeParseDate(oldMessage.updatedAt)
            });
            
            await newMessage.save();
            migratedCount++;
            
            if (migratedCount % 50 === 0) {
                console.log(`✅ הועברו ${migratedCount} הודעות`);
            }
        } catch (error) {
            console.error(`❌ שגיאה בהעברת הודעה "${oldMessage.subject || 'ללא נושא'}":`, error.message);
        }
    }
    
    console.log(`✅ הושלמה מיגרציה של ${migratedCount} הודעות`);
    if (messagesWithoutSender > 0) {
        console.log(`⚠️ ${messagesWithoutSender} הודעות נשמרו ללא שולח תקין`);
    }
    if (repliesWithoutSender > 0) {
        console.log(`⚠️ ${repliesWithoutSender} תגובות נשמרו ללא שולח תקין`);
    }
}

async function migrateBooksAndPages() {
    console.log('\n📚 מתחיל מיגרציה של ספרים ועמודים...');
    
    // קריאת נתוני הדפים מ-backups.json
    const backupsContent = fs.readFileSync('backups.json', 'utf8');
    
    // קריאת תוכן הדפים מ-files.json
    console.log('🔄 טוען תוכן דפים מ-files.json...');
    const filesData = await readLargeJsonFile('files.json');
    
    // מיפוי תוכן הדפים
    const pageContentMap = new Map();
    const uploadContentMap = new Map();
    
    if (Array.isArray(filesData)) {
        filesData.forEach(item => {
            if (item.path && item.data && item.data.content) {
                if (item.path.includes('data/content/')) {
                    const fileName = item.path.replace('data/content/', '').replace('.txt', '');
                    pageContentMap.set(fileName, item.data.content);
                } else if (item.path.includes('data/uploads/')) {
                    const fileName = item.path.replace('data/uploads/', '').replace('.txt', '');
                    uploadContentMap.set(fileName, item.data.content);
                }
            }
        });
    }
    
    console.log(`📄 נמצאו ${pageContentMap.size} דפים עם תוכן בעבודה`);
    console.log(`📄 נמצאו ${uploadContentMap.size} דפים עם תוכן שהועלו`);
    
    // פיצול לאובייקטי JSON נפרדים
    const bookObjects = [];
    let currentObject = '';
    let braceCount = 0;
    
    console.log('🔄 מפרק קובץ backups.json...');
    
    for (let i = 0; i < backupsContent.length; i++) {
        const char = backupsContent[i];
        currentObject += char;
        
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        
        if (braceCount === 0 && currentObject.trim()) {
            try {
                const bookObj = JSON.parse(currentObject.trim());
                if (bookObj.path && bookObj.path.includes('data/pages/') && bookObj.data) {
                    bookObjects.push(bookObj);
                }
                currentObject = '';
            } catch (e) {
                // המשך לתו הבא
            }
        }
        
        if (i % 1000000 === 0) {
            console.log(`📊 עובד... ${((i / backupsContent.length) * 100).toFixed(1)}%`);
        }
    }
    
    console.log(`📊 נמצאו ${bookObjects.length} רשומות ספרים (כולל כפילויות)`);
    
    // מיזוג כפילויות
    const bookVersions = new Map();
    
    bookObjects.forEach((bookData) => {
        const bookName = bookData.path.replace('data/pages/', '').replace('.json', '');
        
        if (!bookVersions.has(bookName)) {
            bookVersions.set(bookName, []);
        }
        
        bookVersions.get(bookName).push({
            data: bookData,
            totalPages: bookData.data.length,
            completedPages: bookData.data.filter(page => page.status === 'completed').length,
            inProgressPages: bookData.data.filter(page => page.status === 'in-progress').length
        });
    });
    
    console.log(`📚 נמצאו ${bookVersions.size} ספרים ייחודיים`);
    
    // בחירת הגרסה הטובה ביותר לכל ספר
    const bestVersions = [];
    bookVersions.forEach((versions, bookName) => {
        const bestVersion = versions.reduce((best, current) => {
            if (current.completedPages > best.completedPages) return current;
            if (current.completedPages < best.completedPages) return best;
            
            if (current.inProgressPages > best.inProgressPages) return current;
            if (current.inProgressPages < best.inProgressPages) return best;
            
            if (current.totalPages > best.totalPages) return current;
            if (current.totalPages < best.totalPages) return best;
            
            const bestLatestUpdate = getLatestUpdateTime(best.data.data);
            const currentLatestUpdate = getLatestUpdateTime(current.data.data);
            
            if (currentLatestUpdate > bestLatestUpdate) return current;
            if (currentLatestUpdate < bestLatestUpdate) return best;
            
            return best;
        });
        
        bestVersions.push({
            bookName,
            ...bestVersion
        });
        
        if (versions.length > 1) {
            console.log(`🔄 ספר "${bookName}": נבחרה גרסה עם ${bestVersion.completedPages} עמודים גמורים מתוך ${versions.length} גרסאות`);
        }
    });
    
    console.log(`✅ נבחרו ${bestVersions.length} גרסאות טובות ביותר`);
    
    let migratedBooks = 0;
    let migratedPages = 0;
    let totalCompletedPages = 0;
    let totalInProgressPages = 0;
    let pagesWithContent = 0;
    let pagesWithUploadContent = 0;
    
    for (const bookVersion of bestVersions) {
        try {
            const bookName = bookVersion.bookName;
            const bookData = bookVersion.data.data;
            
            if (!bookName || !bookData) continue;
            
            const completedCount = bookData.filter(page => page.status === 'completed').length;
            const inProgressCount = bookData.filter(page => page.status === 'in-progress').length;
            
            const newBook = new Book({
                name: bookName,
                slug: createSlug(bookName),
                totalPages: bookData.length,
                completedPages: completedCount,
                category: 'כללי',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            const savedBook = await newBook.save();
            migratedBooks++;
            
            console.log(`📖 נוצר ספר: ${bookName} (${bookData.length} עמודים, ${completedCount} גמורים, ${inProgressCount} בעבודה)`);
            
            const pages = [];
            let pagesWithInvalidOwners = 0;
            
            for (const pageData of bookData) {
                let claimedBy = null;
                let actualStatus = 'available';
                let claimedAt = null;
                let completedAt = null;
                
                // טיפול בבעלים ובסטטוס
                if (pageData.claimedById) {
                    claimedBy = userIdMapping.get(pageData.claimedById);
                    if (!claimedBy) {
                        pagesWithInvalidOwners++;
                        
                        if (pageData.status === 'completed') {
                            actualStatus = 'completed';
                            completedAt = safeParseDate(pageData.completedAt) || safeParseDate(pageData.claimedAt) || new Date();
                        } else if (pageData.status === 'in-progress') {
                            actualStatus = 'in-progress';
                            claimedAt = safeParseDate(pageData.claimedAt) || new Date();
                        } else {
                            actualStatus = 'available';
                        }
                    } else {
                        actualStatus = pageData.status === 'completed' ? 'completed' : 
                                     pageData.status === 'in-progress' ? 'in-progress' : 'available';
                        
                        claimedAt = safeParseDate(pageData.claimedAt);
                        completedAt = safeParseDate(pageData.completedAt);
                        
                        if (actualStatus === 'completed' && !completedAt) {
                            completedAt = claimedAt || new Date();
                        }
                    }
                } else {
                    if (pageData.status === 'completed') {
                        actualStatus = 'completed';
                        completedAt = safeParseDate(pageData.completedAt) || new Date();
                    } else {
                        actualStatus = 'available';
                    }
                }
                
                let pageNumber = extractValue(pageData.number);
                if (!pageNumber || pageNumber < 1) {
                    pageNumber = 1;
                }
                
                // שחזור תוכן העמוד
                let pageContent = pageData.content || '';
                
                // חיפוש תוכן בקבצי content
                const contentKey1 = `${bookName}_page_${pageNumber}`;
                const contentKey2 = `${bookName.replace(/\s+/g, '_')}_page_${pageNumber}`;
                
                if (pageContentMap.has(contentKey1)) {
                    pageContent = pageContentMap.get(contentKey1);
                    pagesWithContent++;
                } else if (pageContentMap.has(contentKey2)) {
                    pageContent = pageContentMap.get(contentKey2);
                    pagesWithContent++;
                }
                
                // חיפוש תוכן בקבצי uploads
                const uploadKeys = [
                    `${bookName} _ עמוד ${pageNumber}_`,
                    `${bookName}_עמוד_${pageNumber}_`,
                    `${bookName}_page_${pageNumber}_`
                ];
                
                for (const [uploadKey, uploadContent] of uploadContentMap.entries()) {
                    if (uploadKeys.some(key => uploadKey.includes(key))) {
                        pageContent = uploadContent;
                        pagesWithUploadContent++;
                        break;
                    }
                }
                
                const newPage = {
                    book: savedBook._id,
                    pageNumber: pageNumber,
                    content: pageContent,
                    status: actualStatus,
                    claimedBy: claimedBy,
                    claimedAt: claimedAt,
                    completedAt: completedAt,
                    imagePath: pageData.thumbnail || `/uploads/books/${createSlug(bookName)}/page-${pageNumber}.jpg`,
                    createdAt: safeParseDate(pageData.createdAt) || new Date(),
                    updatedAt: safeParseDate(pageData.updatedAt) || new Date()
                };
                
                pages.push(newPage);
            }
            
            if (pagesWithInvalidOwners > 0) {
                console.log(`⚠️ ${pagesWithInvalidOwners} עמודים עם בעלים לא תקינים נשמרו עם הסטטוס המקורי בספר "${bookName}"`);
            }
            
            // הכנסה בקבוצות
            const batchSize = 100;
            for (let i = 0; i < pages.length; i += batchSize) {
                const batch = pages.slice(i, i + batchSize);
                await Page.insertMany(batch);
                migratedPages += batch.length;
            }
            
            // עדכון ספירות הספר
            const actualCompletedCount = pages.filter(page => page.status === 'completed').length;
            const actualInProgressCount = pages.filter(page => page.status === 'in-progress').length;
            
            await Book.findByIdAndUpdate(savedBook._id, {
                completedPages: actualCompletedCount,
                totalPages: pages.length
            });
            
            totalCompletedPages += actualCompletedCount;
            totalInProgressPages += actualInProgressCount;
            
            console.log(`✅ ספר "${bookName}": ${pages.length} עמודים (${actualCompletedCount} גמורים, ${actualInProgressCount} בעבודה)`);
            
        } catch (error) {
            console.error(`❌ שגיאה בהעברת ספר ${bookVersion.bookName}:`, error.message);
        }
    }
    
    console.log(`✅ הושלמה מיגרציה של ${migratedBooks} ספרים ו-${migratedPages} עמודים`);
    console.log(`📊 סיכום: ${totalCompletedPages} עמודים גמורים, ${totalInProgressPages} עמודים בעבודה`);
    console.log(`📄 שוחזר תוכן עבור ${pagesWithContent} דפים מקבצי content`);
    console.log(`📄 שוחזר תוכן עבור ${pagesWithUploadContent} דפים מקבצי uploads`);
}

async function migrateUploads() {
    console.log('\n📤 מתחיל מיגרציה של קבצי uploads...');
    
    const filesData = await readLargeJsonFile('files.json');
    
    // מציאת נתוני uploads-meta
    const uploadsMetaFile = filesData.find(item => item.path === 'data/uploads-meta.json');
    
    if (!uploadsMetaFile || !uploadsMetaFile.data) {
        console.log('❌ לא נמצאו נתוני uploads-meta');
        return;
    }
    
    const uploadsData = uploadsMetaFile.data;
    console.log(`📊 נמצאו ${uploadsData.length} קבצי uploads`);
    
    // יצירת מיפוי תוכן הקבצים
    const uploadContentMap = new Map();
    filesData.forEach(item => {
        if (item.path && item.path.includes('data/uploads/') && item.data && item.data.content) {
            const fileName = item.path.replace('data/uploads/', '').replace('.txt', '');
            uploadContentMap.set(fileName, item.data.content);
        }
    });
    
    let migratedCount = 0;
    let uploadsWithoutUploader = 0;
    let uploadsWithContent = 0;
    
    for (const uploadData of uploadsData) {
        try {
            if (!uploadData.bookName) continue;
            
            // מציאת המשתמש שהעלה
            let uploaderId = null;
            if (uploadData.uploadedById) {
                uploaderId = userIdMapping.get(uploadData.uploadedById);
                if (!uploaderId) {
                    console.log(`⚠️ upload "${uploadData.fileName || 'ללא שם'}" - מעלה לא קיים: ${uploadData.uploadedById} (${uploadData.uploadedBy || 'לא ידוע'})`);
                    uploadsWithoutUploader++;
                }
            }
            
            // חיפוש תוכן הקובץ
            let fileContent = '';
            if (uploadData.fileName) {
                const contentKey = uploadData.fileName.replace('.txt', '');
                if (uploadContentMap.has(contentKey)) {
                    fileContent = uploadContentMap.get(contentKey);
                    uploadsWithContent++;
                    
                    // debug - הדפסה לכמה קבצים ראשונים
                    if (uploadsWithContent <= 3) {
                        console.log(`🔍 Debug: קובץ "${uploadData.fileName}" - תוכן: ${fileContent.length} תווים`);
                    }
                }
            }
            
            // יצירת ה-upload
            const uploadDoc = {
                bookName: uploadData.bookName,
                originalFileName: uploadData.originalFileName || uploadData.fileName || 'ללא שם',
                content: fileContent,
                status: uploadData.status || 'pending',
                createdAt: safeParseDate(uploadData.uploadedAt),
                updatedAt: safeParseDate(uploadData.uploadedAt)
            };
            
            // הוספת uploader רק אם קיים
            if (uploaderId) {
                uploadDoc.uploader = uploaderId;
            }
            
            const newUpload = new Upload(uploadDoc);
            await newUpload.save();
            migratedCount++;
            
            if (migratedCount % 50 === 0) {
                console.log(`✅ הועברו ${migratedCount} uploads`);
            }
        } catch (error) {
            console.error(`❌ שגיאה בהעברת upload "${uploadData.fileName || 'ללא שם'}":`, error.message);
        }
    }
    
    console.log(`✅ הושלמה מיגרציה של ${migratedCount} קבצי uploads`);
    if (uploadsWithoutUploader > 0) {
        console.log(`⚠️ ${uploadsWithoutUploader} uploads נשמרו ללא מעלה תקין`);
    }
    console.log(`📄 שוחזר תוכן עבור ${uploadsWithContent} קבצי uploads`);
}

async function validateMigration() {
    console.log('\n🔍 מאמת מיגרציה...');
    
    const userCount = await User.countDocuments();
    const messageCount = await Message.countDocuments();
    const bookCount = await Book.countDocuments();
    const pageCount = await Page.countDocuments();
    const uploadCount = await Upload.countDocuments();
    
    console.log(`📊 סיכום מיגרציה:`);
    console.log(`   👥 משתמשים: ${userCount}`);
    console.log(`   💬 הודעות: ${messageCount}`);
    console.log(`   📚 ספרים: ${bookCount}`);
    console.log(`   📄 עמודים: ${pageCount}`);
    console.log(`   📤 uploads: ${uploadCount}`);
    
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const completedPages = await Page.countDocuments({ status: 'completed' });
    const inProgressPages = await Page.countDocuments({ status: 'in-progress' });
    const availablePages = await Page.countDocuments({ status: 'available' });
    const pendingUploads = await Upload.countDocuments({ status: 'pending' });
    const approvedUploads = await Upload.countDocuments({ status: 'approved' });
    
    console.log(`\n📈 סטטיסטיקות נוספות:`);
    console.log(`   👑 מנהלים: ${adminUsers}`);
    console.log(`   ✅ עמודים גמורים: ${completedPages}`);
    console.log(`   🔄 עמודים בעבודה: ${inProgressPages}`);
    console.log(`   ⏳ עמודים זמינים: ${availablePages}`);
    console.log(`   ⏳ uploads ממתינים: ${pendingUploads}`);
    console.log(`   ✅ uploads מאושרים: ${approvedUploads}`);
}

async function main() {
    console.log('🚀 מתחיל מיגרציה מלאה של נתונים ישנים...\n');
    
    try {
        await connectDB();
        
        console.log('⚠️  אזהרה: פעולה זו תמחק את כל הנתונים הקיימים במסד!');
        console.log('⚠️  לחץ Ctrl+C כדי לבטל, או המתן 5 שניות להמשך...\n');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await clearDatabase();
        await migrateUsers();
        await migrateMessages();
        await migrateBooksAndPages();
        await migrateUploads();
        await validateMigration();
        
        console.log('\n🎉 מיגרציה מלאה הושלמה בהצלחה!');
        console.log('💡 כל הנתונים שוחזרו כולל תוכן הדפים וקבצי ה-uploads');
        console.log('📄 קבצי ה-uploads כוללים את כל הפרטים: שם, מעלה, סטטוס ותאריך');
        
    } catch (error) {
        console.error('❌ שגיאה במיגרציה:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 התנתקות מהמסד');
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };