import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// ============================================================
// Stage 1: Upload
// ============================================================
// ============================================================
// Shared Dropdown Selector
// ============================================================
export function DropdownSelector({
  value,
  options,
  onChange,
  icon: Icon,
  widthClass = 'w-auto',
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);
  const selected = options.find(o => o.value === value);
  return (
    <div className={`relative ${widthClass}`} ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="h-8 w-full pl-2.5 pr-2 rounded-lg border border-runway-border bg-runway-page hover:border-runway-borderStrong hover:border-2 focus:border-framer-blue focus:border-2 transition-all flex items-center justify-between gap-1.5 text-xs text-runway-text cursor-pointer"
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          {Icon ? <Icon size={12} className="text-runway-text-secondary shrink-0" /> : null}
          <span className="truncate">{selected?.label || value}</span>
        </div>
        <ChevronDown size={12} className={`text-runway-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1.5 min-w-full rounded-xl border-2 border-runway-borderStrong bg-runway-page shadow-xl z-50 py-1 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-runway-elevated cursor-pointer flex items-center justify-between ${opt.value === value ? 'text-framer-blue font-medium' : 'text-runway-text'}`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
