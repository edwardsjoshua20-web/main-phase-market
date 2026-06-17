import React, { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { ChevronDown } from 'lucide-react';

export default function LocationInput({ value, onChange, existingLocations = [] }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  const filtered = existingLocations.filter(
    (loc) => loc && loc.toLowerCase().includes((value || '').toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="e.g., Shelf A3, Box 12, Binder 5"
          className="bg-white border-gray-300 pr-8"
        />
        {existingLocations.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDropdown((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((loc, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { onChange(loc); setShowDropdown(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}