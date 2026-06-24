'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'

export default function EditGlobalInstructionsDialog({ isOpen, onClose, initialData, onSave, isSaving }) {
    const [instructions, setInstructions] = useState({ sections: [] })

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // סנכרון עותק מקומי לעריכה מה-prop בעת פתיחת הדיאלוג
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setInstructions(JSON.parse(JSON.stringify(initialData)))
            } else {
                setInstructions({ sections: [] })
            }
        }
    }, [isOpen, initialData])

    const updateSectionTitle = (index, newTitle) => {
        const newSections = [...instructions.sections];
        newSections[index].title = newTitle;
        setInstructions({ ...instructions, sections: newSections });
    };

    const updateSectionItems = (index, textBlock) => {
        const items = textBlock.split('\n').filter(line => line.trim() !== '');
        const newSections = [...instructions.sections];
        newSections[index].items = items;
        setInstructions({ ...instructions, sections: newSections });
    };

    const addSection = () => {
        setInstructions({
            ...instructions,
            sections: [...instructions.sections, { title: '', items: [] }]
        });
    };

    const removeSection = (index) => {
        const newSections = instructions.sections.filter((_, i) => i !== index);
        setInstructions({ ...instructions, sections: newSections });
    };

    const handleSubmit = () => {
        const cleanedData = {
            ...instructions,
            sections: instructions.sections.filter(s => s.title.trim() !== '')
        };
        onSave(cleanedData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="עריכת הנחיות גלובליות"
            size="xl"
            closeable={!isSaving}
            buttons={[
                {
                    label: isSaving ? 'שומר שינויים...' : 'שמור שינויים',
                    onClick: handleSubmit,
                    disabled: isSaving,
                    variant: 'primary'
                },
                {
                    label: 'ביטול',
                    onClick: onClose,
                    disabled: isSaving,
                    variant: 'secondary'
                }
            ]}
        >
            <div className="space-y-4">
                <div className="bg-info-50 text-info-800 p-3 rounded-lg text-sm flex items-start gap-2 border border-info-100">
                    <span className="material-symbols-outlined text-lg mt-0.5">info</span>
                    <p>
                        הנחיות אלו יופיעו בכל דפי העריכה באתר, מתחת להנחיות הספציפיות של כל ספר.
                    </p>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                    {instructions.sections.map((section, index) => (
                        <div key={index} className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 relative group transition-all hover:shadow-sm">
                            <button 
                                onClick={() => removeSection(index)}
                                className="absolute top-3 left-3 text-neutral-400 hover:text-danger-500 hover:bg-danger-50 p-1.5 rounded-full transition-colors"
                                title="מחק קבוצת הנחיות זו"
                            >
                                <span className="material-symbols-outlined text-lg block">delete</span>
                            </button>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 mb-1">כותרת הקבוצה</label>
                                    <input 
                                        type="text" 
                                        value={section.title}
                                        onChange={(e) => updateSectionTitle(index, e.target.value)}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-info-500 outline-none bg-white font-bold text-neutral-800"
                                        placeholder="לדוגמה: כללי, עיצוב, פיסוק..."
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 mb-1">
                                        רשימת ההנחיות (כל שורה חדשה = סעיף נפרד)
                                    </label>
                                    <textarea 
                                        value={section.items ? section.items.join('\n') : ''}
                                        onChange={(e) => updateSectionItems(index, e.target.value)}
                                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm min-h-[120px] focus:ring-2 focus:ring-info-500 outline-none bg-white leading-relaxed"
                                        placeholder="הכנס כאן את ההנחיות..."
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    <button 
                        onClick={addSection}
                        className="w-full py-4 border-2 border-dashed border-neutral-300 rounded-xl text-neutral-500 hover:border-info-400 hover:text-info-600 hover:bg-info-50 transition-all flex items-center justify-center gap-2 font-bold"
                    >
                        <span className="material-symbols-outlined">add_circle</span>
                        הוסף קבוצת הנחיות חדשה
                    </button>
                </div>
            </div>
        </Modal>
    )
}
