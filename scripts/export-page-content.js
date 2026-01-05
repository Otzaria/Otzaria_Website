#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// --- הגדרות ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';
const OUTPUT_FILE = path.join(process.cwd(), `exported_content_${Date.now()}.txt`);

// --- הגדרת סכמות (מינימליות לצורך השליפה) ---
const Schema = mongoose.Schema;

const BookSchema = new Schema({
    name: { type: String, required: true },
    slug: { type: String }
});

const PageSchema = new Schema({
    book: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    pageNumber: { type: Number, required: true },
    content: { type: String, default: '' },
    isTwoColumns: { type: Boolean, default: false },
    rightColumn: { type: String, default: '' },
    leftColumn: { type: String, default: '' },
    rightColumnName: { type: String },
    leftColumnName: { type: String },
    status: { type: String }
});

const Book = mongoose.models.Book || mongoose.model('Book', BookSchema);
const Page = mongoose.models.Page || mongoose.model('Page', PageSchema);

async function exportContent() {
    try {
        console.log('🔌 מתחבר למסד הנתונים...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ מחובר.');

        console.log('🔍 מחפש עמודים עם תוכן...');

        // שליפת עמודים שיש בהם תוכן כלשהו (רגיל או בטורים)
        const pages = await Page.find({
            $or: [
                { content: { $exists: true, $ne: '' } },
                { rightColumn: { $exists: true, $ne: '' } },
                { leftColumn: { $exists: true, $ne: '' } }
            ]
        })
        .populate('book', 'name') // שליפת שם הספר
        .sort({ book: 1, pageNumber: 1 }); // מיון לפי ספר ועמוד

        console.log(`📊 נמצאו ${pages.length} עמודים עם תוכן.`);
        console.log(`💾 כותב לקובץ: ${OUTPUT_FILE}...`);

        const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });

        for (const page of pages) {
            const bookName = page.book ? page.book.name : 'ספר לא ידוע';
            
            // כתיבת כותרת העמוד
            stream.write('='.repeat(50) + '\n');
            stream.write(`📚 ספר: ${bookName} | עמוד: ${page.pageNumber}\n`);
            stream.write('='.repeat(50) + '\n\n');

            // כתיבת התוכן
            if (page.isTwoColumns) {
                const rightName = page.rightColumnName || 'טור ימין';
                const leftName = page.leftColumnName || 'טור שמאל';

                if (page.rightColumn) {
                    stream.write(`[--- ${rightName} ---]\n`);
                    stream.write(page.rightColumn + '\n\n');
                }
                
                if (page.leftColumn) {
                    stream.write(`[--- ${leftName} ---]\n`);
                    stream.write(page.leftColumn + '\n\n');
                }
            } else {
                if (page.content) {
                    stream.write(page.content + '\n\n');
                }
            }
            
            stream.write('\n\n'); // רווח בין עמודים
        }

        stream.end();

        console.log('✅ הייצוא הסתיים בהצלחה!');
        console.log(`📁 הקובץ נשמר ב: ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('❌ שגיאה:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 התנתקות.');
    }
}

exportContent();