/* eslint-disable react/jsx-no-undef */
/* global Button, DialogProvider, DictaEditorCore, useRef, useState */
export default function OfflineEditorApp() {
  const [localContent, setLocalContent] = useState('');
  const [fileName, setFileName] = useState('קובץ_אופליין_חדש.txt');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setLocalContent(loadEvent.target.result);
      setHasUnsavedChanges(false);
    };
    reader.readAsText(file);
  };

  const handleSaveToLocalFile = (currentContent) => {
    const blob = new Blob([currentContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
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
        onClick={() => fileInputRef.current?.click()}
        label="פתח קובץ"
      />
      <Button
        icon="download"
        variant="primary"
        onClick={() => handleSaveToLocalFile(localContent)}
        label="שמור קובץ"
      />
      <div className="w-px h-8 bg-surface-variant mx-2"></div>
    </>
  );

  const headerEnd = <div className="text-sm text-gray-500 font-medium">מצב עבודה אופליין</div>;

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