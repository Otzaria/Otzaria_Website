export default function EditorToolbar({
  pageNumber,
  totalPages,
  handleDownloadImage,
  imageZoom,
  setImageZoom,
  ocrMethod,
  setOcrMethod,
  toggleSelectionMode,
  isSelectionMode,
  isOcrProcessing,
  selectionRect,
  handleOCRSelection,
  handleGeminiFullPage,
  setSelectionRect,
  setIsSelectionMode,
  insertTag,
  setShowFindReplace,
  onOpenSpellcheck = () => {},
  selectedFont,
  setSelectedFont,
  twoColumns,
  toggleColumns,
  layoutOrientation,
  openShortcuts,
  setLayoutOrientation,
  swapPanels,
  togglePanelOrder,
  handleFinish,
  isPageAvailable,
  onClaim,
  setShowInfoDialog,
  setShowSettings,
  thumbnailUrl,
  isCollapsed,
  setIsCollapsed,
  isFullScreen,
  onToggleFullScreen,
  onOpenImageToText
  // הוסרו props של alignment ו-textZoom מכאן כי הם לא בשימוש בסרגל זה יותר
}) {
  const preventFocusLoss = (e) => {
    e.preventDefault();
  };

  const ImageTools = (
    <div className="flex items-center gap-1.5 justify-center">
      <button
        onClick={() => setShowSettings(prev => !prev)}
        className="p-1 h-7 w-7 rounded-md transition-colors flex items-center justify-center hover:bg-neutral-100 text-neutral-700"
        title="הגדרות OCR"
      >
        <span className="material-symbols-outlined text-sm">settings</span>
      </button>

      <div className="w-px h-5 bg-neutral-200"></div>
      <span className="text-[11px] text-neutral-500 font-medium whitespace-nowrap">עמוד {pageNumber} / {totalPages}</span>
      <div className="w-px h-5 bg-neutral-200"></div>

      <div className="flex items-center gap-0 bg-neutral-100 rounded-md p-0.5">
        <button onClick={() => setImageZoom(Math.max(25, imageZoom - 10))} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">zoom_out</span>
        </button>
        <span className="text-[10px] font-medium min-w-[2rem] text-center text-neutral-700">{imageZoom}%</span>
        <button onClick={() => setImageZoom(Math.min(300, imageZoom + 10))} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">zoom_in</span>
        </button>
        <button onClick={() => setImageZoom(100)} className="w-9 h-7 hover:bg-white rounded text-[10px] font-medium flex items-center justify-center">
          100%
        </button>
      </div>

      <button 
        onClick={handleDownloadImage}
        className="w-7 h-7 hover:bg-neutral-100 text-neutral-600 hover:text-info-600 rounded-md flex items-center justify-center transition-colors"
        title="הורד תמונה למחשב"
      >
        <span className="material-symbols-outlined text-sm">download</span>
      </button>

      <div className="w-px h-5 bg-neutral-200"></div>

      <div className="flex items-center gap-0 bg-neutral-100 rounded-md p-0.5">
        <button 
          onClick={() => setOcrMethod('ocrwin')} 
          className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 h-7 ${ocrMethod === 'ocrwin' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          title="כלי החיתוך של ווינדוס"
        >
          <span className="material-symbols-outlined text-sm">content_cut</span>
          <span className="hidden sm:inline">Win</span>
        </button>
        <button onClick={() => setOcrMethod('tesseract')} className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 h-7 ${ocrMethod === 'tesseract' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>
          <span className="material-symbols-outlined text-sm">text_fields</span>
          <span className="hidden sm:inline">OCR</span>
        </button>
        <button onClick={() => setOcrMethod('gemini')} className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 h-7 ${ocrMethod === 'gemini' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>
          <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" alt="Gemini" className="w-3 h-3" />
          <span className="hidden sm:inline">Gemini</span>
        </button>
      </div>

      <button
        onClick={ocrMethod === 'gemini' ? handleGeminiFullPage : toggleSelectionMode}
        disabled={isOcrProcessing || !thumbnailUrl}
        className={`w-7 h-7 rounded-md border flex items-center justify-center ${isSelectionMode && ocrMethod !== 'gemini' ? 'bg-info-50 text-info-700 border-info-200' : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-200'} disabled:opacity-40`}
        title={ocrMethod === 'gemini' ? "Gemini OCR לעמוד שלם" : "זיהוי טקסט מאזור נבחר"}
      >
        <span className={`material-symbols-outlined text-sm ${isOcrProcessing ? 'animate-spin' : ''}`}>
          {isOcrProcessing ? 'progress_activity' : (ocrMethod === 'gemini' ? 'auto_fix_high' : 'document_scanner')}
        </span>
      </button>

      {selectionRect && (
        <>
          <button onClick={handleOCRSelection} disabled={isOcrProcessing} className="flex items-center gap-1.5 px-2 py-1 h-7 bg-info-600 text-white rounded-md hover:bg-info-700 disabled:opacity-40">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span className="text-[10px] font-medium">זהה</span>
          </button>
          <button onClick={() => { setSelectionRect(null); setIsSelectionMode(false); }} className="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-md">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </>
      )}
    </div>
  );

  const TextTools = (
    <div className="flex items-center gap-1.5 flex-wrap justify-center">
      <div className="flex items-center gap-0 bg-neutral-100 rounded-md p-0.5">
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('b')} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center" title="מודגש">
          <span className="font-bold text-xs">B</span>
        </button>
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('i')} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center" title="נטוי">
          <span className="italic text-xs">I</span>
        </button>
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('u')} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center" title="קו תחתון">
          <span className="underline text-xs">U</span>
        </button>
      </div>

      <div className="w-px h-5 bg-neutral-200"></div>

      <div className="flex items-center gap-0 bg-neutral-100 rounded-md p-0.5">
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('big')} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center text-xs font-medium">A+</button>
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('small')} className="w-7 h-7 hover:bg-white rounded flex items-center justify-center text-[10px] font-medium">A-</button>
      </div>

      <div className="w-px h-5 bg-neutral-200"></div>

      <div className="flex items-center gap-0 bg-neutral-100 rounded-md p-0.5">
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('h1')} className="px-2 h-7 hover:bg-white rounded text-[10px] font-bold flex items-center justify-center">H1</button>
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('h2')} className="px-2 h-7 hover:bg-white rounded text-[10px] font-bold flex items-center justify-center">H2</button>
        <button onMouseDown={preventFocusLoss} onClick={() => insertTag('h3')} className="px-2 h-7 hover:bg-white rounded text-[10px] font-bold flex items-center justify-center">H3</button>
      </div>

      <div className="w-px h-5 bg-neutral-200"></div>

      {/* כפתורי היישור (Align) הוסרו מכאן */}

      <button onClick={() => setShowFindReplace(true)} className="flex items-center gap-1 px-2 py-1 h-7 bg-white hover:bg-neutral-50 rounded-md border border-neutral-200">
        <span className="material-symbols-outlined text-sm">find_replace</span>
        <span className="text-[10px] font-medium">חיפוש</span>
      </button>

      <button onClick={onOpenSpellcheck} className="flex items-center gap-1 px-2 py-1 h-7 bg-white hover:bg-neutral-50 rounded-md border border-neutral-200" title="בדיקת איות">
        <span className="material-symbols-outlined text-sm">spellcheck</span>
        <span className="text-[10px] font-medium">איות</span>
      </button>

      <button onClick={onOpenImageToText} className="flex items-center gap-1 px-2 py-1 h-7 bg-white hover:bg-neutral-50 rounded-md border border-neutral-200" title="המרת תמונה לטקסט">
        <span className="material-symbols-outlined text-sm">image_search</span>
        <span className="text-[10px] font-medium">תמונה</span>
      </button>

      <div className="w-px h-5 bg-neutral-200"></div>

      <div className="relative">
        <select value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)} className="appearance-none pl-2 pr-6 h-7 bg-white border border-neutral-200 rounded-md text-[10px] font-medium focus:outline-none hover:bg-neutral-50 cursor-pointer w-24">
          <option value="'Times New Roman'">Times New Roman</option>
          <option value="monospace">Monospace</option>
          <option value="Arial">Arial</option>
          <option value="'Courier New'">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
        </select>
        <span className="material-symbols-outlined text-sm absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">expand_more</span>
      </div>

      <div className="w-px h-5 bg-neutral-200"></div>

      {isPageAvailable ? (
        <button onClick={onClaim} className="flex items-center gap-1.5 px-3 py-1 h-7 bg-info-600 hover:bg-info-700 text-white rounded-md shadow-sm transition-colors ml-2" title="תפוס עמוד לעריכה">
          <span className="material-symbols-outlined text-sm">lock</span>
          <span className="text-[11px] font-bold">תפוס</span>
        </button>
      ) : (
        <button onClick={handleFinish} className="flex items-center gap-1.5 px-3 py-1 h-7 bg-success-600 hover:bg-success-700 text-white rounded-md shadow-sm transition-colors ml-2" title="סיים הקלדת קובץ וסמן כהושלם">
          <span className="material-symbols-outlined text-sm">upload_file</span>
          <span className="text-[11px] font-bold">סיים</span>
        </button>
      )}

      <div className="w-px h-5 bg-neutral-200"></div>

      <button onClick={toggleColumns} className="w-7 h-7 hover:bg-neutral-100 rounded-md flex items-center justify-center" title={twoColumns ? 'איחוד לטור אחד' : 'פיצול לשני טורים'}>
        <span className="material-symbols-outlined text-sm" style={{ transform: 'rotate(90deg)' }}>{twoColumns ? 'unfold_less' : 'unfold_more'}</span>
      </button>

      <button onClick={() => {
        const newOrientation = layoutOrientation === 'vertical' ? 'horizontal' : 'vertical'
        setLayoutOrientation(newOrientation)
        localStorage.setItem('layoutOrientation', newOrientation)
      }} className="w-7 h-7 hover:bg-neutral-100 rounded-md flex items-center justify-center" title={layoutOrientation === 'vertical' ? 'פריסה אנכית' : 'פריסה אופקית'}>
        <span className="material-symbols-outlined text-sm" style={{ transform: layoutOrientation === 'horizontal' ? 'rotate(90deg)' : 'none' }}>splitscreen</span>
      </button>

      <div className="w-px h-5 bg-neutral-200"></div>

      <button onClick={() => setShowInfoDialog(true)} className="w-7 h-7 hover:bg-info-50 text-info-600 rounded-md flex items-center justify-center">
        <span className="material-symbols-outlined text-sm">info</span>
      </button>

      <div className="w-px h-5 bg-neutral-200"></div>

      <button onClick={onToggleFullScreen} className="w-7 h-7 hover:bg-neutral-100 text-neutral-600 rounded-md flex items-center justify-center" title={isFullScreen ? "צא ממסך מלא" : "מסך מלא"}>
        <span className="material-symbols-outlined text-sm">{isFullScreen ? 'close_fullscreen' : 'fullscreen'}</span>
      </button>

      <button onClick={() => setIsCollapsed(true)} className="w-7 h-7 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 rounded-md flex items-center justify-center mr-1" title="קפל סרגל כלים">
        <span className="material-symbols-outlined text-sm">expand_less</span>
      </button>
    </div>
  );

  if (isCollapsed) {
    return (
      <div 
        className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-sm h-3 hover:h-6 transition-all duration-200 flex justify-center items-start cursor-pointer group"
        onClick={() => setIsCollapsed(false)}
        title="הצג סרגל כלים"
      >
        <div className="bg-white/90 border-b border-x border-neutral-200 rounded-b-md px-8 py-1 flex items-center justify-center shadow-sm">
           <span className="material-symbols-outlined text-sm text-neutral-500">expand_more</span>
        </div>
      </div>
    );
  }

  return (
  <div className={`bg-white border-b border-neutral-200 z-30 shadow-sm transition-all sticky ${isFullScreen ? 'top-0' : 'top-[65px]'}`}>
    <div className="w-full px-4 py-1.5">
      <div className="flex items-center w-full">
        
        <div className="flex-1 flex items-center justify-center min-w-0 overflow-x-auto no-scrollbar px-2">
          {swapPanels ? TextTools : ImageTools}
        </div>

        <div className="flex-none z-10 flex items-center justify-center gap-2">

          <button
            onClick={togglePanelOrder}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all border shadow-sm ${
              swapPanels
                ? 'bg-info-50 text-info-600 border-info-200'
                : 'bg-white text-neutral-500 hover:bg-neutral-50 border-neutral-200'
            }`}
            title="החלף צדדים"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 17h-5" />
              <path d="M4 17h5" />
              <path d="m16 13 4 4-4 4" />
              <path d="m8 21-4-4 4-4" />
              <rect x="4" y="3" width="8" height="8" rx="2" />
              <rect x="12" y="3" width="8" height="8" rx="2" />
            </svg>
          </button>

          <button 
            onClick={openShortcuts} 
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-neutral-500 hover:bg-neutral-50 border border-neutral-200 shadow-sm transition-all" 
            title="קיצורי מקלדת"
          >
            <span className="material-symbols-outlined !text-[25px]">keyboard</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center min-w-0 overflow-x-auto no-scrollbar px-2">
          {swapPanels ? ImageTools : TextTools}
        </div>

      </div>
    </div>
  </div>
)
}

