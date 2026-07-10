import React, { useEffect, useState, useRef } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export const CustomSelect = ({ value, onChange, options, disabled, placeholder = "Select...", showSearch = false, direction = "down" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={`relative w-full ${isOpen ? 'z-[9999]' : 'z-10'}`} ref={dropdownRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-gray-950 border border-dashed border-gray-700 rounded-lg px-2.5 py-2.5 text-white text-xs flex items-center justify-between transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-cyan-500/50'}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {selectedOption ? (
                        <>
                            {selectedOption.icon && <span>{selectedOption.icon}</span>}
                            <span className="truncate">{selectedOption.label}</span>
                        </>
                    ) : (
                        <span className="text-gray-500 truncate">{placeholder}</span>
                    )}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0 ${isOpen && direction === 'down' ? 'rotate-180' : ''} ${isOpen && direction === 'up' ? 'rotate-0' : ''} ${!isOpen && direction === 'up' ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className={`absolute z-[9999] w-full bg-gray-950 border border-dashed border-gray-600 rounded-lg shadow-2xl overflow-hidden animate-in fade-in duration-200 ${direction === 'up' ? 'bottom-full mb-1 slide-in-from-bottom-2' : 'top-full mt-1 slide-in-from-top-2'}`}>
                    {showSearch && (
                        <div className="p-2 border-b border-dashed border-gray-700/50 bg-gray-900/80 flex items-center gap-2">
                            <Search className="w-3.5 h-3.5 text-gray-500" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent border-none text-xs text-white placeholder-gray-500 focus:outline-none w-full"
                            />
                        </div>
                    )}
                    <div className="max-h-48 overflow-y-auto custom-scrollbar z-[9999]">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                No results found
                            </div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                                        value === opt.value ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-300 hover:bg-gray-800'
                                    }`}
                                >
                                    {opt.icon && <span>{opt.icon}</span>}
                                    <span className="truncate">{opt.label}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
