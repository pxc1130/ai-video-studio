import { useState, useEffect } from 'react';
import type { Stage, Shot, CopyAsset, VoiceAsset, WorkflowMode, CreativePlan, ProjectRun } from './types';
import { INITIAL_SHOTS, INITIAL_COPY, INITIAL_VOICE } from './data/mock';
import { planToFrontendState } from './utils/helpers';
import { StepBar } from './components/StepBar';
import { Home } from './components/Home';
import { UploadStage } from './components/stages/UploadStage';
import { ProposalStage } from './components/stages/ProposalStage';
import { AlignStage } from './components/stages/AlignStage';
import { ExportStage } from './components/stages/ExportStage';
import { FastModeProgress } from './components/FastModeProgress';
import { BatchList } from './components/BatchList';
import * as api from './api/client';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'upload', label: '素材规划' },
  { key: 'proposal', label: '创意方案' },
  { key: 'align', label: '音画对齐' },
  { key: 'export', label: '导出成片' },
];

const RUNS_STORAGE_KEY = 'ai_video_studio_runs_v1';

export default function App() {
  const [view, setView] = useState<'home' | 'studio' | 'batch'>('home');
  const [stageIndex, setStageIndex] = useState(0);
  const currentStage = STAGES[stageIndex].key;
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved || 'light');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // Workflow mode
  const [mode, setMode] = useState<WorkflowMode>('standard');

  // Product / run state
  const [runId, setRunId] = useState<string>('');
  const [plan, setPlan] = useState<CreativePlan | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>('idle');
  const [pipelineError, setPipelineError] = useState<string>('');

  // Frontend stage states
  const [shots, setShots] = useState<Shot[]>(INITIAL_SHOTS);
  const [copyAsset, setCopyAsset] = useState<CopyAsset>(INITIAL_COPY);
  const [voiceAsset, setVoiceAsset] = useState<VoiceAsset>(INITIAL_VOICE);

  // Dashboard runs
  const [runs, setRuns] = useState<ProjectRun[]>(() => {
    try {
      const raw = localStorage.getItem(RUNS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
  }, [runs]);

  const updateRunStatus = (id: string, status: string) => {
    setRuns(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
  };

  const nextStage = () => setStageIndex(i => Math.min(i + 1, STAGES.length - 1));

  const goHome = () => {
    setView('home');
  };

  const goBatchList = () => {
    setView('batch');
  };

  const startNewProject = () => {
    setStageIndex(0);
    setRunId('');
    setPlan(null);
    setPipelineStatus('idle');
    setPipelineError('');
    setShots(INITIAL_SHOTS);
    setCopyAsset(INITIAL_COPY);
    setVoiceAsset(INITIAL_VOICE);
    setMode('standard');
    setView('studio');
  };

  const openRun = (_run: ProjectRun) => {
    // For now, entering studio always loads the current backend run.
    // We set the UI title from the selected run for a better experience.
    setView('studio');
    // Try to sync with backend current run if possible
    api.getCurrentRun().then((res: any) => {
      if (res.run_id) {
        setRunId(res.run_id);
        setPipelineStatus(res.status || 'idle');
        if (res.plan) {
          setPlan(res.plan as CreativePlan);
          const frontend = planToFrontendState(res.plan as CreativePlan, res.run_id);
          setShots(frontend.shots);
          setCopyAsset(frontend.copyAsset);
          setVoiceAsset(frontend.voiceAsset);
        }
        // Map backend status to stage
        if (res.status === 'completed' || res.status === 'failed') {
          setStageIndex(3);
        } else if (['planned', 'rendering_scenes', 'scenes_done', 'generating_voice', 'voice_done', 'assembling'].includes(res.status)) {
          setStageIndex(2); // align / export pipeline
        } else if (res.status === 'uploaded') {
          setStageIndex(1); // proposal
        } else {
          setStageIndex(0);
        }
      }
    }).catch(() => {
      // ignore sync errors
    });
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Fast mode: auto-run the entire pipeline
  const runFastPipeline = async (category: string, runTitle: string) => {
    const newRun: ProjectRun = {
      id: runId || Date.now().toString(),
      title: runTitle,
      status: 'planning',
      createdAt: new Date().toISOString(),
      mode: 'fast',
    };
    setRuns(prev => [newRun, ...prev.filter(r => r.id !== newRun.id)]);

    setPipelineStatus('planning');
    setPipelineError('');
    try {
      const planRes = await api.planPipeline({ scene_count: 3, scene_duration: 3, category });
      await delay(1500);
      const p = planRes.plan as CreativePlan;
      setPlan(p);
      setRunId(planRes.run_id);
      const frontend = planToFrontendState(p, planRes.run_id);
      setShots(frontend.shots);
      setCopyAsset(frontend.copyAsset);
      setVoiceAsset(frontend.voiceAsset);
      updateRunStatus(newRun.id, 'rendering_scenes');

      setPipelineStatus('rendering_scenes');
      await Promise.all([
        api.startRenderScenes().then(() => delay(800)),
        api.startVoiceBranch().then(() => delay(800)),
      ]);
      updateRunStatus(newRun.id, 'assembling');

      setPipelineStatus('assembling');
      await api.assembleVideo();
      await delay(1200);
      updateRunStatus(newRun.id, 'completed');

      setRunId(planRes.run_id);
      setPipelineStatus('completed');
      await delay(600);
      setStageIndex(3); // Jump to export
    } catch (err: any) {
      setPipelineStatus('failed');
      updateRunStatus(newRun.id, 'failed');
      setPipelineError(err.message || 'Pipeline failed');
    }
  };

  // Standard mode: run planning only, then let user review
  const runPlanning = async (category: string, runTitle: string) => {
    const newRun: ProjectRun = {
      id: runId || Date.now().toString(),
      title: runTitle,
      status: 'planning',
      createdAt: new Date().toISOString(),
      mode: 'standard',
    };
    setRuns(prev => [newRun, ...prev.filter(r => r.id !== newRun.id)]);

    setPipelineStatus('planning');
    setPipelineError('');
    try {
      const res = await api.planPipeline({ scene_count: 3, scene_duration: 3, category });
      const p = res.plan as CreativePlan;
      setPlan(p);
      setRunId(res.run_id);
      const frontend = planToFrontendState(p, res.run_id);
      setShots(frontend.shots);
      setCopyAsset(frontend.copyAsset);
      setVoiceAsset(frontend.voiceAsset);
      setPipelineStatus('planned');
      updateRunStatus(newRun.id, 'planned');
      nextStage();
    } catch (err: any) {
      setPipelineStatus('failed');
      updateRunStatus(newRun.id, 'failed');
      setPipelineError(err.message || 'Planning failed');
    }
  };

  const startExportPipeline = async () => {
    setPipelineStatus('rendering_scenes');
    setPipelineError('');
    let resolvedRunId = runId;
    try {
      const renderRes = await api.startRenderScenes();
      if (renderRes?.run_id) {
        resolvedRunId = renderRes.run_id;
        setRunId(renderRes.run_id);
      }
      setPipelineStatus('generating_voice');
      const voiceRes = await api.startVoiceBranch();
      if (voiceRes?.run_id) {
        resolvedRunId = voiceRes.run_id;
        setRunId(voiceRes.run_id);
      }
      setPipelineStatus('assembling');
      const assembleRes = await api.assembleVideo();
      if (assembleRes?.run_id) {
        resolvedRunId = assembleRes.run_id;
        setRunId(assembleRes.run_id);
      }
      setPipelineStatus('completed');
      if (resolvedRunId) updateRunStatus(resolvedRunId, 'completed');
      nextStage();
    } catch (err: any) {
      setPipelineStatus('failed');
      if (resolvedRunId) updateRunStatus(resolvedRunId, 'failed');
      setPipelineError(err.message || 'Export failed');
    }
  };

  if (view === 'home') {
    return (
      <Home
        runs={runs}
        onNewProject={startNewProject}
        onOpenRun={openRun}
        onGoBatchList={goBatchList}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  if (view === 'batch') {
    return (
      <BatchList onBack={() => setView('home')} />
    );
  }

  return (
    <div className="h-full flex flex-col bg-runway-page text-runway-text">
      <StepBar currentStep={stageIndex} onChangeStep={setStageIndex} stages={STAGES} theme={theme} toggleTheme={toggleTheme} onGoHome={goHome} />

      {currentStage === 'upload' && (
        <UploadStage
          onNext={nextStage}
          mode={mode}
          setMode={setMode}
          onImport={async (formData) => {
            const res = await api.importProduct(formData);
            setRunId(res.run_id);
            const category = (formData.get('category') as string) || 'default';
            const title = (formData.get('productName') as string) || '未命名项目';
            if (mode === 'fast') {
              await runFastPipeline(category, title);
            } else {
              await runPlanning(category, title);
            }
          }}
          pipelineStatus={pipelineStatus}
          pipelineError={pipelineError}
        />
      )}

      {currentStage === 'proposal' && (
        <ProposalStage
          shots={shots}
          copyAsset={copyAsset}
          voiceAsset={voiceAsset}
          onNext={nextStage}
          setShots={setShots}
          setCopyAsset={setCopyAsset}
          setVoiceAsset={setVoiceAsset}
          plan={plan}
        />
      )}

      {currentStage === 'align' && (
        <AlignStage
          shots={shots}
          voiceAsset={voiceAsset}
          onNext={startExportPipeline}
          setVoiceAsset={setVoiceAsset}
          pipelineStatus={pipelineStatus}
        />
      )}

      {currentStage === 'export' && (
        <ExportStage
          runId={runId}
          plan={plan}
          pipelineStatus={pipelineStatus}
          pipelineError={pipelineError}
          onGoHome={goHome}
          onRefine={() => setStageIndex(1)}
        />
      )}

      {mode === 'fast' && pipelineStatus !== 'idle' && pipelineStatus !== 'failed' && pipelineStatus !== 'completed' && (
        <FastModeProgress status={pipelineStatus} onGoHome={goHome} />
      )}
    </div>
  );
}
