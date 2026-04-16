import type { Shot, CopyAsset, VoiceAsset, Status, CreativePlan } from '../../types';
import { useState, useRef } from 'react';
import { RefreshCw, Wand2, ArrowRight, Plus, Upload, Trash2, Lock, Mic } from 'lucide-react';
import { statusBadge } from '../../utils/helpers';
import { VideoModal } from '../modals/VideoModal';
import { CopyVoiceModal } from '../modals/CopyVoiceModal';

// ============================================================
// Stage 2: Proposal
// ============================================================
export function ProposalStage({
  shots,
  copyAsset,
  voiceAsset,
  onNext,
  setShots,
  setCopyAsset,
  setVoiceAsset,
  plan,
}: {
  shots: Shot[];
  copyAsset: CopyAsset;
  voiceAsset: VoiceAsset;
  onNext: () => void;
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  setCopyAsset: React.Dispatch<React.SetStateAction<CopyAsset>>;
  setVoiceAsset: React.Dispatch<React.SetStateAction<VoiceAsset>>;
  plan?: CreativePlan | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [videoModalId, setVideoModalId] = useState<string | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pendingUploadShotId, setPendingUploadShotId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRegenerate = () => {
    setGenerating(true);
    setShots(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'generating' as Status } : s));
    setTimeout(() => {
      setShots(prev => prev.map(s => s.status === 'generating' ? { ...s, status: 'review' as Status } : s));
      setGenerating(false);
    }, 1500);
  };

  const addShot = () => {
    const newId = Math.random().toString(36).slice(2);
    const newShot: Shot = {
      id: newId,
      index: shots.length + 1,
      currentPrompt: '',
      duration: 3.0,
      model: 'Wan 2.6',
      status: 'pending',
      history: [],
    };
    setShots(prev => [...prev, newShot]);
  };

  const handleUploadClick = (e: React.MouseEvent, shotId: string) => {
    e.stopPropagation();
    setPendingUploadShotId(shotId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0 || !pendingUploadShotId) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      setPendingUploadShotId(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setShots(prev => prev.map(s => s.id === pendingUploadShotId ? {
      ...s,
      coverUrl: objectUrl,
      referenceImage: file.name,
      currentPrompt: s.currentPrompt || '参考图已上传，AI 将根据画面氛围生成描述...'
    } : s));
    setPendingUploadShotId(null);
  };

  const deleteShot = (id: string) => {
    setShots(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({ ...s, index: i + 1 }));
    });
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    setShots(prev => {
      const fromIdx = prev.findIndex(s => s.id === dragId);
      const toIdx = prev.findIndex(s => s.id === targetId);
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((s, i) => ({ ...s, index: i + 1 }));
    });
    setDragId(null);
    setDragOverId(null);
  };

  const allApproved = shots.every(s => s.status === 'approved') && copyAsset.status === 'approved' && voiceAsset.status === 'approved';

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { handleFileChange(e.target.files); e.currentTarget.value = ''; }}
      />
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight-runway mb-1">AI 创意方案</h1>
            <p className="text-runway-text-secondary text-sm">
              {plan ? `当前商品：${plan.product.title || '未命名商品'}` : '点击卡片精修分镜，拖拽卡片调整顺序。全部确认后进入下一步。'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="h-10 px-5 rounded-full bg-framer-frosted text-runway-text text-sm font-medium hover:bg-runway-hover disabled:opacity-40 transition-colors flex items-center gap-2 border border-runway-borderStrong cursor-pointer"
            >
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {generating ? '生成中...' : '一键生成全部'}
            </button>
            <button
              onClick={onNext}
              disabled={!allApproved}
              className={`h-10 px-5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                allApproved ? 'bg-framer-blue text-runway-text hover:bg-framer-blue/90 cursor-pointer' : 'bg-runway-surface text-runway-text-secondary cursor-not-allowed'
              }`}
            >
              进入音画对齐 <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Shots Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-runway-text-secondary uppercase tracking-wider">分镜方案（{shots.length} 镜）</div>
            <button onClick={addShot} className="text-sm text-framer-blue hover:text-runway-text transition-all active:scale-[0.98] flex items-center gap-1 cursor-pointer">
              <Plus size={12} /> 添加分镜
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {shots.map((shot, idx) => {
              const badge = statusBadge(shot.status);
              const isDragging = dragId === shot.id;
              const isOver = dragOverId === shot.id;
              const fromIdx = dragId ? shots.findIndex(s => s.id === dragId) : -1;
              const toIdx = idx;
              const shiftDirection = isOver && fromIdx !== -1 ? (fromIdx < toIdx ? -1 : 1) : 0;

              return (
                <div
                  key={shot.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, shot.id)}
                  onDragOver={(e) => onDragOver(e, shot.id)}
                  onDrop={(e) => onDrop(e, shot.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  className={`
                    group relative rounded-2xl border cursor-pointer
                    transition-all duration-200 ease-out
                    ${isDragging ? 'opacity-40 scale-95' : 'bg-runway-surface border-runway-border hover:border-runway-borderStrong'}
                    ${isOver ? 'ring-2 ring-framer-blue' : ''}
                  `}
                  style={{
                    transform: shiftDirection !== 0 ? `translateX(${shiftDirection * 16}px) scale(0.98)` : undefined,
                  }}
                  onClick={() => setVideoModalId(shot.id)}
                >
                  {/* Top-left index sticker */}
                  <div className="absolute -top-3 -left-3 z-20">
                    <span className="text-xs px-2.5 py-1.5 rounded-md shadow-md border-2 bg-runway-page text-runway-text flex items-center gap-1 -rotate-6">
                      第 {shot.index} 镜
                    </span>
                  </div>
                  {/* Top-right status sticker */}
                  <div className="absolute -top-3 -right-3 z-20">
                    <span className={`text-xs px-2.5 py-1.5 rounded-md shadow-md border-2 flex items-center gap-1 rotate-6 ${badge.bg} ${badge.color}`}>
                      {badge.icon} {badge.text}
                    </span>
                  </div>

                  <div className="aspect-video bg-gradient-to-br from-runway-surface to-runway-page rounded-t-2xl relative overflow-hidden">
                    {shot.coverUrl ? (
                      <img src={shot.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <button
                          onClick={(e) => handleUploadClick(e, shot.id)}
                          className="px-3 py-1.5 rounded-lg bg-runway-elevated border border-runway-border text-xs text-runway-text-secondary hover:text-runway-text hover:border-runway-borderStrong transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Upload size={12} /> 上传参考图
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-xs text-runway-text-muted mb-1">{shot.duration} 秒 · {shot.model}</div>
                    <div className="text-sm text-runway-text/90 line-clamp-2">{shot.currentPrompt || <span className="italic text-runway-text-muted">空分镜</span>}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteShot(shot.id); }}
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-error transition-all cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Copy Proposal */}
        <div>
          <div className="text-sm text-runway-text-secondary uppercase tracking-wider mb-4">口播文案与配音</div>
          <div
            onClick={() => setCopyModalOpen(true)}
            className="p-5 rounded-2xl border border-runway-border bg-runway-surface max-w-3xl cursor-pointer hover:border-runway-borderStrong transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">最终口播文案</span>
              <span className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${statusBadge(copyAsset.status).bg} ${statusBadge(copyAsset.status).color}`}>
                {statusBadge(copyAsset.status).icon} {statusBadge(copyAsset.status).text}
              </span>
            </div>
            <div className="text-base text-runway-text/90 leading-relaxed">{copyAsset.finalText}</div>
            <div className="mt-4 pt-4 border-t border-runway-border flex items-center justify-between">
              <div>
                <div className="text-xs text-runway-text-secondary mb-1">配音</div>
                <div className="text-xs flex items-center gap-1.5">
                  {copyAsset.status !== 'approved' ? (
                    <span className="text-runway-text-muted flex items-center gap-1"><Lock size={10} /> 文案确认后解锁</span>
                  ) : (
                    <>
                      <span className="text-runway-text-muted flex items-center gap-1"><Mic size={10} /> {voiceAsset.voiceName} · {voiceAsset.duration}s</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${statusBadge(voiceAsset.status).bg} ${statusBadge(voiceAsset.status).color}`}>
                        {statusBadge(voiceAsset.status).icon} {statusBadge(voiceAsset.status).text}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-xs text-framer-blue">点击编辑 &rarr;</span>
            </div>
          </div>
        </div>
      </div>

      {videoModalId && (
        <VideoModal
          shot={shots.find(s => s.id === videoModalId)!}
          onClose={() => setVideoModalId(null)}
          setShots={setShots}
        />
      )}

      {copyModalOpen && (
        <CopyVoiceModal
          copyAsset={copyAsset}
          voiceAsset={voiceAsset}
          onClose={() => setCopyModalOpen(false)}
          setCopyAsset={setCopyAsset}
          setVoiceAsset={setVoiceAsset}
        />
      )}
    </div>
  );
}
