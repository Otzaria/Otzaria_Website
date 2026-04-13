import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import FileStorage from '@/models/FileStorage';

let bucket;

/**
 * אתחול GridFS bucket
 */
function initGridFS() {
  if (!bucket && mongoose.connection.readyState === 1) {
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
  }
  return bucket;
}

/**
 * שמירת קובץ ב-GridFS
 * @param {Buffer} fileBuffer - תוכן הקובץ
 * @param {string} filename - שם הקובץ
 * @param {string} contentType - סוג הקובץ
 * @param {Object} metadata - מטא-דטה נוספת
 * @returns {Promise<Object>} - פרטי הקובץ שנשמר
 */
export async function saveFileToGridFS(fileBuffer, filename, contentType, metadata = {}) {
  const gridfs = initGridFS();
  if (!gridfs) {
    throw new Error('GridFS לא מאותחל');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = gridfs.openUploadStream(filename, {
      contentType,
      metadata
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', async () => {
      try {
        // שמירת מטא-דטה במודל נפרד
        const fileStorage = await FileStorage.create({
          filename: filename, // השתמש בשם הקובץ שהועבר לפונקציה
          originalName: filename,
          contentType,
          size: fileBuffer.length, // השתמש בגודל הבאפר המקורי
          gridfsId: uploadStream.id, // השתמש ב-ID של ה-uploadStream
          uploadedBy: metadata.uploadedBy || null
        });

        resolve({
          fileStorageId: fileStorage._id,
          gridfsId: uploadStream.id, // השתמש ב-ID של ה-uploadStream
          filename: filename, // השתמש בשם הקובץ שהועבר לפונקציה
          size: fileBuffer.length // השתמש בגודל הבאפר המקורי
        });
      } catch (error) {
        reject(error);
      }
    });

    uploadStream.end(fileBuffer);
  });
}

/**
 * קריאת קובץ מ-GridFS
 * @param {string} gridfsId - ID של הקובץ ב-GridFS
 * @returns {Promise<Buffer>} - תוכן הקובץ
 */
export async function getFileFromGridFS(gridfsId) {
  const gridfs = initGridFS();
  if (!gridfs) {
    throw new Error('GridFS לא מאותחל');
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const downloadStream = gridfs.openDownloadStream(new mongoose.Types.ObjectId(gridfsId));

    downloadStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    downloadStream.on('error', reject);
    downloadStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * מחיקת קובץ מ-GridFS
 * @param {string} gridfsId - ID של הקובץ ב-GridFS
 * @returns {Promise<void>}
 */
export async function deleteFileFromGridFS(gridfsId) {
  const gridfs = initGridFS();
  if (!gridfs) {
    throw new Error('GridFS לא מאותחל');
  }

  await gridfs.delete(new mongoose.Types.ObjectId(gridfsId));
  
  // מחיקת המטא-דטה
  await FileStorage.findOneAndUpdate(
    { gridfsId },
    { isDeleted: true },
    { returnDocument: 'after' }
  );
}

/**
 * קבלת מידע על קובץ
 * @param {string} fileStorageId - ID של הקובץ במודל FileStorage
 * @returns {Promise<Object>} - פרטי הקובץ
 */
export async function getFileInfo(fileStorageId) {
  return await FileStorage.findById(fileStorageId);
}

/**
 * קבלת תוכן הקובץ כ-Buffer מהעלאה חדשה או ישנה
 * @param {Object} upload - מסמך Upload
 * @returns {Promise<Buffer>}
 */
export async function getUploadBuffer(upload) {
  if (!upload) {
    throw new Error('Upload document is required');
  }

  if (upload.content) {
    return Buffer.isBuffer(upload.content)
      ? upload.content
      : Buffer.from(upload.content);
  }

  if (!upload.fileStorageId) {
    return Buffer.alloc(0);
  }

  const fileStorageId =
    typeof upload.fileStorageId === 'object' && upload.fileStorageId?._id
      ? upload.fileStorageId._id
      : upload.fileStorageId;

  const fileInfo = await FileStorage.findById(fileStorageId);
  if (!fileInfo?.gridfsId) {
    return Buffer.alloc(0);
  }

  return getFileFromGridFS(fileInfo.gridfsId);
}

/**
 * קבלת תוכן הקובץ כטקסט מהעלאה חדשה או ישנה
 * @param {Object} upload - מסמך Upload
 * @param {BufferEncoding} encoding - קידוד
 * @returns {Promise<string>}
 */
export async function getUploadText(upload, encoding = 'utf-8') {
  const buffer = await getUploadBuffer(upload);
  return buffer.toString(encoding);
}
