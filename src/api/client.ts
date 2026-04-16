import type {
  HealthResponse,
  PublishAccountsResponse,
  PublishDouyinRequest,
  PublishLoginSession,
  PublishPlatform,
  PublishTask,
  RunSummaryResponse,
  StartDouyinLoginRequest,
} from '../types';

const API_BASE = 'http://127.0.0.1:8000';

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function importProduct(formData: FormData) {
  return fetchJson('/api/products/import', { method: 'POST', body: formData });
}

export async function planPipeline(params: { scene_count?: number; scene_duration?: number; category?: string; prompt_name?: string; system_instruction?: string; run_feedback?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.scene_count) qs.set('scene_count', String(params.scene_count));
  if (params.scene_duration) qs.set('scene_duration', String(params.scene_duration));
  if (params.category) qs.set('category', params.category);
  if (params.prompt_name) qs.set('prompt_name', params.prompt_name);
  if (params.system_instruction) qs.set('system_instruction', params.system_instruction);
  if (params.run_feedback) qs.set('run_feedback', params.run_feedback);
  return fetchJson(`/api/pipeline/plan?${qs.toString()}`, { method: 'POST' });
}

export async function getCurrentRun() {
  return fetchJson('/api/run/current');
}

export async function startRenderScenes() {
  return fetchJson('/api/pipeline/render-scenes/start', { method: 'POST' });
}

export async function startVoiceBranch() {
  return fetchJson('/api/pipeline/voice-branch/start', { method: 'POST' });
}

export async function assembleVideo() {
  return fetchJson('/api/pipeline/assemble', { method: 'POST' });
}

export async function health() {
  return fetchJson('/api/health') as Promise<HealthResponse>;
}

export async function getRunSummary(runId: string) {
  return fetchJson(`/api/run/summary?run_id=${encodeURIComponent(runId)}`) as Promise<RunSummaryResponse>;
}

export async function uploadBatch(formData: FormData) {
  return fetchJson('/api/batch/upload', { method: 'POST', body: formData }) as Promise<{ status: string; batch_id: string; item_count: number }>;
}

// Note: when constructing FormData, use field name 'spreadsheet' for the CSV/Excel file.

export async function listBatches(limit = 50) {
  return fetchJson(`/api/batch/list?limit=${limit}`) as Promise<{ status: string; batches: any[] }>;
}

export async function getBatchStatus(batchId: string) {
  return fetchJson(`/api/batch/${batchId}/status`) as Promise<{ status: string; batch: any; items: any[] }>;
}

export async function publishDouyinVideo(payload: PublishDouyinRequest) {
  return fetchJson('/api/publish/douyin/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as Promise<{ status: string; task: PublishTask }>;
}

export async function getPublishTask(taskId: string) {
  return fetchJson(`/api/publish/tasks/${encodeURIComponent(taskId)}`) as Promise<{ status: string; task: PublishTask }>;
}

export async function getPublishAccounts(platform: PublishPlatform = 'douyin') {
  return fetchJson(`/api/publish/accounts?platform=${encodeURIComponent(platform)}`) as Promise<PublishAccountsResponse>;
}

export async function startDouyinLogin(payload: StartDouyinLoginRequest) {
  return fetchJson('/api/publish/douyin/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as Promise<{ status: string; session: PublishLoginSession }>;
}

export async function getDouyinLoginSession(sessionId: string) {
  return fetchJson(`/api/publish/douyin/login/sessions/${encodeURIComponent(sessionId)}`) as Promise<{
    status: string;
    session: PublishLoginSession;
  }>;
}

export function batchDownloadUrl(batchId: string) {
  return `${API_BASE}/api/batch/${batchId}/download`;
}

export function artifactUrl(runId: string, path: string) {
  return `${API_BASE}/api/artifacts/${runId}/${path}`;
}

export function mockVideoSourceUrl() {
  return `${API_BASE}/api/mock-video-source`;
}
