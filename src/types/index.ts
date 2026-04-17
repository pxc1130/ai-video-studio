export type Status = 'pending' | 'generating' | 'review' | 'approved';

export type Stage = 'upload' | 'proposal' | 'align' | 'export';

export type WorkflowMode = 'standard' | 'fast';

export interface GenerationRecord {
  id: string;
  prompt: string;
  timestamp: string;
  status: Status;
}

export interface Shot {
  id: string;
  index: number;
  currentPrompt: string;
  duration: number;
  model: string;
  status: Status;
  history: GenerationRecord[];
  coverUrl?: string;
  // Backend fields (optional, populated from creative plan)
  referenceImage?: string;
  shotGoal?: string;
  cameraLanguage?: string;
  wanPrompt?: string;
  negativePrompt?: string;
  overlayText?: {
    headline: string;
    subline: string;
    priceTag: string;
  };
  energy?: string;
}

export interface CopyAsset {
  status: Status;
  finalText: string;
  generationPrompt: string;
  baseContext: string;
  history: GenerationRecord[];
}

export interface VoiceAsset {
  status: Status;
  voiceName: string;
  availableVoices: string[];
  duration: number;
}

export interface VoiceClip {
  id: string;
  voiceName: string;
  start: number;
  duration: number;
}

export interface BgmClip {
  id: string;
  name: string;
  start: number;
  duration: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Backend API Types
// ---------------------------------------------------------------------------

export interface CreativePlanProduct {
  product_id: string;
  title: string;
  price: string;
  original_price?: string;
  sales?: string;
  shop_name?: string;
  brand?: string;
  facts?: string[];
}

export interface CreativePlanMaterialAnalysis {
  subject_summary: string;
  core_selling_points: string[];
  image_role_map: { image: string; role: string; reason: string; priority: number }[];
  scene_strategy: { scene_focus: string; recommended_image: string; reason: string }[];
}

export interface CreativePlanDirection {
  audience: string;
  tone: string;
  hook: string;
  core_message: string;
  cta: string;
}

export interface CreativePlanCompliance {
  allowed_claims: string[];
  forbidden_claims: string[];
  review_summary: string;
}

export interface CreativePlanVideoStyle {
  aspect_ratio: string;
  duration_seconds: number;
  style_tags: string[];
  music_direction: string;
  subtitle_style?: string;
  transition_style?: string;
}

export interface CreativePlanScene {
  scene_id: string;
  reference_image: string;
  duration_seconds: number;
  shot_goal: string;
  camera_language: string;
  wan_prompt: string;
  negative_prompt: string;
  overlay_text: {
    headline: string;
    subline: string;
    price_tag: string;
  };
  energy: string;
}

export interface CreativePlan {
  product: CreativePlanProduct;
  material_analysis: CreativePlanMaterialAnalysis;
  creative_direction: CreativePlanDirection;
  compliance: CreativePlanCompliance;
  video_style: CreativePlanVideoStyle;
  scenes: CreativePlanScene[];
}

export interface PipelineRun {
  run_id: string;
  status: string;
  product_dir: string;
  plan?: CreativePlan;
  logs: { time: string; step: string; detail: string }[];
}

// For Home dashboard
export interface ProjectRun {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  mode: WorkflowMode;
  coverUrl?: string;
}

export type PublishPlatform = 'douyin';

export type PublishTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface PublishTask {
  id: string;
  platform: PublishPlatform;
  status: PublishTaskStatus;
  run_id: string;
  account_name: string;
  source?: string;
  title: string;
  desc: string;
  tags: string[];
  video_path: string;
  message: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  command?: string[];
}

export interface PublishDouyinRequest {
  run_id: string;
  account_name: string;
  title: string;
  desc?: string;
  tags?: string[];
}

export interface PublishAccountsResponse {
  status: string;
  platform: PublishPlatform;
  enabled: boolean;
  accounts: string[];
  hint?: string;
}

export interface HealthResponse {
  status: string;
  mock_mode: string;
  mock_video_source?: string | null;
  model?: string;
}

export interface RunSummaryResponse {
  status: string;
  run_id: string;
  plan: CreativePlan;
  voiceover: { script?: string; voice?: string; tts_model?: string; audio_url?: string; local_audio?: string };
  artifacts: { name: string; kind: string; path: string; size: number }[];
  publish_tasks?: PublishTask[];
  mock_mode?: string;
  mock_video_source?: string | null;
  silent_video?: string | null;
  final_video?: string | null;
}

export type PublishLoginSessionStatus = 'pending' | 'initializing' | 'waiting_scan' | 'succeeded' | 'failed';

export interface PublishLoginSession {
  id: string;
  platform: PublishPlatform;
  account_name: string;
  status: PublishLoginSessionStatus;
  message: string;
  qrcode?: {
    image_path?: string;
    image_data_url?: string;
    content?: string | null;
    verification_url?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface StartDouyinLoginRequest {
  account_name?: string;
  headless?: boolean;
  force_scan?: boolean;
  keep_browser_open_seconds?: number;
}
