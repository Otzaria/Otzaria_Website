export default function SettingsSidebar({
  show,
  onClose,
  userApiKey,
  setUserApiKey,
  selectedModel,
  setSelectedModel,
  customPrompt,
  setCustomPrompt,
  saveSettings,
  resetPrompt
}) {
  if (!show) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <span className="material-symbols-outlined">settings</span>
            הגדרות OCR
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-2">Gemini API Key</label>
            <input
              type="password"
              value={userApiKey}
              onChange={(e) => setUserApiKey(e.target.value)}
              placeholder="השאר ריק לברירת מחדל"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-900 mb-2">מודל</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="block text-sm font-bold text-neutral-900">פרומפט</label>
              <button onClick={resetPrompt} className="text-xs text-info-600 hover:underline">איפוס</button>
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono resize-none"
              dir="ltr"
            />
          </div>
        </div>

        <div className="p-4 border-t border-neutral-200">
          <button
            onClick={saveSettings}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-info-600 text-white rounded-lg hover:bg-info-700 font-bold"
          >
            <span className="material-symbols-outlined">save</span>
            שמור הגדרות
          </button>
        </div>
      </div>
    </>
  )
}