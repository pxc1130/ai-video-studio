import type { Shot, VoiceAsset, BgmClip, VoiceClip } from '../../types';
import { BGM_CLIPS } from '../../data/mock';
import { useState, useRef, useEffect } from 'react';
import { Pause, Play, SkipBack, Scissors, Trash2, Undo, RotateCcw, ArrowRight, Film, Volume2, Music, RefreshCw } from 'lucide-react';

// ============================================================
// Stage 3: Align (Timeline Editor)
// ============================================================
// ============================================================
// Stage 3: Align (CapCut-style Timeline Editor)
// ============================================================
// ============================================================
// Stage 3: Align (CapCut-style Timeline Editor)
// ============================================================
export function AlignStage({ shots, voiceAsset, onNext, setVoiceAsset, pipelineStatus }: { shots: Shot[]; voiceAsset: VoiceAsset; onNext: () => void; setVoiceAsset: React.Dispatch<React.SetStateAction<VoiceAsset>>; pipelineStatus?: string }) {
  void setVoiceAsset;

  // Initial state
  const initialShots = shots.map((s, i) => ({ ...s, start: shots.slice(0, i).reduce((a, x) => a + x.duration, 0) }));
  const initialVoices: VoiceClip[] = [{ id: 'voice-1', voiceName: voiceAsset.voiceName, start: 0, duration: voiceAsset.duration }];
  const initialBgm: BgmClip[] = JSON.parse(JSON.stringify(BGM_CLIPS));

  const [localShots, setLocalShots] = useState(initialShots);
  const [localVoices, setLocalVoices] = useState(initialVoices);
  const [localBgm, setLocalBgm] = useState<BgmClip[]>(initialBgm);

  // Undo history
  type HistoryItem = { shots: typeof localShots; voices: VoiceClip[]; bgm: BgmClip[] };
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const pushHistory = () => {
    setHistory(prev => [...prev, { shots: localShots, voices: localVoices, bgm: localBgm }]);
  };

  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setLocalShots(last.shots);
      setLocalVoices(last.voices);
      setLocalBgm(last.bgm);
      return prev.slice(0, -1);
    });
  };

  const resetAll = () => {
    pushHistory();
    setLocalShots(initialShots);
    setLocalVoices(initialVoices);
    setLocalBgm(initialBgm);
    setSelectedId(null);
  };

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(40);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<'video' | 'voice' | 'bgm' | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const trackLabelWidth = 96;
  const totalDuration = Math.max(
    localShots.reduce((a, s) => Math.max(a, s.start + s.duration), 0),
    localVoices.reduce((a, v) => Math.max(a, v.start + v.duration), 0),
    localBgm.reduce((a, c) => Math.max(a, c.start + c.duration), 0),
    30
  );
  const timelineWidth = Math.max(totalDuration * zoom, 800);

  // Play loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime(t => {
        const next = t + dt;
        if (next >= totalDuration) {
          setPlaying(false);
          return totalDuration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalDuration]);

  // Sync shots start when duration changes
  const recomputeVideoStarts = (list: typeof localShots) => {
    let acc = 0;
    return list.map(_s => { const start = acc; acc += _s.duration; return { ..._s, start }; });
  };

  // Current preview shot
  const previewShot = localShots.slice().reverse().find(s => currentTime >= s.start) || localShots[0];

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const timeFromEvent = (e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = (e as MouseEvent).clientX - rect.left - trackLabelWidth + timelineRef.current.scrollLeft;
    return Math.max(0, x / zoom);
  };

  // Drag state
  const dragRef = useRef<{ type: 'move' | 'trim-start' | 'trim-end' | 'playhead'; id: string; track: typeof selectedTrack; startTime: number; initialStart: number; initialDuration: number; offsetX: number } | null>(null);

  const onDrag = (e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const t = timeFromEvent(e);
    if (d.type === 'playhead') {
      setCurrentTime(Math.max(0, Math.min(t, totalDuration)));
      return;
    }
    if (d.track === 'video') {
      setLocalShots(prev => {
        const updated = prev.map(s => {
          if (s.id !== d.id) return s;
          if (d.type === 'move') return { ...s, start: Math.max(0, t - d.offsetX) };
          if (d.type === 'trim-start') {
            const newStart = Math.min(t, d.initialStart + d.initialDuration - 0.5);
            return { ...s, start: newStart, duration: Math.max(0.5, d.initialStart + d.initialDuration - newStart) };
          }
          if (d.type === 'trim-end') return { ...s, duration: Math.max(0.5, t - d.initialStart) };
          return s;
        });
        return recomputeVideoStarts(updated);
      });
    }
    if (d.track === 'voice') {
      setLocalVoices(prev => prev.map(v => {
        if (v.id !== d.id) return v;
        if (d.type === 'move') return { ...v, start: Math.max(0, t - d.offsetX) };
        if (d.type === 'trim-start') {
          const newStart = Math.min(t, d.initialStart + d.initialDuration - 0.5);
          return { ...v, start: newStart, duration: Math.max(0.5, d.initialStart + d.initialDuration - newStart) };
        }
        if (d.type === 'trim-end') return { ...v, duration: Math.max(0.5, t - d.initialStart) };
        return v;
      }));
    }
    if (d.track === 'bgm') {
      setLocalBgm(prev => prev.map(c => {
        if (c.id !== d.id) return c;
        if (d.type === 'move') return { ...c, start: Math.max(0, t - d.offsetX) };
        if (d.type === 'trim-start') {
          const newStart = Math.min(t, d.initialStart + d.initialDuration - 0.5);
          return { ...c, start: newStart, duration: Math.max(0.5, d.initialStart + d.initialDuration - newStart) };
        }
        if (d.type === 'trim-end') return { ...c, duration: Math.max(0.5, t - d.initialStart) };
        return c;
      }));
    }
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (d && d.type !== 'playhead') {
      pushHistory();
    }
    dragRef.current = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
  };

  const handleTrackMouseDown = (e: React.MouseEvent, item: any, track: typeof selectedTrack, type: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation();
    setSelectedId(item.id);
    setSelectedTrack(track);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    let dragType = type;
    if (type === 'move') {
      if (relX < 6) dragType = 'trim-start';
      else if (rect.width - relX < 6) dragType = 'trim-end';
    }
    dragRef.current = {
      type: dragType,
      id: item.id,
      track,
      startTime: timeFromEvent(e),
      initialStart: item.start,
      initialDuration: item.duration,
      offsetX: relX / zoom,
    };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { type: 'playhead', id: '', track: null, startTime: 0, initialStart: 0, initialDuration: 0, offsetX: 0 };
    const t = timeFromEvent(e);
    setCurrentTime(Math.max(0, Math.min(t, totalDuration)));
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragRef.current = { type: 'playhead', id: '', track: null, startTime: 0, initialStart: 0, initialDuration: 0, offsetX: 0 };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  };

  // Split: cut selected clip at playhead into two pieces
  const splitSelected = () => {
    if (!selectedId || !selectedTrack) return;
    const t = currentTime;
    pushHistory();
    if (selectedTrack === 'video') {
      setLocalShots(prev => {
        const idx = prev.findIndex(s => s.id === selectedId);
        if (idx === -1) return prev;
        const s = prev[idx];
        if (t <= s.start || t >= s.start + s.duration) return prev;
        const left = { ...s, id: s.id + '-l', duration: t - s.start };
        const right = { ...s, id: s.id + '-r', start: t, duration: s.start + s.duration - t };
        const next = [...prev];
        next.splice(idx, 1, left, right);
        return recomputeVideoStarts(next);
      });
      setSelectedId(selectedId + '-r');
    }
    if (selectedTrack === 'voice') {
      setLocalVoices(prev => prev.flatMap(v => {
        if (v.id !== selectedId || t <= v.start || t >= v.start + v.duration) return [v];
        const left: VoiceClip = { ...v, id: v.id + '-l', duration: t - v.start };
        const right: VoiceClip = { ...v, id: v.id + '-r', start: t, duration: v.start + v.duration - t };
        return [left, right];
      }));
      setSelectedId(selectedId + '-r');
    }
    if (selectedTrack === 'bgm') {
      setLocalBgm(prev => prev.flatMap(c => {
        if (c.id !== selectedId || t <= c.start || t >= c.start + c.duration) return [c];
        const left = { ...c, id: c.id + '-l', duration: t - c.start };
        const right = { ...c, id: c.id + '-r', start: t, duration: c.start + c.duration - t };
        return [left, right];
      }));
      setSelectedId(selectedId + '-r');
    }
  };

  const deleteSelected = () => {
    if (!selectedId || !selectedTrack) return;
    pushHistory();
    if (selectedTrack === 'video') {
      setLocalShots(prev => recomputeVideoStarts(prev.filter(s => s.id !== selectedId)));
    }
    if (selectedTrack === 'voice') {
      setLocalVoices(prev => prev.filter(v => v.id !== selectedId));
    }
    if (selectedTrack === 'bgm') {
      setLocalBgm(prev => prev.filter(c => c.id !== selectedId));
    }
    setSelectedId(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setPlaying(p => !p);
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedTrack, currentTime]);

  const ticks = [];
  for (let t = 0; t <= Math.ceil(totalDuration); t += 1) ticks.push(t);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-runway-page">
      {/* Top: Preview + Info */}
      <div className="px-6 py-4 border-b border-runway-border flex items-stretch gap-4">
        <div className="relative w-64 aspect-video rounded-xl bg-runway-deep border border-runway-border overflow-hidden flex items-center justify-center shrink-0">
          {previewShot?.coverUrl ? (
            <img src={previewShot.coverUrl} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="text-runway-text-muted text-sm">无画面</div>
          )}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs backdrop-blur">{formatTime(currentTime)}</div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h1 className="text-xl font-medium tracking-tight-runway text-runway-text">音画对齐</h1>
          </div>
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setPlaying(p => !p)} className="w-10 h-10 rounded-full bg-framer-blue text-runway-text flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer">
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={() => { setCurrentTime(0); setPlaying(false); }} className="w-9 h-9 rounded-full bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-runway-text flex items-center justify-center transition-colors cursor-pointer">
                <SkipBack size={14} />
              </button>
              <button onClick={splitSelected} disabled={!selectedId} className="h-9 px-3 rounded-lg bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-runway-text disabled:opacity-40 transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Scissors size={14} /> 分割
              </button>
              <button onClick={deleteSelected} disabled={!selectedId} className="h-9 px-3 rounded-lg bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-error disabled:opacity-40 transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Trash2 size={14} /> 删除
              </button>
              <button onClick={undo} disabled={history.length === 0} className="h-9 px-3 rounded-lg bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-runway-text disabled:opacity-40 transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Undo size={14} /> 回退
              </button>
              <button onClick={resetAll} className="h-9 px-3 rounded-lg bg-runway-elevated border border-runway-border text-runway-text-secondary hover:text-runway-text transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <RotateCcw size={14} /> 重置
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-runway-elevated border border-runway-border rounded-xl px-3 py-1.5">
                <span className="text-xs text-runway-text-secondary">缩放</span>
                <input type="range" min={20} max={120} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-24 accent-framer-blue" />
                <span className="text-xs font-mono text-runway-text">{zoom}px/s</span>
              </div>
              <button
                onClick={onNext}
                disabled={Boolean(pipelineStatus && pipelineStatus !== 'idle' && pipelineStatus !== 'failed')}
                className="h-10 px-5 rounded-full bg-framer-blue text-runway-text text-sm font-medium hover:bg-framer-blue/90 disabled:opacity-40 transition-colors flex items-center gap-2 btn-interactive cursor-pointer"
              >
                {pipelineStatus === 'assembling' ? (
                  <><RefreshCw size={14} className="animate-spin" /> 合成中...</>
                ) : (
                  <>确认对齐 <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-hidden flex">
        {/* Track labels */}
        <div className="w-24 shrink-0 border-r border-runway-border bg-runway-page flex flex-col">
          <div className="h-8 border-b border-runway-border bg-runway-deep" />
          <div className="flex-1 flex flex-col">
            <div className="h-20 border-b border-runway-border flex items-center px-3 text-xs text-runway-text-secondary gap-2">
              <Film size={14} /> 视频
            </div>
            <div className="h-16 border-b border-runway-border flex items-center px-3 text-xs text-runway-text-secondary gap-2">
              <Volume2 size={14} /> 配音
            </div>
            <div className="h-14 border-b border-runway-border flex items-center px-3 text-xs text-runway-text-secondary gap-2">
              <Music size={14} /> BGM
            </div>
          </div>
        </div>

        {/* Tracks canvas */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-runway-deep relative select-none" ref={timelineRef} onClick={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setSelectedTrack(null); } }}>
          <div style={{ width: timelineWidth + trackLabelWidth }} className="relative h-full">
            {/* Ruler */}
            <div className="h-8 border-b border-runway-border bg-runway-page relative" onMouseDown={handleRulerMouseDown}>
              {ticks.map(t => (
                <div key={t} className="absolute top-0 bottom-0 flex flex-col items-center justify-end pb-1 pointer-events-none" style={{ left: t * zoom }}>
                  <div className="h-2 w-px bg-runway-borderStrong mb-1" />
                  <span className="text-[10px] text-runway-text-muted font-mono">{t}s</span>
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 z-30" style={{ left: currentTime * zoom }} onMouseDown={handlePlayheadMouseDown}>
              <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-error rotate-45 cursor-ew-resize" />
              <div className="w-px h-full bg-error cursor-ew-resize" />
            </div>

            {/* Video Track */}
            <div className="h-20 border-b border-runway-border relative" onMouseDown={handleRulerMouseDown}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 39px, var(--border-strong) 39px, var(--border-strong) 40px)' }} />
              {localShots.map(shot => {
                const selected = selectedTrack === 'video' && selectedId === shot.id;
                return (
                  <div
                    key={shot.id}
                    onMouseDown={(e) => handleTrackMouseDown(e, shot, 'video', 'move')}
                    className={`absolute top-2 bottom-2 rounded-lg border overflow-hidden flex flex-col justify-between group cursor-grab ${selected ? 'ring-2 ring-framer-blue border-framer-blue z-10' : 'border-runway-borderStrong hover:border-runway-text'}`}
                    style={{ left: shot.start * zoom, width: Math.max(shot.duration * zoom - 4, 24), background: 'var(--bg-card)' }}
                  >
                    {shot.coverUrl ? (
                      <img src={shot.coverUrl} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-b from-runway-page/20 to-runway-page/50" />
                    <div className="relative z-10 px-2 py-1 text-[10px] text-runway-text truncate font-medium">第 {shot.index} 镜</div>
                    <div className="relative z-10 px-2 py-1 text-[10px] text-runway-text-muted font-mono">{shot.duration.toFixed(1)}s</div>
                    <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, shot, 'video', 'trim-start'); }} />
                    <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, shot, 'video', 'trim-end'); }} />
                  </div>
                );
              })}
            </div>

            {/* Voice Track */}
            <div className="h-16 border-b border-runway-border relative" onMouseDown={handleRulerMouseDown}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 39px, var(--border-strong) 39px, var(--border-strong) 40px)' }} />
              {localVoices.map(voice => {
                const selected = selectedTrack === 'voice' && selectedId === voice.id;
                return (
                  <div
                    key={voice.id}
                    onMouseDown={(e) => handleTrackMouseDown(e, voice, 'voice', 'move')}
                    className={`absolute top-2 bottom-2 rounded-lg border overflow-hidden flex items-center justify-center group cursor-grab ${selected ? 'ring-2 ring-framer-blue border-framer-blue z-10' : 'border-runway-borderStrong hover:border-runway-text'}`}
                    style={{ left: voice.start * zoom, width: Math.max(voice.duration * zoom - 4, 24), background: 'var(--bg-card)' }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center gap-[2px] opacity-40 px-2">
                      {Array.from({ length: Math.min(Math.floor(voice.duration * 10), 80) }).map((__, j) => (
                        <div key={j} className="w-0.5 bg-framer-blue rounded-full" style={{ height: `${20 + Math.random() * 60}%` }} />
                      ))}
                    </div>
                    <div className="relative z-10 text-[10px] text-framer-blue font-medium px-2 truncate">{voice.voiceName}</div>
                    <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, voice, 'voice', 'trim-start'); }} />
                    <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, voice, 'voice', 'trim-end'); }} />
                  </div>
                );
              })}
            </div>

            {/* BGM Track */}
            <div className="h-14 border-b border-runway-border relative" onMouseDown={handleRulerMouseDown}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 39px, var(--border-strong) 39px, var(--border-strong) 40px)' }} />
              {localBgm.map(clip => {
                const selected = selectedTrack === 'bgm' && selectedId === clip.id;
                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleTrackMouseDown(e, clip, 'bgm', 'move')}
                    className={`absolute top-2 bottom-2 rounded-lg border overflow-hidden flex items-center justify-center group cursor-grab ${selected ? 'ring-2 ring-framer-blue border-framer-blue z-10' : 'border-runway-borderStrong hover:border-runway-text'}`}
                    style={{ left: clip.start * zoom, width: Math.max(clip.duration * zoom - 4, 24), background: clip.color }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center gap-[2px] opacity-30 px-2">
                      {Array.from({ length: Math.min(Math.floor(clip.duration * 8), 64) }).map((__, j) => (
                        <div key={j} className="w-0.5 bg-amber-500 rounded-full" style={{ height: `${15 + Math.random() * 70}%` }} />
                      ))}
                    </div>
                    <div className="relative z-10 text-[10px] text-runway-text font-medium px-2 truncate">{clip.name}</div>
                    <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, clip, 'bgm', 'trim-start'); }} />
                    <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-framer-blue/60" onMouseDown={e => { e.stopPropagation(); handleTrackMouseDown(e, clip, 'bgm', 'trim-end'); }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
