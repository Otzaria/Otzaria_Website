'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'

export default function EditCategoriesDialog({ isOpen, onClose, existingCategories, onSave }) {
    const [categories, setCategories] = useState(existingCategories || []);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (existingCategories) {
            setCategories(JSON.parse(JSON.stringify(existingCategories)));
        }
    }, [existingCategories, isOpen]);

    const handleNameChange = (index, newName) => {
        const updated = [...categories];
        updated[index].name = newName;
        setCategories(updated);
    };

    const handleColorChange = (index, newColor) => {
        const updated = [...categories];
        updated[index].color = newColor;
        setCategories(updated);
    };

    const handleDelete = (index) => {
        const updated = categories.filter((_, i) => i !== index);
        setCategories(updated);
    };

    const handleAdd = () => {
        setCategories([...categories, { name: 'קטגוריה חדשה', color: '#3b82f6' }]);
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(categories);
        onClose();
        setIsSaving(false);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="ניהול קטגוריות וצבעים"
            size="md"
            buttons={[
                { label: isSaving ? 'שומר...' : 'שמור שינויים', onClick: handleSave, disabled: isSaving, variant: 'primary' },
                { label: 'ביטול', onClick: onClose, disabled: isSaving, variant: 'secondary' }
            ]}
        >
            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
                <div className="grid grid-cols-12 gap-2 text-sm font-bold text-gray-500 mb-2">
                    <div className="col-span-2">צבע</div>
                    <div className="col-span-8">שם הקטגוריה</div>
                    <div className="col-span-2"></div>
                </div>

                {categories.map((cat, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-2">
                            <input
                                type="color"
                                value={cat.color}
                                onChange={(e) => handleColorChange(index, e.target.value)}
                                className="w-full h-9 p-0 border-0 rounded cursor-pointer"
                            />
                        </div>
                        <div className="col-span-8">
                            <input
                                type="text"
                                value={cat.name}
                                onChange={(e) => handleNameChange(index, e.target.value)}
                                className="w-full px-3 py-1.5 border rounded focus:ring-2 focus:ring-primary outline-none"
                            />
                        </div>
                        <div className="col-span-2 text-left">
                            <button
                                onClick={() => handleDelete(index)}
                                className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
                            >
                                <span className="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={handleAdd}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary hover:text-primary hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-medium mt-4"
                >
                    <span className="material-symbols-outlined">add</span>
                    הוסף קטגוריה חדשה
                </button>
            </div>
        </Modal>
    );
}
