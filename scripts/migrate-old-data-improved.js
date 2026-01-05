#!/usr/bin/env node

/**
 * סקריפט מיגרציה משופר - גרסה סלחנית
 * מטפל בנתונים חסרים ושומר כל נתון אפשרי
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { readLargeJsonFile } = require('./safe-json-reader');

// ייבוא המודלים
const User = require('../src/models/User.js').default;
const Message = require('../src/models/Message.js').default;
const Book = require('../src/models/Book.js').default;
const Page = require('../src/models/Page.js').default;

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

// פונקציה עזר לפענוח תאריכים בטוח
function safeParseDate(dateValue) {
    if (!dateValue) return new Date();
    
    try {
        const parsed = new Date(dateValue);
        if (isNaN(parsed.getTime())) {
            return new Date(); // תאריך נוכחי אם הפענוח נכשל
        }
        return parsed;
    } catch (e) {
        return new Date();
    }
}

// פונקציה עזר למציאת זמן העדכון האחרון
function getLatestUpdateTime(pages) {
    let latestTime = new Date(0); // תאריך ברירת מחדל ישן
    
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
    console.log('✅ מסד הנתונים נוקה');
}

async function migrateUsers() {
    console.log('\n👥 מתחיל מיגרציה של משתמשים...');
    
    const filesData = await readLargeJsonFile('files.json');
    
    // אם זה מערך של אובייקטים, נחפש את זה שמכיל משתמשים
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
        let usersWithMissingData = 0;
        
        for (const oldUser of users) {
            try {
                // בדיקת שדות חיוניים
                if (!oldUser.id) {
                    console.log(`⚠️ דילוג על משתמש ללא מזהה`);
                    continue;
                }
                
                if (!oldUser.email) {
                    console.log(`⚠️ דילוג על משתמש ${oldUser.id} ללא אימייל`);
                    continue;
                }
                
                // טיפול בשדות חסרים עם ברירות מחדל
                const userName = oldUser.name || `משתמש_${oldUser.id}`;
                const userPassword = oldUser.password || '$2b$12$defaultHashedPassword'; // סיסמה ברירת מחדל
                const userRole = oldUser.role || 'user';
                const userPoints = extractValue(oldUser.points) || 0;
                
                if (!oldUser.name) {
                    console.log(`⚠️ משתמש ${oldUser.email} ללא שם - משתמש בברירת מחדל: ${userName}`);
                    usersWithMissingData++;
                }
                
                if (!oldUser.password) {
                    console.log(`⚠️ משתמש ${oldUser.email} ללא סיסמה - משתמש בברירת מחדל`);
                    usersWithMissingData++;
                }
                
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
        if (usersWithMissingData > 0) {
            console.log(`⚠️ ${usersWithMissingData} משתמשים עם נתונים חסרים תוקנו עם ברירות מחדל`);
        }
    } else {
        console.log('❌ לא נמצאו נתוני משתמשים');
    }
}

async function migrateMessages() {
    console.log('\n💬 מתחיל מיגרציה של הודעות...');
    
    const messagesContent = fs.readFileSync('messages.json', 'utf8');
    
    // פיצול לאובייקטי JSON נפרדים (JSONL format)
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
            // בדיקה אם יש לפחות נושא או תוכן - אלה השדות החיוניים
            if (!oldMessage.subject && !oldMessage.message) {
                console.log(`⚠️ דילוג על הודעה ריקה (ללא נושא ותוכן)`);
                continue;
            }
            
            const senderId = oldMessage.senderId ? userIdMapping.get(oldMessage.senderId) : null;
            const recipientId = oldMessage.recipientId ? userIdMapping.get(oldMessage.recipientId) : null;
            
            // אם אין שולח, נשמור את ההודעה בלי שולח (עם הערה)
            if (!senderId && oldMessage.senderId) {
                console.log(`⚠️ הודעה ללא שולח תקין: ${oldMessage.senderId} (${oldMessage.senderName || 'לא ידוע'}) - נשמר בלי שולח`);
                messagesWithoutSender++;
            }
            
            // עיבוד תגובות - נשמור גם תגובות ללא שולח תקין
            const processedReplies = (oldMessage.replies || []).filter(reply => {
                return reply.message; // חייב להיות תוכן
            }).map(reply => {
                const replySenderId = reply.senderId ? userIdMapping.get(reply.senderId) : null;
                
                if (!replySenderId && reply.senderId) {
                    console.log(`⚠️ תגובה ללא שולח תקין: ${reply.senderId} (${reply.senderName || 'לא ידוע'}) - נשמר בלי שולח`);
                    repliesWithoutSender++;
                }
                
                return {
                    sender: replySenderId, // יכול להיות null
                    content: reply.message,
                    createdAt: safeParseDate(reply.createdAt)
                };
            });
            
            // יצירת ההודעה עם ברירות מחדל לשדות חסרים
            const newMessage = new Message({
                sender: senderId, // יכול להיות null
                recipient: recipientId, // יכול להיות null
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
    
    const backupsContent = fs.readFileSync('backups.json', 'utf8');
    
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
        
        // הדפסת התקדמות
        if (i % 1000000 === 0) {
            console.log(`📊 עובד... ${((i / backupsContent.length) * 100).toFixed(1)}%`);
        }
    }
    
    console.log(`📊 נמצאו ${bookObjects.length} רשומות ספרים (כולל כפילויות)`);
    
    // מיזוג כפילויות - נבחר את הגרסה הטובה ביותר של כל ספר
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
    
    // בחירת הגרסה הטובה ביותר לכל ספר - לוגיקה משופרת
    const bestVersions = [];
    bookVersions.forEach((versions, bookName) => {
        // מציאת הגרסה הטובה ביותר עם לוגיקה משופרת
        const bestVersion = versions.reduce((best, current) => {
            // 1. קודם לפי עמודים גמורים (הכי חשוב)
            if (current.completedPages > best.completedPages) return current;
            if (current.completedPages < best.completedPages) return best;
            
            // 2. אם שווים בגמורים, לפי עמודים בעבודה
            if (current.inProgressPages > best.inProgressPages) return current;
            if (current.inProgressPages < best.inProgressPages) return best;
            
            // 3. אם שווים גם בעבודה, לפי סה"כ עמודים
            if (current.totalPages > best.totalPages) return current;
            if (current.totalPages < best.totalPages) return best;
            
            // 4. אם הכל שווה, נבחר לפי תאריך עדכון אחרון (אם קיים)
            const bestLatestUpdate = getLatestUpdateTime(best.data.data);
            const currentLatestUpdate = getLatestUpdateTime(current.data.data);
            
            if (currentLatestUpdate > bestLatestUpdate) return current;
            if (currentLatestUpdate < bestLatestUpdate) return best;
            
            // 5. אם הכל זהה, נשאיר את הנוכחי (הראשון שנמצא)
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
    
    const bookIdMapping = new Map();
    let migratedBooks = 0;
    let migratedPages = 0;
    let totalCompletedPages = 0;
    let totalInProgressPages = 0;
    
    for (const bookVersion of bestVersions) {
        try {
            const bookName = bookVersion.bookName;
            const bookData = bookVersion.data.data;
            
            if (!bookName || !bookData) continue;
            
            // ספירת עמודים לפי סטטוס
            const completedCount = bookData.filter(page => page.status === 'completed').length;
            const inProgressCount = bookData.filter(page => page.status === 'in-progress').length;
            
            // יצירת הספר עם הספירות הנכונות
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
            bookIdMapping.set(bookName, savedBook._id.toString());
            migratedBooks++;
            
            console.log(`📖 נוצר ספר: ${bookName} (${bookData.length} עמודים, ${completedCount} גמורים, ${inProgressCount} בעבודה)`);
            
            // יצירת העמודים עם טיפול משופר בנתונים חסרים
            const pages = [];
            let pagesWithInvalidOwners = 0;
            let pagesWithInvalidNumbers = 0;
            
            for (const pageData of bookData) {
                let claimedBy = null;
                let actualStatus = 'available';
                let claimedAt = null;
                let completedAt = null;
                
                // טיפול בבעלים
                if (pageData.claimedById) {
                    claimedBy = userIdMapping.get(pageData.claimedById);
                    if (!claimedBy) {
                        console.log(`⚠️ עמוד ${extractValue(pageData.number)} בספר "${bookName}" - בעלים לא קיים: ${pageData.claimedById}, מאפס לזמין`);
                        pagesWithInvalidOwners++;
                        actualStatus = 'available'; // איפוס לזמין
                    } else {
                        // יש בעלים תקין, נשמור את הסטטוס המקורי
                        actualStatus = pageData.status === 'completed' ? 'completed' : 
                                     pageData.status === 'in-progress' ? 'in-progress' : 'available';
                        
                        // טיפול בתאריכים
                        claimedAt = safeParseDate(pageData.claimedAt);
                        completedAt = safeParseDate(pageData.completedAt);
                        
                        // בדיקת עקביות תאריכים
                        if (actualStatus === 'completed' && !completedAt) {
                            completedAt = claimedAt || new Date(); // אם אין תאריך השלמה, נשתמש בתאריך התפיסה או נוכחי
                        }
                    }
                }
                
                // וידוא שמספר העמוד תקין
                let pageNumber = extractValue(pageData.number);
                if (!pageNumber || pageNumber < 1) {
                    console.log(`⚠️ מספר עמוד לא תקין בספר "${bookName}": ${pageData.number}, משתמש ב-1`);
                    pageNumber = 1;
                    pagesWithInvalidNumbers++;
                }
                
                const newPage = {
                    book: savedBook._id,
                    pageNumber: pageNumber,
                    content: pageData.content || '', // תוכן העמוד אם קיים
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
                console.log(`⚠️ ${pagesWithInvalidOwners} עמודים אופסו עקב בעלים לא קיימים בספר "${bookName}"`);
            }
            if (pagesWithInvalidNumbers > 0) {
                console.log(`⚠️ ${pagesWithInvalidNumbers} עמודים עם מספרים לא תקינים תוקנו בספר "${bookName}"`);
            }
            
            // הכנסה בקבוצות לביצועים טובים יותר
            const batchSize = 100;
            for (let i = 0; i < pages.length; i += batchSize) {
                const batch = pages.slice(i, i + batchSize);
                await Page.insertMany(batch);
                migratedPages += batch.length;
            }
            
            // עדכון ספירות הספר לפי הנתונים בפועל
            const actualCompletedCount = pages.filter(page => page.status === 'completed').length;
            const actualInProgressCount = pages.filter(page => page.status === 'in-progress').length;
            
            await Book.findByIdAndUpdate(savedBook._id, {
                completedPages: actualCompletedCount,
                totalPages: pages.length
            });
            
            totalCompletedPages += actualCompletedCount;
            totalInProgressPages += actualInProgressCount;
            
            console.log(`✅ ספר "${bookName}": ${pages.length} עמודים (${actualCompletedCount} גמורים, ${actualInProgressCount} בעבודה)`);
            
            if (migratedBooks % 5 === 0) {
                console.log(`✅ הועברו ${migratedBooks} ספרים עד כה...`);
            }
            
        } catch (error) {
            console.error(`❌ שגיאה בהעברת ספר ${bookVersion.bookName}:`, error.message);
        }
    }
    
    console.log(`✅ הושלמה מיגרציה של ${migratedBooks} ספרים ו-${migratedPages} עמודים`);
    console.log(`📊 סיכום: ${totalCompletedPages} עמודים גמורים, ${totalInProgressPages} עמודים בעבודה`);
}

async function validateMigration() {
    console.log('\n🔍 מאמת מיגרציה...');
    
    const userCount = await User.countDocuments();
    const messageCount = await Message.countDocuments();
    const bookCount = await Book.countDocuments();
    const pageCount = await Page.countDocuments();
    
    console.log(`📊 סיכום מיגרציה:`);
    console.log(`   👥 משתמשים: ${userCount}`);
    console.log(`   💬 הודעות: ${messageCount}`);
    console.log(`   📚 ספרים: ${bookCount}`);
    console.log(`   📄 עמודים: ${pageCount}`);
    
    // בדיקות נוספות
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const completedPages = await Page.countDocuments({ status: 'completed' });
    const inProgressPages = await Page.countDocuments({ status: 'in-progress' });
    const availablePages = await Page.countDocuments({ status: 'available' });
    const messagesWithReplies = await Message.countDocuments({ 'replies.0': { $exists: true } });
    const messagesWithoutSender = await Message.countDocuments({ sender: null });
    const pagesWithoutOwner = await Page.countDocuments({ claimedBy: null, status: { $ne: 'available' } });
    
    console.log(`\n📈 סטטיסטיקות נוספות:`);
    console.log(`   👑 מנהלים: ${adminUsers}`);
    console.log(`   ✅ עמודים גמורים: ${completedPages}`);
    console.log(`   🔄 עמודים בעבודה: ${inProgressPages}`);
    console.log(`   ⏳ עמודים זמינים: ${availablePages}`);
    console.log(`   💬 הודעות עם תגובות: ${messagesWithReplies}`);
    console.log(`   ⚠️ הודעות ללא שולח: ${messagesWithoutSender}`);
    console.log(`   ⚠️ עמודים לא זמינים ללא בעלים: ${pagesWithoutOwner}`);
    
    // בדיקת עקביות ספירות בספרים
    console.log(`\n🔍 בדיקת עקביות ספירות:`);
    const books = await Book.find();
    let inconsistentBooks = 0;
    
    for (const book of books) {
        const actualCompleted = await Page.countDocuments({ book: book._id, status: 'completed' });
        const actualTotal = await Page.countDocuments({ book: book._id });
        
        if (actualCompleted !== book.completedPages || actualTotal !== book.totalPages) {
            console.log(`⚠️ אי-עקביות בספר "${book.name}": רשום ${book.completedPages}/${book.totalPages}, בפועל ${actualCompleted}/${actualTotal}`);
            inconsistentBooks++;
            
            // תיקון אוטומטי
            await Book.findByIdAndUpdate(book._id, {
                completedPages: actualCompleted,
                totalPages: actualTotal
            });
            console.log(`✅ תוקן ספר "${book.name}"`);
        }
    }
    
    if (inconsistentBooks === 0) {
        console.log(`✅ כל הספירות עקביות`);
    } else {
        console.log(`🔧 תוקנו ${inconsistentBooks} ספרים`);
    }
}

async function main() {
    console.log('🚀 מתחיל מיגרציה משופרת של נתונים ישנים...\n');
    
    try {
        await connectDB();
        
        // אזהרה למשתמש
        console.log('⚠️  אזהרה: פעולה זו תמחק את כל הנתונים הקיימים במסד!');
        console.log('⚠️  לחץ Ctrl+C כדי לבטל, או המתן 5 שניות להמשך...\n');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await clearDatabase();
        await migrateUsers();
        await migrateMessages();
        await migrateBooksAndPages();
        await validateMigration();
        
        console.log('\n🎉 מיגרציה משופרת הושלמה בהצלחה!');
        console.log('💡 הסקריפט שמר כל נתון אפשרי, כולל נתונים עם מידע חסר');
        
    } catch (error) {
        console.error('❌ שגיאה במיגרציה:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 התנתקות מהמסד');
    }
}

// הרצה רק אם זה הקובץ הראשי
if (require.main === module) {
    main();
}

module.exports = { main };