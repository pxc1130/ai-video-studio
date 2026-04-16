import type { Stage } from '../types';
import { Image as ImageIcon, Sun, Moon, Settings, ChevronLeft } from 'lucide-react';

// ============================================================
// Shared Components
// ============================================================
export function StepBar({ currentStep, onChangeStep, stages, theme, toggleTheme, onGoHome }: { currentStep: number; onChangeStep: (i: number) => void; stages: { key: Stage; label: string }[]; theme: 'light' | 'dark'; toggleTheme: () => void; onGoHome?: () => void }) {
  return (
    <div className="h-14 border-b border-runway-border bg-runway-page flex items-center px-6 justify-between shrink-0">
      <div className="flex items-center gap-3">
        {onGoHome && (
          <button
            onClick={onGoHome}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-runway-text-secondary hover:text-runway-text hover:bg-runway-surface transition-colors cursor-pointer"
            title="回到主页"
          >
            <ChevronLeft size={16} />
            <span className="text-xs hidden sm:inline">返回</span>
          </button>
        )}
        <div className="w-8 h-8 rounded-lg bg-framer-blue/10 flex items-center justify-center">
          <ImageIcon size={16} className="text-framer-blue" />
        </div>
        <span className="text-sm font-medium tracking-tight-runway text-runway-text">AI 视频工坊</span>
      </div>

      <div className="flex items-center gap-6">
        {stages.map((stage, idx) => {
          const active = idx === currentStep;
          return (
            <button
              key={stage.key}
              onClick={() => onChangeStep(idx)}
              className={`
                relative text-sm transition-all duration-200 cursor-pointer hover:-translate-y-px active:scale-[0.98]
                ${active ? 'text-runway-text font-medium' : 'text-runway-text-secondary hover:text-runway-text'}
              `}
            >
              {stage.label}
              {active && <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-framer-blue rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-runway-text-secondary">
        <span className="text-xs hidden sm:inline">demo-product-v1</span>
        <button onClick={toggleTheme} className="p-1.5 rounded-md hover:text-runway-text transition-colors cursor-pointer" title="切换主题">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="p-1.5 rounded-md hover:text-runway-text transition-colors cursor-pointer"><Settings size={16} /></button>
      </div>
    </div>
  );
}
