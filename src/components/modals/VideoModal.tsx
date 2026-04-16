import type { Shot, Status } from '../../types';
import { useState, useEffect } from 'react';
import { X, Play, RefreshCw, Sparkles, Check, AlertCircle, Clock, CornerDownLeft } from 'lucide-react';
import { DropdownSelector } from '../DropdownSelector';

// ============================================================
// Video Modal (Large)
// ============================================================
export function VideoModal({
  shot,
  onClose,
  setShots,
}: {
  shot: Shot;
  onClose: () => void;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
}) {
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState(shot.currentPrompt);
  const [showCover, setShowCover] = useState(true);
  const [model, setModel] = useState(shot.model || 'Wan 2.6');
  const [duration, setDuration] = useState(String(shot.duration));

  useEffect(() => {
    setPrompt(shot.currentPrompt);
    setModel(shot.model || 'Wan 2.6');
    setDuration(String(shot.duration));
  }, [shot.id, shot.currentPrompt, shot.model, shot.duration]);

  const approve = () => {
    setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'approved' as Status } : s));
    onClose();
  };

  const handleGenerate = () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setTimeout(() => {
      const dur = parseFloat(duration) || shot.duration;
      setShots(prev => prev.map(s => s.id === shot.id ? {
        ...s,
        currentPrompt: prompt,
        model,
        duration: dur,
        status: 'review' as Status,
        history: [...s.history, { id: Math.random().toString(36).slice(2), prompt, timestamp: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), status: 'review' }]
      } : s));
      setGenerating(false);
    }, 1500);
  };

  const replaceCover = () => {
    const randomId = Math.floor(Math.random() * 1000);
    setShots(prev => prev.map(s => s.id === shot.id ? { ...s, coverUrl: `https://picsum.photos/seed/${randomId}/400/225` } : s));
  };

  const modelOptions = [
    { value: 'Wan 2.6', label: 'Wan 2.6' },
    { value: 'Wan 2.7', label: 'Wan 2.7' },
    { value: 'Seedance 2.0 Pro', label: 'Seedance 2.0 Pro' },
    { value: 'Keling', label: 'Keling' },
  ];

  const durationOptions = ['3','5','8','10','15'].map(v => ({ value: v, label: `${v} 秒` }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay)] cursor-pointer" onClick={onClose} />
      <div className="relative w-[92vw] h-[92vh] bg-runway-page border border-runway-border rounded-2xl overflow-hidden flex shadow-2xl">
        {/* Overall header with close */}
        <div className="absolute top-0 left-0 right-0 h-14 border-b border-runway-border flex items-center justify-between px-5 z-10 bg-runway-page/95 backdrop-blur-sm">
          <div className="text-sm font-medium flex items-center gap-2 text-runway-text">
            <span className="px-2 py-0.5 rounded bg-runway-elevated text-xs text-runway-text-secondary border border-runway-border">第 {shot.index} 镜</span>
            <span className="text-runway-text-secondary text-xs">{model} · {duration}s</span>
          </div>
          <button onClick={onClose} className="text-runway-text-secondary hover:text-runway-text transition-colors cursor-pointer p-1 rounded-md hover:bg-runway-hover"><X size={20} /></button>
        </div>

        {/* Left: Preview */}
        <div className="flex-1 flex flex-col min-w-0 pt-14">
          <div className="flex-1 bg-runway-deep p-6 flex items-center justify-center min-h-0">
            <div className="relative w-full h-full max-w-5xl bg-runway-surface rounded-2xl border-2 border-runway-border overflow-hidden flex items-center justify-center">
              {showCover && shot.coverUrl ? (
                <img src={shot.coverUrl} alt="参考图" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-runway-surface via-runway-deep to-runway-page" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="w-20 h-20 rounded-full bg-white/90 hover:bg-white flex items-center justify-center border-2 border-white/30 transition-all backdrop-blur shadow-2xl cursor-pointer">
                  <Play size={32} className="text-black ml-1" />
                </button>
              </div>
              <div className="absolute bottom-4 left-4 flex gap-2">
                {showCover && shot.coverUrl ? (
                  <>
                    <button onClick={replaceCover} className="px-3 h-8 rounded-lg bg-black/70 border border-white/20 text-xs text-white hover:bg-black/90 backdrop-blur flex items-center gap-1.5 cursor-pointer">
                      <RefreshCw size={12} /> 替换参考图
                    </button>
                    <button onClick={() => setShowCover(false)} className="px-3 h-8 rounded-lg bg-black/70 border border-white/20 text-xs text-white hover:bg-black/90 backdrop-blur cursor-pointer">
                      隐藏参考图
                    </button>
                  </>
                ) : (
                  <button onClick={() => setShowCover(true)} className="px-3 h-8 rounded-lg bg-black/70 border border-white/20 text-xs text-white hover:bg-black/90 backdrop-blur cursor-pointer">
                    显示参考图
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chat */}
        <div className="w-[420px] border-l border-runway-border flex flex-col bg-runway-page pt-14">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-framer-blue/10 border border-framer-blue/20 flex items-center justify-center shrink-0">
                <Sparkles size={12} className="text-framer-blue" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="text-xs text-runway-text-secondary mb-1">AI 画面描述</div>
                <div className="p-4 rounded-xl bg-runway-surface border border-runway-border text-sm text-runway-text/90 leading-relaxed">
                  {shot.currentPrompt || <span className="italic text-runway-text-muted">暂无描述</span>}
                </div>
                <div className="flex items-center gap-3">
                  {shot.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-success px-2 py-1 rounded-full bg-success-subtle border border-success/20">
                      <Check size={12} /> 已通过
                    </span>
                  ) : (
                    <>
                      <button onClick={approve} className="h-8 px-3 rounded-lg bg-success-subtle border border-success/20 text-success text-xs font-medium hover:bg-success/20 transition-colors flex items-center gap-1.5 cursor-pointer">
                        <Check size={12} /> 采纳
                      </button>
                      <span className="text-xs text-warning px-2 py-1 rounded-full bg-warning-subtle border border-warning/20 flex items-center gap-1">
                        <AlertCircle size={12} /> 待确认
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom chat input */}
          <div className="p-5 border-t border-runway-border bg-runway-page">
            <div className="rounded-2xl border-2 border-runway-border bg-runway-surface p-3 focus-within:border-framer-blue focus-within:ring-2 focus-within:ring-framer-blue/20 transition-all">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                placeholder="修改画面描述，按 Enter 发送重新生成..."
                className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm text-runway-text placeholder:text-runway-text-muted"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <DropdownSelector
                    value={model}
                    options={modelOptions}
                    onChange={setModel}
                    widthClass="w-36"
                  />
                  <DropdownSelector
                    value={duration}
                    options={durationOptions}
                    onChange={setDuration}
                    icon={Clock}
                    widthClass="w-20"
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || generating}
                  className="w-9 h-9 rounded-xl bg-framer-blue text-runway-text flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  {generating ? <RefreshCw size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
