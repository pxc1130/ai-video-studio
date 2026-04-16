import { Plus, Film, Clock, CheckCircle2, AlertCircle, Loader2, ArrowRight, Sun, Moon, Settings, Zap, Wand2, Layers, Mic2, Sparkles, Server, Package } from 'lucide-react';
import { BatchUploadModal } from './BatchUploadModal';
import type { ProjectRun } from '../types';
import { useState, useEffect } from 'react';
import * as api from '../api/client';

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  idle: { label: '待开始', color: 'text-runway-textMuted', icon: Clock },
  uploaded: { label: '素材已上传', color: 'text-framer-blue', icon: Loader2 },
  planning: { label: 'AI 规划中', color: 'text-framer-blue', icon: Loader2 },
  planned: { label: '方案已生成', color: 'text-framer-blue', icon: Loader2 },
  rendering_scenes: { label: '渲染画面中', color: 'text-warning', icon: Loader2 },
  scenes_done: { label: '画面渲染完成', color: 'text-warning', icon: Loader2 },
  generating_voice: { label: '生成配音中', color: 'text-warning', icon: Loader2 },
  voice_done: { label: '配音已生成', color: 'text-warning', icon: Loader2 },
  assembling: { label: '合成导出中', color: 'text-warning', icon: Loader2 },
  completed: { label: '已完成', color: 'text-success', icon: CheckCircle2 },
  failed: { label: '失败', color: 'text-error', icon: AlertCircle },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CAPABILITIES = [
  {
    icon: Wand2,
    title: 'AI 智能分镜',
    desc: '基于商品图片和卖点，自动生成 TikTok 风格的创意分镜脚本。',
    color: 'text-framer-blue',
    bg: 'bg-framer-blue/10',
  },
  {
    icon: Mic2,
    title: '口播 + 配音',
    desc: '生成地道英文口播文案，并匹配 Influencer 风格配音。',
    color: 'text-success',
    bg: 'bg-success/10',
  },
  {
    icon: Layers,
    title: '音画对齐',
    desc: '可视化时间轴编辑器，像剪映一样微调镜头、配音与 BGM。',
    color: 'text-warning',
    bg: 'bg-warning/10',
  },
  {
    icon: Zap,
    title: '一键直出',
    desc: '上传素材后全自动跑通，5 步完成从分析到成片的全部流程。',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
];

export function Home({
  runs,
  onNewProject,
  onOpenRun,
  onGoBatchList,
  theme,
  toggleTheme,
}: {
  runs: ProjectRun[];
  onNewProject: () => void;
  onOpenRun: (run: ProjectRun) => void;
  onGoBatchList: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}) {
  const sortedRuns = [...runs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const completedCount = runs.filter(r => r.status === 'completed').length;
  const processingCount = runs.filter(r => ['planning', 'rendering_scenes', 'generating_voice', 'assembling'].includes(r.status)).length;

  const [backendMeta, setBackendMeta] = useState<{ mock_mode?: string; model?: string } | null>(null);
  const [showBatchUpload, setShowBatchUpload] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.health().then((h) => { if (mounted) setBackendMeta(h); }).catch(() => { if (mounted) setBackendMeta(null); });
    return () => { mounted = false; };
  }, []);

  const isRealMode = backendMeta?.mock_mode === 'false';

  return (
    <div className="min-h-full flex flex-col bg-runway-page text-runway-text">
      {/* Header */}
      <header className="h-16 border-b border-runway-border flex items-center justify-between px-6 bg-runway-surface/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-framer-blue/10 flex items-center justify-center">
            <Film size={18} className="text-framer-blue" />
          </div>
          <span className="font-medium tracking-tight">AI 视频工坊</span>
        </div>
        <div className="flex items-center gap-4 text-runway-text-secondary">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:text-runway-text hover:bg-runway-surface transition-colors cursor-pointer"
            title="切换主题"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="p-2 rounded-lg hover:text-runway-text hover:bg-runway-surface transition-colors cursor-pointer"
            title="设置"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-6xl mx-auto w-full p-6 md:p-10">
        {/* Hero */}
        <div className="rounded-3xl border border-runway-border bg-runway-surface p-8 md:p-12 mb-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-framer-blue/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            {backendMeta && (
              <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
                style={{
                  borderColor: isRealMode ? 'rgba(34,197,94,0.3)' : 'rgba(250,204,21,0.3)',
                  backgroundColor: isRealMode ? 'rgba(34,197,94,0.08)' : 'rgba(250,204,21,0.08)',
                  color: isRealMode ? '#22c55e' : '#eab308',
                }}
                title={`Backend: ${isRealMode ? 'Real API' : 'Mock mode'} · Model: ${backendMeta.model || 'unknown'}`}>
                <Server size={12} />
                {isRealMode ? 'Real API' : 'Mock mode'}
                {backendMeta.model ? ` · ${backendMeta.model}` : ''}
              </div>
            )}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-framer-blue/10 text-framer-blue text-xs font-medium mb-4">
                <Sparkles size={12} />
                跨境电商 · TikTok · AI 短视频
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
                开启跨境电商 AI 短视频创作
              </h1>
              <p className="text-runway-textSecondary text-base md:text-lg mb-8">
                从商品素材到 AI 分镜，再到音画对齐与成片导出，一站式完成 TikTok 电商短视频制作。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onNewProject}
                  className="h-12 px-8 rounded-full bg-framer-blue text-runway-text text-sm font-medium hover:bg-framer-blue/90 transition-colors inline-flex items-center gap-2 btn-interactive cursor-pointer"
                >
                  <Plus size={18} />
                  新建项目
                </button>
                <button
                  onClick={() => setShowBatchUpload(true)}
                  className="h-12 px-6 rounded-full border border-runway-border bg-runway-surface text-runway-text text-sm font-medium hover:bg-runway-elevated transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <Package size={18} />
                  批量生成视频
                </button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex gap-4 md:pb-1">
              <div className="min-w-[100px] rounded-2xl border border-runway-border bg-runway-page/60 p-4 text-center">
                <div className="text-2xl font-semibold">{runs.length}</div>
                <div className="text-xs text-runway-textMuted mt-1">总项目</div>
              </div>
              <div className="min-w-[100px] rounded-2xl border border-runway-border bg-runway-page/60 p-4 text-center">
                <div className="text-2xl font-semibold text-success">{completedCount}</div>
                <div className="text-xs text-runway-textMuted mt-1">已完成</div>
              </div>
              <div className="min-w-[100px] rounded-2xl border border-runway-border bg-runway-page/60 p-4 text-center">
                <div className="text-2xl font-semibold text-framer-blue">{processingCount}</div>
                <div className="text-xs text-runway-textMuted mt-1">创作中</div>
              </div>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="mb-10">
          <h2 className="text-lg font-medium mb-5">核心能力</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="rounded-2xl border border-runway-border bg-runway-surface p-5 hover:border-framer-blue/20 hover:shadow-sm transition-all"
              >
                <div className={`w-10 h-10 rounded-xl ${cap.bg} flex items-center justify-center mb-3`}>
                  <cap.icon size={20} className={cap.color} />
                </div>
                <div className="text-sm font-medium mb-1">{cap.title}</div>
                <div className="text-xs text-runway-textMuted leading-relaxed">{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent projects */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-medium">最近项目</h2>
              <button
                onClick={onGoBatchList}
                className="text-xs text-framer-blue hover:underline"
              >
                查看批量任务 →
              </button>
            </div>
            <span className="text-xs text-runway-textMuted">共 {sortedRuns.length} 个</span>
          </div>

          {sortedRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-runway-border bg-runway-surface/50 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-runway-surface border border-runway-border flex items-center justify-center mx-auto mb-4">
                <Film size={28} className="text-runway-textMuted" />
              </div>
              <div className="text-sm font-medium text-runway-text mb-1">还没有项目</div>
              <div className="text-xs text-runway-textMuted mb-5">点击上方「新建项目」，开始你的第一条 AI 短视频</div>
              <button
                onClick={onNewProject}
                className="h-10 px-5 rounded-full border border-runway-border bg-runway-surface text-runway-text text-sm font-medium hover:bg-runway-elevated transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus size={16} /> 立即创建
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedRuns.map(run => {
                const meta = STATUS_META[run.status] || STATUS_META.idle;
                return (
                  <div
                    key={run.id}
                    onClick={() => onOpenRun(run)}
                    className="group rounded-2xl border border-runway-border bg-runway-surface p-5 hover:border-framer-blue/40 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${meta.color.replace('text-', 'bg-')}`} />
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                      </div>
                      <ArrowRight size={16} className="text-runway-textMuted group-hover:text-framer-blue transition-colors" />
                    </div>
                    <div className="text-sm font-medium text-runway-text mb-1 line-clamp-1" title={run.title}>
                      {run.title || '未命名项目'}
                    </div>
                    <div className="text-xs text-runway-textMuted">
                      {formatDate(run.createdAt)} · {run.mode === 'fast' ? '一键直出' : '标准模式'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showBatchUpload && (
        <BatchUploadModal
          onClose={() => setShowBatchUpload(false)}
          onSuccess={() => {
            setShowBatchUpload(false);
            onGoBatchList();
          }}
        />
      )}
    </div>
  );
}
