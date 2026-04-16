import { useEffect, useRef, useState } from 'react';
import {
  Film,
  RefreshCw,
  Download,
  Check,
  AlertCircle,
  Play,
  Home,
  Sparkles,
  SendHorizontal,
  FileText,
  Image as ImageIcon,
  Mic,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle2,
  Volume2,
  FileAudio,
  Clapperboard,
} from 'lucide-react';
import {
  artifactUrl,
  getDouyinLoginSession,
  getPublishAccounts,
  getPublishTask,
  getRunSummary,
  health,
  mockVideoSourceUrl,
  publishDouyinVideo,
  startDouyinLogin,
} from '../../api/client';
import type {
  CreativePlan,
  CreativePlanScene,
  HealthResponse,
  PublishLoginSession,
  PublishPlatform,
  PublishTask,
  PublishTaskStatus,
  RunSummaryResponse,
} from '../../types';

interface ArtifactItem {
  name: string;
  kind: string;
  path: string;
  size: number;
}

interface VoiceoverMeta {
  script?: string;
  voice?: string;
  tts_model?: string;
  audio_url?: string;
  local_audio?: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function publishStatusLabel(status: PublishTaskStatus) {
  if (status === 'pending') return '排队中';
  if (status === 'running') return '发布中';
  if (status === 'succeeded') return '已提交';
  return '失败';
}

function publishPlatformLabel(platform: PublishPlatform) {
  if (platform === 'douyin') return '抖音';
  return platform;
}

function publishSourceLabel(source?: string) {
  if (source === 'manual_mock_fallback') return 'Mock fallback';
  if (source === 'manual_run_artifact' || source === 'auto_after_assemble') return 'Current run artifact';
  return 'Unknown source';
}

const LOGIN_ACCOUNT_STORAGE_KEY = 'ai-video-studio.loginAccount';
const PUBLISH_ACCOUNT_STORAGE_KEY = 'ai-video-studio.publishAccount';

function readPersistedValue(key: string, fallback = '') {
  try {
    const value = window.localStorage.getItem(key);
    return value || fallback;
  } catch {
    return fallback;
  }
}

function writePersistedValue(key: string, value: string) {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function Section({ title, icon: Icon, children, defaultOpen = false }: { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-runway-border bg-runway-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-runway-elevated/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-runway-text">
          <Icon size={16} className="text-framer-blue" />
          {title}
        </div>
        {open ? <ChevronDown size={16} className="text-runway-textMuted" /> : <ChevronRight size={16} className="text-runway-textMuted" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-runway-border/50">{children}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-runway-textMuted hover:text-framer-blue transition-colors cursor-pointer"
      title="复制"
    >
      {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function ArtifactPreviewButton({
  item,
  active,
  onClick,
  runId,
}: {
  item: ArtifactItem;
  active: boolean;
  onClick: () => void;
  runId: string;
}) {
  const isVideo = item.name.endsWith('.mp4');
  const isAudio = item.name.endsWith('.wav') || item.name.endsWith('.mp3');
  const Icon = isVideo ? Film : isAudio ? FileAudio : FileText;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
        active
          ? 'border-framer-blue/40 bg-framer-blue/5'
          : 'border-runway-border/60 bg-runway-page/60 hover:border-runway-border'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-framer-blue/10 text-framer-blue' : 'bg-runway-surface text-runway-textMuted'}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm truncate ${active ? 'text-framer-blue font-medium' : 'text-runway-text'}`} title={item.name}>
          {item.name}
        </div>
        <div className="text-[10px] text-runway-textMuted">{formatBytes(item.size)}</div>
      </div>
      {isVideo || isAudio ? (
        <Play size={14} className={active ? 'text-framer-blue' : 'text-runway-textMuted'} />
      ) : (
        <a
          href={artifactUrl(runId, item.path)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-framer-blue hover:underline"
        >
          查看
        </a>
      )}
    </button>
  );
}

export function ExportStage({
  runId,
  plan,
  pipelineStatus,
  pipelineError,
  onGoHome,
  onRefine,
}: {
  runId: string;
  plan: CreativePlan | null;
  pipelineStatus: string;
  pipelineError: string;
  onGoHome: () => void;
  onRefine: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [voiceover, setVoiceover] = useState<VoiceoverMeta | null>(null);
  const [runSummary, setRunSummary] = useState<Pick<RunSummaryResponse, 'mock_mode' | 'mock_video_source' | 'silent_video' | 'final_video'> | null>(null);
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [publishAccount, setPublishAccount] = useState(() => readPersistedValue(PUBLISH_ACCOUNT_STORAGE_KEY));
  const [publishAccounts, setPublishAccounts] = useState<string[]>([]);
  const [loadingPublishAccounts, setLoadingPublishAccounts] = useState(false);
  const [publishAccountsHint, setPublishAccountsHint] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishTagsText, setPublishTagsText] = useState('');
  const [publishTask, setPublishTask] = useState<PublishTask | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [loginAccountName, setLoginAccountName] = useState(() => readPersistedValue(LOGIN_ACCOUNT_STORAGE_KEY, 'douyin_default'));
  const [loginSession, setLoginSession] = useState<PublishLoginSession | null>(null);
  const [startingLogin, setStartingLogin] = useState(false);
  const publishPlatform: PublishPlatform = 'douyin';

  const finalVideoUrl = runId ? artifactUrl(runId, 'deliverables/final_with_voice.mp4') : '';
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState<'video' | 'audio'>('video');

  const isDone = pipelineStatus === 'completed';
  const isFailed = pipelineStatus === 'failed';
  const scenes = plan?.scenes || [];
  const planTagText = (plan?.video_style?.style_tags || []).join(',');
  const isMockMode = backendHealth?.mock_mode === 'true' || runSummary?.mock_mode === 'true';
  const mockVideoSource = backendHealth?.mock_video_source || runSummary?.mock_video_source || '';
  const mockPreviewUrl = isMockMode && mockVideoSource ? mockVideoSourceUrl() : '';
  const hasRunArtifact = Boolean(runSummary?.final_video);
  const mockFallbackAvailable = Boolean(isMockMode && mockVideoSource);
  const publishReadyMessage = hasRunArtifact
    ? 'Current run artifact is ready to publish.'
    : mockFallbackAvailable
      ? 'Mock mode will publish the local demo video.'
      : 'Real mode requires a completed export before publishing.';
  const exportedVideoName = (runSummary?.final_video || runSummary?.silent_video || finalVideoUrl || '').split(/[\\/]/).pop() || 'final_with_voice.mp4';

  useEffect(() => {
    health()
      .then((res) => setBackendHealth(res))
      .catch(() => setBackendHealth(null));
  }, []);

  useEffect(() => {
    if (previewUrl) return;
    if (mockPreviewUrl) {
      setPreviewUrl(mockPreviewUrl);
      setPreviewType('video');
      return;
    }
    if (finalVideoUrl) {
      setPreviewUrl(finalVideoUrl);
      setPreviewType('video');
    }
  }, [finalVideoUrl, mockPreviewUrl, previewUrl]);

  useEffect(() => {
    if (!runId) return;
    setLoadingSummary(true);
    getRunSummary(runId)
      .then((res) => {
        setArtifacts(res.artifacts || []);
        setVoiceover(res.voiceover || null);
        setRunSummary({
          mock_mode: res.mock_mode,
          mock_video_source: res.mock_video_source,
          silent_video: res.silent_video,
          final_video: res.final_video,
        });
        const latestTask = res.publish_tasks?.[0] || null;
        if (latestTask) {
          setShowPublishPanel(true);
          setPublishAccount((prev) => prev || latestTask.account_name || '');
          setPublishTask((prev) => {
            if (!prev) return latestTask;
            if (prev.status === 'pending' || prev.status === 'running') return prev;
            return latestTask;
          });
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoadingSummary(false));
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    setPublishTitle((prev) => prev || plan?.product?.title || 'AI 视频成片');
    setPublishTagsText((prev) => prev || planTagText);
  }, [runId, plan?.product?.title, planTagText]);

  useEffect(() => {
    setPublishDesc((prev) => prev || voiceover?.script || '');
  }, [voiceover?.script]);

  useEffect(() => {
    writePersistedValue(PUBLISH_ACCOUNT_STORAGE_KEY, publishAccount.trim());
  }, [publishAccount]);

  useEffect(() => {
    writePersistedValue(LOGIN_ACCOUNT_STORAGE_KEY, loginAccountName.trim());
  }, [loginAccountName]);

  const loadPublishAccounts = () => {
    setLoadingPublishAccounts(true);
    getPublishAccounts(publishPlatform)
      .then((res) => {
        const accounts = res.accounts || [];
        setPublishAccounts(accounts);
        setPublishAccountsHint(res.hint || '');

        if (accounts.length > 0) {
          const storedAccount = readPersistedValue(PUBLISH_ACCOUNT_STORAGE_KEY);
          setPublishAccount((prev) => {
            if (prev && accounts.includes(prev)) return prev;
            if (storedAccount && accounts.includes(storedAccount)) return storedAccount;
            if (loginSession?.status === 'succeeded' && accounts.includes(loginSession.account_name)) return loginSession.account_name;
            return accounts[0];
          });
        }

        if (!res.enabled) {
          setPublishError(res.hint || '发布功能不可用');
        } else if (accounts.length === 0) {
          setPublishError(res.hint || '未发现已登录账号，请先完成账号登录');
        } else {
          setPublishError('');
        }
      })
      .catch((err: Error) => {
        setPublishAccounts([]);
        setPublishAccountsHint('');
        setPublishError(err.message || '加载已登录账号失败');
      })
      .finally(() => setLoadingPublishAccounts(false));
  };

  useEffect(() => {
    if (!showPublishPanel) return;
    loadPublishAccounts();
  }, [showPublishPanel, loginSession?.account_name, loginSession?.status]);

  useEffect(() => {
    if (!publishTask || (publishTask.status !== 'pending' && publishTask.status !== 'running')) {
      return;
    }

    const timer = window.setInterval(() => {
      getPublishTask(publishTask.id)
        .then((res) => {
          setPublishTask(res.task);
        })
        .catch((err: Error) => {
          setPublishError(err.message || '轮询发布任务状态失败');
        });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [publishTask?.id, publishTask?.status]);

  useEffect(() => {
    if (!loginSession || (loginSession.status !== 'pending' && loginSession.status !== 'initializing' && loginSession.status !== 'waiting_scan')) {
      return;
    }

    const timer = window.setInterval(() => {
      getDouyinLoginSession(loginSession.id)
        .then((res) => {
          setLoginSession(res.session);
          if (res.session.status === 'succeeded') {
            setPublishAccount(res.session.account_name);
            setLoginAccountName(res.session.account_name);
            setPublishError('');
            loadPublishAccounts();
          }
        })
        .catch((err: Error) => {
          setPublishError(err.message || '轮询登录状态失败');
        });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [loginSession?.id, loginSession?.status]);

  const deliverables = artifacts.filter((a) => a.kind === 'deliverable');
  const renders = artifacts.filter((a) => a.kind === 'render');
  const publishRunning = publishTask?.status === 'pending' || publishTask?.status === 'running';

  const handleStartSocialPublish = async () => {
    if (!runId) {
      setPublishError('缺少 run_id，无法发起发布');
      return;
    }

    if (!hasRunArtifact && !mockFallbackAvailable) {
      setPublishError(publishReadyMessage);
      return;
    }

    const account = publishAccount.trim();
    const title = publishTitle.trim();
    if (!account) {
      setPublishError('请选择已登录账号');
      return;
    }
    if (publishAccounts.length > 0 && !publishAccounts.includes(account)) {
      setPublishError('账号不在已登录列表中，请重新选择');
      return;
    }
    if (!title) {
      setPublishError('请填写发布标题');
      return;
    }

    setPublishError('');
    setPublishing(true);
    try {
      const tags = publishTagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await publishDouyinVideo({
        run_id: runId,
        account_name: account,
        title,
        desc: publishDesc.trim(),
        tags,
      });

      setPublishTask(res.task);
      setShowPublishPanel(true);
    } catch (err: any) {
      setPublishError(err?.message || '提交发布任务失败');
    } finally {
      setPublishing(false);
    }
  };

  const handleStartLogin = async () => {
    const accountName = loginAccountName.trim() || publishAccount.trim() || 'douyin_default';

    setPublishError('');
    setStartingLogin(true);
    try {
      const res = await startDouyinLogin({ account_name: accountName, headless: false });
      setLoginSession(res.session);
      setLoginAccountName(accountName);
    } catch (err: any) {
      setPublishError(err?.message || '创建扫码登录会话失败');
    } finally {
      setStartingLogin(false);
    }
  };

  const handlePlayArtifact = (item: ArtifactItem) => {
    const url = artifactUrl(runId, item.path);
    if (item.name.endsWith('.mp4')) {
      setPreviewUrl(url);
      setPreviewType('video');
      setTimeout(() => videoRef.current?.play(), 50);
    } else if (item.name.endsWith('.wav') || item.name.endsWith('.mp3')) {
      setPreviewUrl(url);
      setPreviewType('audio');
      setTimeout(() => audioRef.current?.play(), 50);
    }
  };

  const handlePlayScene = (scene: CreativePlanScene) => {
    // Try to find corresponding render video
    const render = renders.find((r) => r.name.includes(scene.scene_id) && r.name.endsWith('.mp4'));
    if (render) {
      setPreviewUrl(artifactUrl(runId, render.path));
      setPreviewType('video');
      setTimeout(() => videoRef.current?.play(), 50);
    }
  };

  if (isFailed) {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
        <div className="p-8 rounded-2xl border border-error/20 bg-error/10 max-w-xl mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-error" />
          </div>
          <div className="text-xl font-medium mb-2 text-runway-text">生成失败</div>
          <div className="text-sm text-runway-text-muted mb-2">{pipelineError || '请检查后端日志并重试。'}</div>
        </div>
      </div>
    );
  }

  if (false) {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
        <div className="aspect-[9/16] max-w-sm w-full rounded-2xl bg-runway-surface border border-runway-border flex items-center justify-center mb-6">
          <div className="text-center">
            <Film size={40} className="mx-auto mb-3 text-runway-text-secondary" />
            <div className="text-runway-text-secondary">最终成片预览</div>
            <div className="text-xs text-runway-text-muted mt-1">渲染完成后即可预览</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-runway-text-secondary">
          <RefreshCw size={16} className="animate-spin" />
          正在合成最终视频...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col lg:flex-row">
        {/* Left: Preview player */}
        <div className="lg:w-[40%] xl:w-[38%] bg-runway-page border-b lg:border-b-0 lg:border-r border-runway-border p-6 lg:p-8 flex flex-col">
          <div className="mb-4">
            <h1 className="text-xl font-medium tracking-tight-runway">导出成片</h1>
            <p className="text-runway-slate text-xs mt-0.5">视频已生成，可以预览、下载或分发到平台。</p>
          </div>

          {/* Player area */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="aspect-[9/16] max-h-[70vh] rounded-2xl overflow-hidden bg-black border border-runway-border relative mx-auto w-full max-w-sm lg:max-w-full shadow-sm">
              {previewType === 'video' ? (
                <video
                  ref={videoRef}
                  src={previewUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-runway-surface text-runway-text p-6">
                  <div className="w-20 h-20 rounded-full bg-framer-blue/10 flex items-center justify-center mb-4">
                    <Volume2 size={36} className="text-framer-blue" />
                  </div>
                  <div className="text-sm font-medium mb-1">音频预览</div>
                  <div className="text-xs text-runway-textMuted mb-4 text-center line-clamp-1">{previewUrl.split('/').pop()}</div>
                  <audio ref={audioRef} src={previewUrl} controls className="w-full max-w-xs" />
                </div>
              )}
            </div>

            {/* Quick actions under player */}
            <div className="mt-5 grid grid-cols-2 gap-3 shrink-0">
              <a
                href={finalVideoUrl}
                download
                className="h-11 px-4 rounded-xl bg-framer-blue text-runway-text text-sm font-medium hover:bg-framer-blue/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download size={16} /> 下载成片
              </a>
              <button
                onClick={onRefine}
                className="h-11 px-4 rounded-xl border border-framer-blue/30 bg-framer-blue/5 text-runway-text text-sm font-medium hover:bg-framer-blue/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles size={16} /> 精修创意
              </button>
              <button
                onClick={() => setShowPublishPanel((prev) => !prev)}
                className="h-11 px-4 rounded-xl border border-framer-blue/30 bg-framer-blue/5 text-runway-text text-sm font-medium hover:bg-framer-blue/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                title="展开社交平台发布面板"
              >
                <SendHorizontal size={16} />
                {showPublishPanel ? '收起社交发布' : '发布到社交平台'}
              </button>
              <button
                onClick={onGoHome}
                className="h-11 px-4 rounded-xl border border-runway-border bg-runway-surface text-runway-text text-sm font-medium hover:bg-runway-elevated transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home size={16} /> 回到主页
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-runway-textMuted">
                {isDone ? <Check size={14} className="text-success" /> : <RefreshCw size={14} className="animate-spin text-warning" />}
                导出成功
              </div>
            </div>

            {showPublishPanel && (
              <div className="mt-4 rounded-xl border border-runway-border bg-runway-surface p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-runway-text">社交平台发布（首期）</div>
                  {publishTask && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] border ${
                        publishTask.status === 'succeeded'
                          ? 'text-success border-success/30 bg-success/10'
                          : publishTask.status === 'failed'
                            ? 'text-error border-error/30 bg-error/10'
                            : 'text-warning border-warning/30 bg-warning/10'
                      }`}
                    >
                      {publishStatusLabel(publishTask.status)}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-runway-textMuted">
                  首次使用请先完成抖音扫码登录，再在这里一键提交发布。
                </div>

                <div className={`text-[11px] rounded-lg border px-2 py-1.5 ${
                  hasRunArtifact
                    ? 'border-success/20 bg-success/10 text-success'
                    : mockFallbackAvailable
                      ? 'border-warning/20 bg-warning/10 text-warning'
                      : 'border-error/20 bg-error/10 text-error'
                }`}>
                  {publishReadyMessage}
                </div>

                <div className="rounded-lg border border-runway-border/70 bg-runway-page/50 p-2.5 space-y-2">
                  <div className="text-[11px] font-medium text-runway-text">抖音扫码登录</div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={loginAccountName}
                      onChange={(e) => setLoginAccountName(e.target.value)}
                      placeholder="输入账号标识（默认 douyin_default）"
                      className="w-full h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                    />
                    <button
                      onClick={handleStartLogin}
                      disabled={startingLogin}
                      className={`h-9 w-full px-3 rounded-lg text-xs font-medium transition-colors ${
                        startingLogin
                          ? 'bg-runway-elevated text-runway-textMuted cursor-not-allowed'
                          : 'bg-framer-blue text-runway-text hover:bg-framer-blue/90 cursor-pointer'
                      }`}
                    >
                      {startingLogin ? '创建中...' : '开始扫码'}
                    </button>
                  </div>

                  {loginSession && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-runway-textMuted">
                        登录会话：{loginSession.account_name} · {loginSession.message}
                      </div>
                      {loginSession.qrcode?.image_data_url && loginSession.status === 'waiting_scan' && (
                        <div className="flex items-start gap-3 rounded-lg border border-runway-border/70 bg-runway-surface p-2">
                          <img
                            src={loginSession.qrcode.image_data_url}
                            alt="抖音扫码二维码"
                            className="w-24 h-24 rounded border border-runway-border bg-white object-contain"
                          />
                          <div className="text-[11px] text-runway-textMuted leading-5">
                            请使用抖音 App 扫码。
                            <br />
                            扫码成功后会自动刷新账号列表。
                            {loginSession.qrcode?.verification_url && (
                              <>
                                <br />
                                <button
                                  type="button"
                                  onClick={() => window.open(loginSession.qrcode?.verification_url || '', '_blank', 'noopener,noreferrer')}
                                  className="mt-2 inline-flex items-center rounded-md border border-runway-border px-2 py-1 text-[11px] font-medium text-runway-text transition-colors hover:border-framer-blue hover:text-framer-blue"
                                >
                                  打开验证网页
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={publishPlatform}
                    disabled
                    className="w-full h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none"
                  >
                    <option value={publishPlatform}>{publishPlatformLabel(publishPlatform)}</option>
                  </select>

                  <select
                    value={publishAccount}
                    onChange={(e) => setPublishAccount(e.target.value)}
                    disabled={loadingPublishAccounts}
                    className="w-full h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                  >
                    <option value="">{loadingPublishAccounts ? '正在加载账号...' : '选择已登录账号'}</option>
                    {publishAccounts.map((account) => (
                      <option key={account} value={account}>
                        {account}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-runway-textMuted">
                    {publishAccountsHint || `已发现 ${publishAccounts.length} 个可用账号`}
                  </div>
                  <button
                    onClick={loadPublishAccounts}
                    disabled={loadingPublishAccounts}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                      loadingPublishAccounts
                        ? 'border-runway-border text-runway-textMuted cursor-not-allowed'
                        : 'border-framer-blue/30 text-framer-blue hover:bg-framer-blue/10 cursor-pointer'
                    }`}
                  >
                    {loadingPublishAccounts ? '刷新中...' : '刷新账号'}
                  </button>
                </div>

                <input
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="发布标题"
                  className="w-full h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                />

                <textarea
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder="视频描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none focus:border-framer-blue resize-y"
                />

                <input
                  value={publishTagsText}
                  onChange={(e) => setPublishTagsText(e.target.value)}
                  placeholder="标签（逗号分隔）"
                  className="w-full h-9 px-3 rounded-lg border border-runway-border bg-runway-page text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                />

                <button
                  onClick={handleStartSocialPublish}
                  disabled={publishing || publishRunning}
                  className={`w-full h-9 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    publishing || publishRunning
                      ? 'bg-runway-elevated text-runway-textMuted cursor-not-allowed'
                      : 'bg-framer-blue text-runway-text hover:bg-framer-blue/90 cursor-pointer'
                  }`}
                >
                  {publishing || publishRunning ? <RefreshCw size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                  {publishing || publishRunning ? '提交中...' : '一键发布到社交平台'}
                </button>

                {publishError && (
                  <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg px-2 py-1.5">{publishError}</div>
                )}

                {publishTask && (
                  <div className="text-[11px] text-runway-textMuted rounded-lg border border-runway-border/60 bg-runway-page/60 px-2 py-1.5 space-y-1">
                    <div>任务 ID：{publishTask.id}</div>
                    <div>状态说明：{publishTask.message}</div>
                    <div>Source: {publishSourceLabel(publishTask.source)}</div>
                    {publishTask.stderr && (
                      <pre className="text-[10px] whitespace-pre-wrap break-all text-error bg-error/5 border border-error/15 rounded p-1.5">
                        {publishTask.stderr}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Details */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-3xl mx-auto space-y-5">
            {loadingSummary && (
              <div className="text-center text-xs text-runway-textMuted py-2">
                <RefreshCw size={14} className="inline-block animate-spin mr-1" />
                加载产物详情...
              </div>
            )}

            {/* Planning + mock info */}
            <Section title="素材规划与 Mock 信息" icon={Sparkles} defaultOpen>
              <div className="pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-runway-border/60 bg-runway-page/60 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-runway-text">素材规划摘要</div>
                      <span className="px-2 py-0.5 rounded text-[10px] border border-framer-blue/30 bg-framer-blue/10 text-framer-blue">
                        {plan ? '已生成' : '未生成'}
                      </span>
                    </div>
                    {plan ? (
                      <div className="space-y-1.5 text-xs text-runway-textMuted">
                        <div>商品：<span className="text-runway-text">{plan.product?.title || '未命名'}</span></div>
                        <div>受众：<span className="text-runway-text">{plan.creative_direction?.audience || '未填写'}</span></div>
                        <div>钩子：<span className="text-runway-text">{plan.creative_direction?.hook || '未填写'}</span></div>
                        <div>CTA：<span className="text-runway-text">{plan.creative_direction?.cta || '未填写'}</span></div>
                        <div>风格标签：<span className="text-runway-text">{(plan.video_style?.style_tags || []).join(' / ') || '未填写'}</span></div>
                        <div>时长 / 镜头：<span className="text-runway-text">{plan.video_style?.duration_seconds || 0}s / {plan.scenes?.length || 0} 镜</span></div>
                        {plan.material_analysis?.subject_summary && (
                          <div className="pt-1 text-[11px] leading-5 text-runway-textMuted">
                            {plan.material_analysis.subject_summary}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-runway-textMuted">暂无规划信息，请先完成素材规划。</div>
                    )}
                  </div>

                  <div className="rounded-xl border border-runway-border/60 bg-runway-page/60 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-runway-text">Mock 导出信息</div>
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${isMockMode ? 'border-warning/30 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'}`}>
                        {isMockMode ? 'Mock 模式' : '真实模式'}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-runway-textMuted">
                      <div>演示源视频：</div>
                      <div className="flex items-start justify-between gap-2 rounded-lg border border-runway-border/50 bg-runway-surface px-3 py-2">
                        <span className="font-mono text-[11px] leading-5 break-all text-runway-text">{mockVideoSource || '未配置（将使用默认 mock 素材）'}</span>
                        {mockVideoSource && <CopyButton text={mockVideoSource} />}
                      </div>
                      <div>导出文件：<span className="text-runway-text">{exportedVideoName}</span></div>
                      <div>发布目标：<span className="text-runway-text">抖音</span></div>
                      <div className="pt-1 text-[11px] leading-5 text-runway-textMuted">
                        当前 mock 会把演示素材复制到本次 run 的导出目录，再从导出的成片提交到抖音。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Artifacts */}
            <Section title="产物文件" icon={FileText} defaultOpen>
              <div className="pt-4">
                {deliverables.length === 0 && renders.length === 0 ? (
                  <div className="text-sm text-runway-textMuted">暂无文件记录</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {deliverables.map((a) => (
                      <ArtifactPreviewButton
                        key={a.path}
                        item={a}
                        runId={runId}
                        active={previewUrl === artifactUrl(runId, a.path)}
                        onClick={() => handlePlayArtifact(a)}
                      />
                    ))}
                    {renders.map((a) => (
                      <ArtifactPreviewButton
                        key={a.path}
                        item={a}
                        runId={runId}
                        active={previewUrl === artifactUrl(runId, a.path)}
                        onClick={() => handlePlayArtifact(a)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Voiceover */}
            <Section title="语音文案" icon={Mic}>
              <div className="pt-4">
                {voiceover?.script ? (
                  <div className="rounded-xl border border-runway-border/60 bg-runway-page/60 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-xs text-runway-textMuted">
                        配音：{voiceover.voice || '未知'} · 模型：{voiceover.tts_model || '未知'}
                      </div>
                      <CopyButton text={voiceover.script} />
                    </div>
                    <p className="text-sm text-runway-text leading-relaxed whitespace-pre-wrap">{voiceover.script}</p>
                  </div>
                ) : (
                  <div className="text-sm text-runway-textMuted">暂无语音文案记录</div>
                )}
              </div>
            </Section>

            {/* Scenes with reference images */}
            <Section title="分镜与 Prompt" icon={Clapperboard}>
              <div className="pt-4 space-y-3">
                {scenes.length === 0 ? (
                  <div className="text-sm text-runway-textMuted">暂无分镜数据</div>
                ) : (
                  scenes.map((scene, idx) => {
                    const hasRender = renders.some((r) => r.name.includes(scene.scene_id) && r.name.endsWith('.mp4'));
                    return (
                      <div
                        key={scene.scene_id}
                        className={`rounded-xl border border-runway-border/60 bg-runway-page/60 p-3 flex gap-3 ${hasRender ? 'cursor-pointer hover:border-framer-blue/30 transition-colors' : ''}`}
                        onClick={() => hasRender && handlePlayScene(scene)}
                        title={hasRender ? '点击预览该分镜视频' : undefined}
                      >
                        {/* Reference thumbnail */}
                        <div className="shrink-0 w-24 h-32 rounded-lg bg-runway-surface border border-runway-border/50 overflow-hidden relative">
                          {scene.reference_image ? (
                            <img
                              src={artifactUrl(runId, scene.reference_image)}
                              alt={scene.reference_image}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-runway-textMuted">
                              <ImageIcon size={20} />
                            </div>
                          )}
                          {hasRender && (
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <Play size={14} className="ml-0.5 text-black" />
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">
                            {scene.duration_seconds}s
                          </div>
                        </div>

                        {/* Scene info */}
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="text-sm font-medium text-runway-text truncate">
                              镜头 {idx + 1} · {scene.shot_goal || scene.scene_id}
                            </div>
                          </div>
                          <div className="text-xs text-runway-textMuted mb-2 truncate">参考图：{scene.reference_image}</div>

                          {scene.wan_prompt && (
                            <div className="mb-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-wide text-runway-textMuted">Wan Prompt</span>
                                <CopyButton text={scene.wan_prompt} />
                              </div>
                              <p className="text-xs text-runway-text leading-relaxed mt-0.5 line-clamp-3">{scene.wan_prompt}</p>
                            </div>
                          )}

                          {scene.negative_prompt && (
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-wide text-runway-textMuted">Negative Prompt</span>
                                <CopyButton text={scene.negative_prompt} />
                              </div>
                              <p className="text-xs text-runway-textMuted leading-relaxed mt-0.5 line-clamp-2">{scene.negative_prompt}</p>
                            </div>
                          )}

                          {scene.overlay_text && (
                            <div className="flex flex-wrap gap-2 pt-2">
                              {scene.overlay_text.headline && (
                                <span className="px-2 py-1 rounded-md bg-framer-blue/10 text-framer-blue text-[10px]">
                                  {scene.overlay_text.headline}
                                </span>
                              )}
                              {scene.overlay_text.subline && (
                                <span className="px-2 py-1 rounded-md bg-success/10 text-success text-[10px]">
                                  {scene.overlay_text.subline}
                                </span>
                              )}
                              {scene.overlay_text.price_tag && (
                                <span className="px-2 py-1 rounded-md bg-warning/10 text-warning text-[10px]">
                                  {scene.overlay_text.price_tag}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
