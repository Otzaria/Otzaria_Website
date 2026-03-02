import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// פונקציה להורדת פונט והמרה ל-base64
async function fetchFontAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    console.log(`Font downloaded successfully, size: ${base64.length} chars`);
    return base64;
  } catch (error) {
    console.error('Failed to fetch font:', error);
    return '';
  }
}

export async function GET() {
  const rootDir = process.cwd();

  // רשימת כל הקבצים הנדרשים כפי שהופיעו בדרישה המקורית
  const componentPaths = [
    'src/lib/avatar-colors.js',
    'src/components/DialogContext.jsx',
    'src/components/Modal.jsx',
    'src/components/FormInput.jsx',
    'src/components/Button.jsx',
    'src/components/dicta-tools/CreateHeadersModal.jsx',
    'src/components/dicta-tools/SingleLetterHeadersModal.jsx',
    'src/components/dicta-tools/ChangeHeadingModal.jsx',
    'src/components/dicta-tools/PunctuateModal.jsx',
    'src/components/dicta-tools/PageBHeaderModal.jsx',
    'src/components/dicta-tools/ReplacePageBModal.jsx',
    'src/components/dicta-tools/HeaderErrorCheckerModal.jsx',
    'src/components/dicta-tools/TextCleanerModal.jsx',
    'src/components/dicta-tools/AddPageNumberModal.jsx',
    'src/components/dicta-tools/EmbedImageModal.jsx',
    'src/components/editor/modals/ShortcutsDialog.jsx',
    'src/components/editor/modals/FindReplaceDialog.jsx',
    'src/components/editor/DictaEditorCore.jsx'
  ];

  try {
    // הורדת פונט Material Symbols - נסה מספר URLs
    const materialIconsUrls = [
      // URL עדכני יותר
      'https://fonts.gstatic.com/s/materialsymbolsoutlined/v180/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOej.woff2',
      // Fallback URL
      'https://fonts.gstatic.com/s/materialsymbolsoutlined/v169/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOej.woff2'
    ];
    
    let materialIconsBase64 = '';
    for (const url of materialIconsUrls) {
      materialIconsBase64 = await fetchFontAsBase64(url);
      if (materialIconsBase64) {
        console.log('Material Icons font embedded successfully');
        break;
      }
    }
    
    // אם ההורדה נכשלה, השתמש ב-CDN
    const useCDN = !materialIconsBase64;
    if (useCDN) {
      console.log('Using CDN fallback for Material Icons');
    }

    let bundledComponents = '';
    
    for (const filePath of componentPaths) {
      const fullPath = path.join(rootDir, filePath);
      
      if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // ניקוי מתקדם:
        const cleanedContent = content
          .replace(/'use client'/g, '')
          // 1. הסרת ייבואים (כולל כאלו שמתפרסים על מספר שורות)
          .replace(/import[\s\S]*?from\s+['"].*?['"];?/g, '')
          // 2. טיפול ב-export default function
          .replace(/export default function\s+/g, 'function ')
          // 3. טיפול ב-export default Name (בסוף קובץ)
          .replace(/export default\s+([a-zA-Z0-9_$]+);?/g, '')
          // 4. טיפול ב-export const / function
          .replace(/export\s+(const|function|class|let|var)\s+/g, '$1 ');

        bundledComponents += `\n/* --- Source: ${filePath} --- */\n${cleanedContent}\n`;
      }
    }

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>עורך אופליין - אוצריא</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📚%3C/text%3E%3C/svg%3E" />
    
    <!-- React & Babel -->
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    
    ${useCDN ? `
    <!-- Material Symbols Icons - CDN Fallback -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
    ` : ''}
    
    <!-- Hebrew Font -->
    <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
    
    <style>
      ${!useCDN ? `
      /* Material Symbols Icons - Embedded for offline use */
      @font-face {
        font-family: 'Material Symbols Outlined';
        font-style: normal;
        font-weight: 100 700;
        src: url(data:font/woff2;base64,${materialIconsBase64}) format('woff2');
        font-display: block;
      }
      ` : ''}
      @font-face {
        font-family: 'FrankRuehl';
        src: url('https://fonts.cdnfonts.com/css/frank-ruhl-libre') format('woff2');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      
      :root {
        --color-background: #fefbf6;
        --color-surface: #f8f4ef;
        --color-surface-variant: #e7e0d8;
        --color-primary: #6b5d4f;
        --color-primary-container: #f4ede3;
        --color-secondary: #8b7355;
        --color-secondary-container: #f5ead8;
        --color-accent: #9c7c4f;
        --color-on-background: #1c1b1a;
        --color-on-surface: #1c1b1a;
        --color-on-primary: #ffffff;
      }
      
      html {
        direction: rtl;
        background-color: var(--color-background);
      }
      
      body { 
        background-color: transparent;
        color: var(--color-on-background);
        margin: 0;
        padding: 0;
        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
        min-height: 100vh;
        position: relative;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      .font-frank {
        font-family: 'FrankRuehl', serif;
      }
      
      .glass {
        background-color: color-mix(in srgb, var(--color-background) 60%, transparent);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid color-mix(in srgb, var(--color-surface-variant) 50%, transparent);
      }
      
      .glass-strong { 
        background-color: color-mix(in srgb, var(--color-background) 95%, transparent);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--color-surface-variant);
      }
      
      .material-symbols-outlined {
        font-family: 'Material Symbols Outlined';
        font-weight: normal;
        font-style: normal;
        font-size: 24px;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        display: inline-block;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        -webkit-font-smoothing: antialiased;
        -webkit-font-feature-settings: 'liga';
      }
      
      /* Scrollbar styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      
      ::-webkit-scrollbar-track {
        background: var(--color-surface);
      }
      
      ::-webkit-scrollbar-thumb {
        background: var(--color-surface-variant);
        border-radius: 4px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: var(--color-primary);
      }
      
      /* Animations */
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-20px); }
      }

      @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 20px rgba(107, 93, 79, 0.3); }
        50% { box-shadow: 0 0 40px rgba(107, 93, 79, 0.6); }
      }

      @keyframes shimmer {
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
      }

      .animate-float { animation: float 6s ease-in-out infinite; }
      .animate-pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
      .animate-shake { animation: shake 0.5s ease-in-out; }
      
      .hover-lift {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .hover-lift:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
      }
    </style>
    <script>
      tailwind.config = {
        theme: { 
          extend: { 
            colors: { 
              background: '#fefbf6',
              surface: '#f8f4ef',
              'surface-variant': '#e7e0d8',
              primary: '#6b5d4f',
              'primary-container': '#f4ede3',
              secondary: '#8b7355',
              'secondary-container': '#f5ead8',
              accent: '#9c7c4f',
              'on-background': '#1c1b1a',
              'on-surface': '#1c1b1a',
              'on-primary': '#ffffff'
            },
            fontFamily: {
              'frank': ['FrankRuehl', 'serif'],
              'sans': ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
              'hebrew': ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif']
            }
          } 
        }
      }
    </script>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect, useMemo, useRef, useContext, createContext, useCallback, forwardRef, useTransition } = React;
        const { createPortal } = ReactDOM;

        ${bundledComponents}

        function App() {
          const [localContent, setLocalContent] = useState('');
          const [fileName, setFileName] = useState('קובץ_אופליין_חדש.txt');
          const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
          const fileInputRef = useRef(null);

          // פתיחת קובץ מקומי
          const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            setFileName(file.name);
            const reader = new FileReader();
            reader.onload = (e) => {
              setLocalContent(e.target.result);
              setHasUnsavedChanges(false);
            };
            reader.readAsText(file);
          };

          // שמירה מקומית על ידי הורדה
          const handleSaveToLocalFile = (currentContent) => {
            const blob = new Blob([currentContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setLocalContent(currentContent);
            setHasUnsavedChanges(false);
          };

          const headerStart = (
            <>
              <input 
                type="file" 
                accept=".txt,.html" 
                style={{ display: 'none' }} 
                ref={fileInputRef}
                onChange={handleFileUpload} 
              />
              <Button 
                icon="folder_open" 
                variant="ghost" 
                onClick={() => fileInputRef.current.click()} 
                label="פתח קובץ מקומי" 
              />
              <div className="w-px h-8 bg-surface-variant mx-2"></div>
            </>
          );

          const headerEnd = (
            <div className="text-sm text-gray-500 font-medium">
              מצב עבודה אופליין
            </div>
          );

          return (
            <DialogProvider>
              <DictaEditorCore 
                initialContent={localContent}
                title={fileName}
                canEdit={true}
                isCompleted={false}
                onSave={handleSaveToLocalFile}
                hasUnsavedChangesOuter={hasUnsavedChanges}
                setHasUnsavedChanges={setHasUnsavedChanges}
                headerStartElement={headerStart}
                headerEndElement={headerEnd}
                singleLineHeader={true}
              />
            </DialogProvider>
          );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;

    return new NextResponse(htmlTemplate, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename=dicta-editor-offline.html',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate offline editor' }, { status: 500 });
  }
}