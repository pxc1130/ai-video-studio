import { CheckCircle2, Loader2, Home } from 'lucide-react';

interface StepDef {
  key: string;
  label: string;
  sub: string;
}

interface ParallelStepDef {
  key: 'parallel';
  label: string;
  branches: [StepDef, StepDef];
}

const STEPS: (StepDef | ParallelStepDef)[] = [
  { key: 'analyzing', label: '分析商品素材与卖点', sub: '提取视觉特征与核心受众画像' },
  { key: 'concepting', label: '构思创意方向与分镜脚本', sub: '编排镜头语言与口播叙事节奏' },
  {
    key: 'parallel',
    label: '并行创作中',
    branches: [
      { key: 'rendering', label: '渲染视觉画面', sub: '将创意转化为动态影像片段' },
      { key: 'voicing', label: '生成配音与氛围音乐', sub: '合成贴合场景的声画体验' },
    ],
  },
  { key: 'exporting', label: '合成与导出成片', sub: '混音、剪辑并输出最终视频' },
];

const STATUS_MAP: Record<string, number> = {
  idle: -1,
  uploaded: 0,
  planning: 1,
  planned: 1,
  rendering_scenes: 2,
  scenes_done: 2,
  generating_voice: 2,
  voice_done: 2,
  assembling: 3,
  completed: 4,
};

function BranchIndicator({ status, branchKey }: { status: string; branchKey: 'rendering' | 'voicing' }) {
  const isRender = branchKey === 'rendering';
  const isDone = isRender
    ? ['scenes_done', 'generating_voice', 'voice_done', 'assembling', 'completed'].includes(status)
    : ['voice_done', 'assembling', 'completed'].includes(status);
  const isActive = isRender
    ? status === 'rendering_scenes'
    : ['generating_voice', 'voice_done'].includes(status);

  if (isDone) {
    return <CheckCircle2 size={18} className="text-success" />;
  }
  if (isActive) {
    return (
      <div className="relative">
        <div className="w-[18px] h-[18px] rounded-full bg-framer-blue" />
        <div className="absolute inset-0 w-[18px] h-[18px] rounded-full bg-framer-blue animate-ping opacity-40" />
      </div>
    );
  }
  return <div className="w-[18px] h-[18px] rounded-full border-2 border-runway-borderStrong" />;
}

export function FastModeProgress({ status, onGoHome }: { status: string; onGoHome: () => void }) {
  const activeIndex = STATUS_MAP[status] ?? -1;
  const totalVisualSteps = STEPS.length; // 4

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-runway-page/90 backdrop-blur-sm p-6">
      <div className="w-full max-w-md rounded-3xl border border-runway-border bg-runway-surface p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-framer-blue/10 text-framer-blue mb-4">
            <Loader2 size={28} className="animate-spin" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">AI 正在创作视频</h2>
          <p className="text-sm text-runway-textSecondary mt-1">请稍候，系统正在自动完成全流程</p>
        </div>

        <div className="space-y-5">
          {STEPS.map((step, idx) => {
            const isDone = idx < activeIndex;
            const isActive = idx === activeIndex;

            if ('branches' in step) {
              const branches = step.branches;
              return (
                <div key={step.key} className="rounded-xl border border-runway-border/40 bg-runway-page/40 p-3">
                  <div className="text-xs font-medium text-runway-textMuted mb-2 px-1">{step.label}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {branches.map((branch) => {
                      const bDone = branch.key === 'rendering'
                        ? ['scenes_done', 'generating_voice', 'voice_done', 'assembling', 'completed'].includes(status)
                        : ['voice_done', 'assembling', 'completed'].includes(status);
                      const bActive = branch.key === 'rendering'
                        ? status === 'rendering_scenes'
                        : ['generating_voice', 'voice_done'].includes(status);
                      return (
                        <div key={branch.key} className="flex items-start gap-2">
                          <div className="mt-0.5">
                            <BranchIndicator status={status} branchKey={branch.key as 'rendering' | 'voicing'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium transition-colors ${bActive ? 'text-runway-text' : bDone ? 'text-runway-text' : 'text-runway-textMuted'}`}>
                              {branch.label}
                            </div>
                            <div className={`text-[10px] mt-0.5 transition-colors ${bActive ? 'text-runway-textSecondary' : 'text-runway-textMuted'}`}>
                              {branch.sub}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            } else {
              const s = step as { key: string; label: string; sub: string };
              return (
              <div key={s.key} className="flex items-start gap-4">
                <div className="mt-0.5">
                  {isDone ? (
                    <CheckCircle2 size={20} className="text-success" />
                  ) : isActive ? (
                    <div className="relative">
                      <div className="w-5 h-5 rounded-full bg-framer-blue" />
                      <div className="absolute inset-0 w-5 h-5 rounded-full bg-framer-blue animate-ping opacity-40" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-runway-borderStrong" />
                  )}
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-medium transition-colors ${isActive ? 'text-runway-text' : isDone ? 'text-runway-text' : 'text-runway-textMuted'}`}>
                    {s.label}
                  </div>
                  <div className={`text-xs mt-0.5 transition-colors ${isActive ? 'text-runway-textSecondary' : 'text-runway-textMuted'}`}>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1">
                        {s.sub}
                        <span className="inline-flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-runway-textSecondary animate-bounce" />
                          <span className="w-1 h-1 rounded-full bg-runway-textSecondary animate-bounce [animation-delay:120ms]" />
                          <span className="w-1 h-1 rounded-full bg-runway-textSecondary animate-bounce [animation-delay:240ms]" />
                        </span>
                      </span>
                    ) : (
                      s.sub
                    )}
                  </div>
                </div>
              </div>
            );
            }
          })}
        </div>

        {activeIndex >= 0 && activeIndex < totalVisualSteps && (
          <div className="mt-8 pt-6 border-t border-runway-border">
            <div className="text-sm text-runway-text text-center mb-3">
              AI 正在后台创作，你可以回到主页等待加载完毕
            </div>
            <button
              onClick={onGoHome}
              className="w-full h-11 rounded-xl border border-runway-border bg-runway-surface text-runway-text text-sm font-medium hover:bg-runway-elevated transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home size={16} /> 回到主页
            </button>
          </div>
        )}

        {activeIndex >= totalVisualSteps && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 text-success text-sm font-medium">
              <CheckCircle2 size={16} />
              成片已生成
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
