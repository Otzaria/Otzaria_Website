import { useState } from 'react'
import { apiPost, apiUpload } from '@/lib/api-utils'

export function useOCR() {
  const [isProcessing, setIsProcessing] = useState(false)

  const performGeminiOCR = async (croppedBlob, apiKey, model, prompt) => {
    const reader = new FileReader()
    const base64Promise = new Promise((resolve) => {
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.readAsDataURL(croppedBlob)
    })

    const imageBase64 = await base64Promise

    const result = await apiPost('/api/gemini-ocr', {
      imageBase64,
      model,
      userApiKey: apiKey || undefined,
      customPrompt: prompt || undefined
    })
    return result.text
  }

const performTesseractOCR = async (croppedBlob, onProgress) => {
    const Tesseract = (await import('tesseract.js')).default;

    try {
      // בגרסה 7, עדיף להשתמש ב-recognize הישיר. 
      // הוא מטפל בעצמו ביצירת ה-worker ובטעינת השפות.
      const { data: { text } } = await Tesseract.recognize(
        croppedBlob,
        'heb+heb_rashi', // כאן אנחנו מחזירים את המחרוזת עם הפלוס
        {
          // הגדרות הנתיב המקומי
          langPath: window.location.origin + '/tessdata',
          gzip: false,
          
          // לוגר התקדמות (כאן הוא עובד בצורה בטוחה יותר בתוך ה-options)
          logger: m => {
            if (m.status === 'recognizing text' && onProgress) {
              onProgress(Math.round(m.progress * 100));
            }
          },

          // הגדרת פרמטרים לשיפור הדיוק
          tessedit_char_whitelist: 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ"\'.,-: ',
        }
      );

      return text.trim();

    } catch (error) {
      console.error('Tesseract Error:', error);
      
      // אם יש שגיאת WASM (כמו DotProductSSE), ננסה פעם אחרונה בלי רש"י כדי לוודא שזה לא קובץ פגום
      if (error.message.includes('DotProductSSE')) {
         throw new Error('שגיאת מעבד (SIMD). נסה לרענן את הדף או להשתמש בדפדפן אחר.');
      }
      
      throw new Error('זיהוי הטקסט נכשל. וודא שקבצי המודל בתיקיית public/tessdata תקינים.');
    }
  };

  // בתוך ה-Hook useOCR
  const performOCRWin = async (croppedBlob) => {
    // 1. יוצרים טופס וירטואלי
    const formData = new FormData();
    // 2. שמים בפנים את חתיכת התמונה שגזרנו
    formData.append('file', croppedBlob);

    // 3. שולחים את הטופס ל-API שלנו
    const result = await apiUpload('/api/ocrwin', formData);
    return result.text;
  };

  return {
    isProcessing,
    setIsProcessing,
    performGeminiOCR,
    performTesseractOCR,
    performOCRWin // ייצוא הפונקציה החדשה
  }
}