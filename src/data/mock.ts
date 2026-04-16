import type { Shot, CopyAsset, VoiceAsset, BgmClip } from '../types';

// ============================================================
// Mock Data
// ============================================================
export const INITIAL_SHOTS: Shot[] = [
  {
    id: 's1', index: 1, currentPrompt: '一位年轻女性在明亮的咖啡厅里，手持产品，阳光透过窗户洒在脸上，温暖的色调。',
    duration: 4.5, model: 'Wan 2.6', status: 'approved',
    coverUrl: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=400&q=80',
    history: [
      { id: 'h1-1', prompt: '一位女性在咖啡厅', timestamp: '10:23', status: 'approved' },
      { id: 'h1-2', prompt: '一位年轻女性在明亮的咖啡厅里，手持产品，阳光透过窗户洒在脸上，温暖的色调。', timestamp: '10:25', status: 'approved' },
    ]
  },
  {
    id: 's2', index: 2, currentPrompt: '产品特写镜头，在木质桌面上缓慢旋转，展示包装细节和质感。',
    duration: 3.0, model: 'Wan 2.6', status: 'review',
    coverUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&q=80',
    history: [
      { id: 'h2-1', prompt: '产品特写镜头，在木质桌面上缓慢旋转，展示包装细节和质感。', timestamp: '10:30', status: 'review' },
    ]
  },
  {
    id: 's3', index: 3, currentPrompt: '户外花园场景，产品放在绿植中间，水滴落在上面，清新自然。',
    duration: 5.0, model: 'Wan 2.6', status: 'generating',
    coverUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80',
    history: [
      { id: 'h3-1', prompt: '户外花园场景，产品放在绿植中间，水滴落在上面，清新自然。', timestamp: '10:35', status: 'generating' },
    ]
  },
  {
    id: 's4', index: 4, currentPrompt: '夜晚城市天台，霓虹灯背景下，产品发出微光，赛博朋克风格。',
    duration: 4.0, model: 'Wan 2.6', status: 'review',
    coverUrl: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=400&q=80',
    history: [
      { id: 'h4-1', prompt: '城市夜景，赛博朋克风格', timestamp: '10:40', status: 'approved' },
      { id: 'h4-2', prompt: '夜晚城市天台，霓虹灯背景下，产品发出微光，赛博朋克风格。', timestamp: '10:42', status: 'review' },
    ]
  },
];


export const INITIAL_COPY: CopyAsset = {
  status: 'approved',
  finalText: '这款产品在清晨的第一缕阳光中醒来，为你带来一整天的活力。无论是忙碌的工作日，还是悠闲的周末，它都是你最贴心的陪伴。',
  generationPrompt: '口播风格：温暖亲切，强调日常陪伴感和活力；受众：25-35岁都市白领；避免过度营销感，语气像朋友推荐。',
  baseContext: '【商品信息】这是一款主打提神醒脑的即饮咖啡，0糖0脂，包装采用环保材质。核心卖点：便捷、健康、口感醇厚。',
  history: [
    { id: 'c1', prompt: '口播风格：温暖亲切，强调日常陪伴感和活力；受众：25-35岁都市白领；避免过度营销感，语气像朋友推荐。', timestamp: '10:32', status: 'approved' },
  ]
};


export const INITIAL_VOICE: VoiceAsset = {
  status: 'approved',
  voiceName: '知性女声',
  availableVoices: ['知性女声', '活力少女', '沉稳男声', '亲切阿姨', '磁性男声'],
  duration: 24.5,
};


export const BGM_CLIPS: BgmClip[] = [
  { id: 'b1', name: '轻快早晨', start: 0, duration: 8, color: 'rgba(245,158,11,0.25)' },
  { id: 'b2', name: '轻快早晨', start: 8, duration: 8.5, color: 'rgba(245,158,11,0.25)' },
];
