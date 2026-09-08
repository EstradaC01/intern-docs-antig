'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { EXPORT_COLUMNS } from '@lib/export/columns';
import { Button } from './ui/button';

interface ColumnPickerProps {
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
}

export function ColumnPicker({ selectedKeys, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const toggleKey = (key: string) => {
    if (selectedKeys.includes(key)) {
      onChange(selectedKeys.filter((k) => k !== key));
    } else {
      onChange([...selectedKeys, key]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="border-border-default text-text-primary hover:bg-surface-hover font-semibold gap-1.5"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        Columns ({selectedKeys.length})
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border-default bg-surface-bg shadow-lg p-3 space-y-1.5 max-h-80 overflow-y-auto"
        >
          {EXPORT_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 text-xs text-text-primary cursor-pointer hover:bg-surface-hover rounded-lg px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={selectedKeys.includes(col.key)}
                onChange={() => toggleKey(col.key)}
                className="rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
