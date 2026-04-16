import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  Clock,
  FileArchive,
} from 'lucide-react';
import * as api from '../api/client';

const BATCH_STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: '排队中', color: 'text-runway-textMuted', icon: Clock },
  running: { label: '生成中', color: 'text-framer-blue', icon: Loader2 },
  completed: { label: '已完成', color: 'text-success', icon: CheckCircle2 },
  failed: { label: '失败', color: 'text-error', icon: AlertCircle },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.ceil(sec / 60)}分钟`;
  return `${Math.ceil(sec / 3600)}小时`;
}

export function BatchList({ onBack }: { onBack: () => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, any[]>>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchBatches = async () => {
    try {
      const res = await api.listBatches(20);
      setBatches(res.batches || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!itemsMap[id]) {
      try {
        const res = await api.getBatchStatus(id);
        setItemsMap((prev) => ({ ...prev, [id]: res.items || [] }));
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.listBatches(20);
        if (mounted) setBatches(res.batches || []);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const t = setInterval(() => {
      if (!mounted) return;
      setRefreshing(true);
      load().finally(() => { if (mounted) setRefreshing(false); });
      if (expandedId) {
        api.getBatchStatus(expandedId).then((res) => {
          if (mounted) setItemsMap((prev) => ({ ...prev, [expandedId]: res.items || [] }));
        }).catch(() => {});
      }
    }, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, [expandedId]);

  return (
    <div className="min-h-full flex flex-col bg-runway-page text-runway-text">
      <header className="h-16 border-b border-runway-border flex items-center justify-between px-6 bg-runway-surface/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-runway-elevated text-runway-text-secondary transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-medium tracking-tight">批量任务中心</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); fetchBatches().finally(() => setLoading(false)); }}
            className="p-2 rounded-lg hover:bg-runway-elevated text-runway-text-secondary transition-colors"
            title="刷新"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-10">
        <h1 className="text-2xl font-medium tracking-tight-runway mb-6">批量生成记录</h1>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-runway-textMuted">
            <Loader2 size={24} className="animate-spin mr-2" />
            加载中...
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-runway-border bg-runway-surface/50 p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-runway-surface border border-runway-border flex items-center justify-center mx-auto mb-4">
              <Package size={28} className="text-runway-textMuted" />
            </div>
            <div className="text-sm font-medium text-runway-text mb-1">还没有批量任务</div>
            <div className="text-xs text-runway-textMuted">在首页点击「批量生成视频」开始创建</div>
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => {
              const meta = BATCH_STATUS_META[batch.status] || BATCH_STATUS_META.pending;
              const progress = batch.total_items > 0
                ? Math.round(((batch.completed_items + batch.failed_items) / batch.total_items) * 100)
                : 0;
              const Icon = meta.icon;

              return (
                <div
                  key={batch.id}
                  className="rounded-2xl border border-runway-border bg-runway-surface overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={16} className={meta.color} />
                          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                          <span className="text-xs text-runway-textMuted">· {formatDate(batch.created_at)}</span>
                        </div>
                        <div className="text-sm font-medium text-runway-text mb-1">批次 {batch.id}</div>
                        <div className="text-xs text-runway-textMuted">
                          共 {batch.total_items} 个商品 · 成功 {batch.completed_items} · 失败 {batch.failed_items}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {batch.status === 'completed' && batch.zip_path && (
                          <a
                            href={api.batchDownloadUrl(batch.id)}
                            download
                            className="h-9 px-3 rounded-lg bg-framer-blue text-runway-text text-xs font-medium hover:bg-framer-blue/90 transition-colors flex items-center gap-1.5"
                          >
                            <FileArchive size={14} /> 下载 ZIP
                          </a>
                        )}
                        <button
                          onClick={() => toggleExpand(batch.id)}
                          className="h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-runway-text text-xs font-medium hover:bg-runway-elevated transition-colors"
                        >
                          {expandedId === batch.id ? '收起' : '详情'}
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="h-2 rounded-full bg-runway-elevated overflow-hidden">
                        <div
                          className="h-full rounded-full bg-framer-blue transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs text-runway-textMuted">
                        <span>进度 {progress}%</span>
                        {batch.eta_seconds > 0 && batch.status === 'running' && (
                          <span>预计剩余 {formatDuration(batch.eta_seconds)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded items */}
                  {expandedId === batch.id && (
                    <div className="border-t border-runway-border/50 px-5 py-4 bg-runway-page/40">
                      {!itemsMap[batch.id] ? (
                        <div className="text-sm text-runway-textMuted flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> 加载详情...
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {itemsMap[batch.id].map((it: any) => (
                            <div
                              key={it.id}
                              className="flex items-center justify-between px-3 py-2 rounded-xl border border-runway-border/60 bg-runway-surface"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs text-runway-textMuted w-6">#{it.idx + 1}</span>
                                <span className="text-sm text-runway-text truncate" title={it.product_name}>
                                  {it.product_name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {it.status === 'completed' && it.run_id && (
                                  <a
                                    href={api.artifactUrl(it.run_id, 'deliverables/final_with_voice.mp4')}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-framer-blue hover:underline"
                                  >
                                    查看视频
                                  </a>
                                )}
                                <span
                                  className={`text-xs ${
                                    it.status === 'completed'
                                      ? 'text-success'
                                      : it.status === 'failed'
                                      ? 'text-error'
                                      : 'text-runway-textMuted'
                                  }`}
                                >
                                  {it.status === 'completed' ? '成功' : it.status === 'failed' ? '失败' : '等待中'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
