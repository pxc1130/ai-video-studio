import type { CopyAsset, VoiceAsset, Status } from '../../types';
import { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Sparkles, Check, AlertCircle, FileText, Mic, Play, Lock, RefreshCw, CornerDownLeft, Clock } from 'lucide-react';
import { formatTime } from '../../utils/helpers';
import { DropdownSelector } from '../DropdownSelector';

// ============================================================
// Copy/Voice Modal
// ============================================================
export function CopyVoiceModal({
  copyAsset,
  voiceAsset,
  onClose,
  setCopyAsset,
  setVoiceAsset,
}: {
  copyAsset: CopyAsset;
  voiceAsset: VoiceAsset;
  onClose: () => void;
  setCopyAsset: React.Dispatch<React.SetStateAction<CopyAsset>>;
  setVoiceAsset: React.Dispatch<React.SetStateAction<VoiceAsset>>;
}) {
  const [activeTab, setActiveTab] = useState<'copy' | 'voice'>('copy');
  const [generating, setGenerating] = useState(false);

  // Copy input state
  const [copyInput, setCopyInput] = useState(copyAsset.generationPrompt);
  const [copyEditMode, setCopyEditMode] = useState<'rules' | 'text'>('rules');

  // Voice input state
  const [selectedVoice, setSelectedVoice] = useState(voiceAsset.voiceName);
  const [targetDuration, setTargetDuration] = useState(String(voiceAsset.duration));

  useEffect(() => {
    setCopyInput(copyAsset.generationPrompt);
    setSelectedVoice(voiceAsset.voiceName);
    setTargetDuration(String(voiceAsset.duration));
  }, [copyAsset.generationPrompt, voiceAsset.voiceName, voiceAsset.duration]);

  useEffect(() => {
    if (copyEditMode === 'text') {
      setCopyInput(copyAsset.finalText);
    } else {
      setCopyInput(copyAsset.generationPrompt);
    }
  }, [copyEditMode, copyAsset.finalText, copyAsset.generationPrompt]);

  const approveCopy = () => {
    setCopyAsset(prev => ({ ...prev, status: 'approved' as Status }));
    setActiveTab('voice');
  };

  const approveVoice = () => {
    setVoiceAsset(prev => ({ ...prev, status: 'approved' as Status }));
    onClose();
  };

  const handleSendCopy = () => {
    if (!copyInput.trim() || generating) return;
    setGenerating(true);
    setTimeout(() => {
      const newText = copyEditMode === 'rules'
        ? (copyInput.includes('陪伴')
            ? '这款产品在清晨的第一缕阳光中醒来，为你带来一整天的活力。无论是忙碌的工作日，还是悠闲的周末，它都是你最贴心的陪伴。'
            : '每一口都是醇厚的咖啡香，0糖0脂让你喝得毫无负担。这是属于年轻人的第一杯好咖啡。')
        : copyInput;
      setCopyAsset(prev => ({
        ...prev,
        generationPrompt: copyEditMode === 'rules' ? copyInput : prev.generationPrompt,
        finalText: newText,
        status: 'review' as Status,
        history: [...prev.history, { id: Math.random().toString(36).slice(2), prompt: copyInput, timestamp: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), status: 'review' }]
      }));
      setGenerating(false);
    }, 1200);
  };

  const handleSendVoice = () => {
    if (generating) return;
    setGenerating(true);
    setTimeout(() => {
      const dur = parseFloat(targetDuration) || voiceAsset.duration;
      setVoiceAsset(prev => ({ ...prev, voiceName: selectedVoice, duration: dur, status: 'review' as Status }));
      setGenerating(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--overlay)] cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-[85vh] bg-runway-page border border-runway-border rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-14 border-b border-runway-border flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('copy')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${activeTab === 'copy' ? 'text-runway-text font-medium bg-runway-elevated' : 'text-runway-text-secondary hover:text-runway-text'}`}
            >
              文案
            </button>
            <button
              onClick={() => copyAsset.status === 'approved' && setActiveTab('voice')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'voice' ? 'text-runway-text font-medium bg-runway-elevated' : 'text-runway-text-secondary hover:text-runway-text'} ${copyAsset.status !== 'approved' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              title={copyAsset.status !== 'approved' ? '请先采纳文案' : ''}
            >
              配音
            </button>
          </div>
          <button onClick={onClose} className="text-runway-text-secondary hover:text-runway-text transition-colors cursor-pointer p-1 rounded-md hover:bg-runway-hover"><X size={20} /></button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'copy' && (
            <>
              {/* Context bubble */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-runway-elevated border border-runway-border flex items-center justify-center shrink-0">
                  <ImageIcon size={12} className="text-runway-text-secondary" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-runway-text-secondary mb-1">商品上下文</div>
                  <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border text-sm text-runway-text/90 leading-relaxed">
                    {copyAsset.baseContext}
                  </div>
                </div>
              </div>

              {/* AI response bubble */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-framer-blue/10 border border-framer-blue/20 flex items-center justify-center shrink-0">
                  <Sparkles size={12} className="text-framer-blue" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="text-xs text-runway-text-secondary mb-1">AI 生成的文案</div>
                  <div className="p-4 rounded-xl bg-runway-surface border border-runway-border text-base text-runway-text/90 leading-relaxed whitespace-pre-line">
                    {copyAsset.finalText}
                  </div>

                  {/* Status & actions */}
                  <div className="flex items-center gap-3">
                    {copyAsset.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success px-2 py-1 rounded-full bg-success-subtle border border-success/20">
                        <Check size={12} /> 已通过
                      </span>
                    ) : (
                      <>
                        <button onClick={approveCopy} className="h-8 px-3 rounded-lg bg-success-subtle border border-success/20 text-success text-xs font-medium hover:bg-success/20 transition-colors flex items-center gap-1.5 cursor-pointer">
                          <Check size={12} /> 采纳文案
                        </button>
                        <span className="text-xs text-warning px-2 py-1 rounded-full bg-warning-subtle border border-warning/20 flex items-center gap-1">
                          <AlertCircle size={12} /> 待确认
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'voice' && copyAsset.status === 'approved' && (
            <>
              {/* Context bubble */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-runway-elevated border border-runway-border flex items-center justify-center shrink-0">
                  <FileText size={12} className="text-runway-text-secondary" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-runway-text-secondary mb-1">基于文案</div>
                  <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border text-sm text-runway-text/90 leading-relaxed line-clamp-3">
                    {copyAsset.finalText}
                  </div>
                </div>
              </div>

              {/* AI response bubble */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-framer-blue/10 border border-framer-blue/20 flex items-center justify-center shrink-0">
                  <Mic size={12} className="text-framer-blue" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="text-xs text-runway-text-secondary mb-1">AI 配音</div>
                  <div className="p-4 rounded-xl bg-runway-surface border border-runway-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-base text-runway-text/90">{voiceAsset.voiceName}</div>
                      <div className="text-xs text-runway-text-muted font-mono">{formatTime(voiceAsset.duration)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="w-10 h-10 rounded-full bg-framer-blue text-runway-text flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer">
                        <Play size={14} fill="currentColor" className="ml-0.5" />
                      </button>
                      <div className="flex-1 h-2 bg-runway-border rounded-full overflow-hidden">
                        <div className="h-full w-0 bg-framer-blue" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {voiceAsset.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success px-2 py-1 rounded-full bg-success-subtle border border-success/20">
                        <Check size={12} /> 已通过
                      </span>
                    ) : (
                      <>
                        <button onClick={approveVoice} className="h-8 px-3 rounded-lg bg-success-subtle border border-success/20 text-success text-xs font-medium hover:bg-success/20 transition-colors flex items-center gap-1.5 cursor-pointer">
                          <Check size={12} /> 采纳配音
                        </button>
                        <span className="text-xs text-warning px-2 py-1 rounded-full bg-warning-subtle border border-warning/20 flex items-center gap-1">
                          <AlertCircle size={12} /> 待确认
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'voice' && copyAsset.status !== 'approved' && (
            <div className="text-center py-12">
              <Lock size={32} className="mx-auto mb-3 text-runway-text-secondary" />
              <div className="text-runway-text-secondary text-sm">文案尚未确认</div>
              <div className="text-xs text-runway-text-muted mt-1">请先通过文案审核，再配置配音</div>
            </div>
          )}
        </div>

        {/* Bottom chat input box */}
        <div className="p-5 border-t border-runway-border bg-runway-page">
          {activeTab === 'copy' && (
            <div className="rounded-2xl border-2 border-runway-border bg-runway-surface p-3 focus-within:border-framer-blue focus-within:ring-2 focus-within:ring-framer-blue/20 transition-all">
              <textarea
                value={copyInput}
                onChange={(e) => setCopyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendCopy(); } }}
                placeholder={copyEditMode === 'rules' ? '输入规则：风格、受众、语气要求...' : '直接编辑最终口播文案...'}
                className="w-full h-24 bg-transparent resize-none focus:outline-none text-sm text-runway-text placeholder:text-runway-text-muted"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCopyEditMode('rules')}
                    className={`px-2.5 h-7 rounded-lg text-xs border transition-colors cursor-pointer ${copyEditMode === 'rules' ? 'bg-runway-page border-runway-border text-runway-text' : 'bg-transparent border-transparent text-runway-text-secondary hover:text-runway-text'}`}
                  >
                    按规则
                  </button>
                  <button
                    onClick={() => { setCopyEditMode('text'); setCopyInput(copyAsset.finalText || copyAsset.generationPrompt); }}
                    className={`px-2.5 h-7 rounded-lg text-xs border transition-colors cursor-pointer ${copyEditMode === 'text' ? 'bg-runway-page border-runway-border text-runway-text' : 'bg-transparent border-transparent text-runway-text-secondary hover:text-runway-text'}`}
                  >
                    直接改
                  </button>
                </div>
                <button
                  onClick={handleSendCopy}
                  disabled={!copyInput.trim() || generating}
                  className="w-9 h-9 rounded-xl bg-framer-blue text-runway-text flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  {generating ? <RefreshCw size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'voice' && copyAsset.status === 'approved' && (
            <div className="rounded-2xl border-2 border-runway-border bg-runway-surface p-3 focus-within:border-framer-blue focus-within:ring-2 focus-within:ring-framer-blue/20 transition-all">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DropdownSelector
                    value={selectedVoice}
                    options={voiceAsset.availableVoices.map(v => ({ value: v, label: v }))}
                    onChange={setSelectedVoice}
                    widthClass="w-28"
                  />
                  <DropdownSelector
                    value={targetDuration}
                    options={['3','5','8','10','15','20'].map(v => ({ value: v, label: `${v} 秒` }))}
                    onChange={setTargetDuration}
                    icon={Clock}
                    widthClass="w-20"
                  />
                </div>
                <button
                  onClick={handleSendVoice}
                  disabled={generating}
                  className="w-9 h-9 rounded-xl bg-framer-blue text-runway-text flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  {generating ? <RefreshCw size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
