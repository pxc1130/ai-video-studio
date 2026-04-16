import React from 'react';
import { Clock, RefreshCw, AlertCircle, Check } from 'lucide-react';
import type { Status, CreativePlan, Shot, CopyAsset, VoiceAsset } from '../types';

// ============================================================
// Helpers
// ============================================================
export const statusBadge = (status: Status) => {
  const map: Record<Status, { text: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending:   { text: '待生成',   color: 'text-runway-text',  bg: 'bg-runway-page border-runway-text',               icon: <Clock size={12} /> },
    generating:{ text: '生成中',   color: 'text-framer-blue',  bg: 'bg-runway-page border-framer-blue',               icon: <RefreshCw size={12} className="animate-spin" /> },
    review:    { text: '待确认',   color: 'text-warning',      bg: 'bg-runway-page border-warning',                   icon: <AlertCircle size={12} /> },
    approved:  { text: '已通过',   color: 'text-success',      bg: 'bg-runway-page border-success',                   icon: <Check size={12} /> },
  };
  return map[status];
};


export function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}


// Convert backend CreativePlan to frontend state shapes
export function planToFrontendState(plan: CreativePlan, runId?: string) {
  const shots: Shot[] = plan.scenes.map((scene, idx) => ({
    id: scene.scene_id,
    index: idx + 1,
    currentPrompt: scene.wan_prompt,
    duration: scene.duration_seconds,
    model: 'Wan 2.7',
    status: 'review' as Status,
    history: [],
    coverUrl: runId ? `http://127.0.0.1:8000/api/artifacts/${runId}/${scene.reference_image}` : undefined,
    referenceImage: scene.reference_image,
    shotGoal: scene.shot_goal,
    cameraLanguage: scene.camera_language,
    wanPrompt: scene.wan_prompt,
    negativePrompt: scene.negative_prompt,
    overlayText: {
      headline: scene.overlay_text.headline,
      subline: scene.overlay_text.subline,
      priceTag: scene.overlay_text.price_tag,
    },
    energy: scene.energy,
  }));

  const overlay = plan.scenes[0]?.overlay_text;
  const copyAsset: CopyAsset = {
    status: 'review',
    finalText: overlay
      ? `${overlay.headline}\n${overlay.subline}${overlay.price_tag ? ' · ' + overlay.price_tag : ''}`
      : plan.creative_direction.core_message,
    generationPrompt: `Tone: ${plan.creative_direction.tone}. Hook: ${plan.creative_direction.hook}`,
    baseContext: plan.material_analysis.subject_summary,
    history: [],
  };

  const voiceAsset: VoiceAsset = {
    status: 'pending',
    voiceName: 'Influencer EN',
    availableVoices: ['Influencer EN', 'Calm EN', 'Energetic EN'],
    duration: plan.video_style.duration_seconds,
  };

  return { shots, copyAsset, voiceAsset, plan };
}
