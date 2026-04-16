# AI 视频工坊

> 面向创意编导的浏览器端 AI 视频工作流工具。
> 从商品素材到 AI 分镜，再到音画对齐、导出成片与多平台分发，全流程可视化、可审校、可一键自动化。

> 🤖 **如果你是 AI Agent（如 Kimi、Claude Code 等）**，请先阅读 [`AGENTS.md`](./AGENTS.md) 以了解本项目的开发规范与边界。

---

## 📖 项目定位

市面上很多"AI 视频工具"只做一件事：**批量生产数字人口播视频**（扒文案→洗稿→对口型→发抖音）。

**AI 视频工坊**想做的是一条更完整的链路：

```
商品/素材输入
    ↓
AI 生成分镜 + 口播文案（可审校）
    ↓
Timeline 音画对齐（可微调）
    ↓
导出成片
    ↓
多平台分发（规划中）
```

我们同时支持两种使用模式：

| 模式 | 特点 | 适合谁 |
|------|------|--------|
| **标准模式（4-Stage）** | 每一步都可看、可改、可对齐 | 创意编导、广告设计师、追求质量的内容创作者 |
| **快速模式（一键生成）** | 上传素材 → 自动走完中间步骤 → 直接出片 | 老用户、批量生产、追求效率的场景 |

当前版本已具备**完整前后端**，后端以 mock 模式运行，可体验从上传到导出的全链路。

---

## 🚀 快速开始

### 完整开发模式（前后端同时启动）

```bash
# 1. 启动后端（Python + FastAPI）
cd backend
pip install -r requirements.txt
python api.py
# 后端运行 http://127.0.0.1:8000

# 2. 启动前端（新终端）
npm install
npm run dev
# 默认打开 http://localhost:5173
```

### 仅预览前端（无需安装 Node）
如果你只想看看前端静态效果：

- **macOS**：双击 `start.command`
- **Windows**：双击 `start.bat`

脚本会自动启动一个本地服务器并在浏览器中打开页面。
（注：此为纯前端演示，不涉及后端 API）

### 生产构建
```bash
npm run build
```

---

## ✨ 核心功能：4-Stage 工作流

### 1. 素材规划（Upload）
- 上传商品图片（支持多选）和 CSV/Excel 产品信息
- 支持**批量上传**（一次提交最多 100 个商品），系统自动排队生成视频
- 选择商品类目（shoes / apparel / outdoor_gear）和脚本模板
- 右上角可切换 **标准模式 / 快速模式**

### 2. 创意方案（Proposal）
- **Shot Grid（分镜卡片网格）**：每个 shot 包含封面、prompt、时长、生成模型
- **状态流转**：`待生成` → `生成中` → `待确认` → `已通过`
- **拖拽重排**：拖动卡片即可调整镜头顺序，释放后自动更新 index 和链式动画
- **Chat 式改 Prompt**：点击 shot 的"重新生成"，弹出对话窗口，用自然语言修改分镜描述
- **口播与配音**：右侧管理口播文案和配音音色选择

### 3. 音画对齐（Align）
- **CapCut 风格时间轴编辑器**
- **三轨道**：视频（Video）、配音（Voice）、背景音乐（BGM）
- **常用操作**：
  - 拖动 Playhead 定位当前帧
  - 拖动 clip 调整位置
  - 拖拽边缘 trim 时长
  - `Ctrl + S` 分割 clip
  - `Ctrl + Z` 回退上一步
  - `Delete` 删除选中 clip
  - 空格键 播放 / 暂停
- **Zoom 缩放**：20 ~ 120 px/s

### 4. 导出成片（Export）
- 显示后端渲染与配音进度
- 完成后通过 `POST /api/assemble` 调用 FFmpeg 合成最终视频
- 页面提供 `final_with_voice.mp4` 下载链接
- 支持产物汇总展示：文件列表、语音文案、分镜 Prompt、参考图预览

### 5. 批量任务中心（Batch）
- 上传 CSV / Excel + 批量图片，后端 SQLite 队列自动排队处理
- 实时显示批次进度条、ETA 预估剩余时间
- 生成完成后自动打包为 ZIP，按 `product_id` 命名每个 MP4（重复 ID 自动加 `_2`、`_3` 后缀防覆盖）
- 每个视频已自动合成：字幕（SRT 烧录）+ BGM 混音 + 口播配音
- **边界测试验证**：50 项批次 ~70s 完成；并发 2×10 项无竞争；101 项正确拒绝

### 6. 平台分发（Distribute）—— 规划中
成片后支持一键发布到抖音、小红书、视频号等平台。计划通过**官方开放平台 API 或合规 SaaS SDK**实现，不走浏览器 RPA 的灰色路线。

### 7. 抖音发布（MVP，内置）
当前版本已将抖音发布能力内置到 `ai-video-studio` 后端：

- 合成完成后，导出页提供“发布到社交平台”一键入口（首期平台：抖音）
- 发布面板支持“扫码登录”并自动读取已登录抖音账号（下拉选择）
- 点击“一键发布到社交平台”后，后端提交抖音发布任务并轮询状态
- 可选开启“合成完成后自动触发发布”

> 默认关闭自动发布；仅在你配置 `AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE=true` 后触发。

在启动后端前可配置：

```bash
# 发布模式（当前仅支持 native_internal）
PUBLISH_MODE=native_internal

# 浏览器自动化模式（true=headless, false=headed）
PUBLISH_HEADLESS=true

# 演示导出素材（未设置时默认使用 D:/ai-workflow/微信视频2026-04-16_194935_072.mp4）
MOCK_VIDEO_SOURCE=D:/ai-workflow/微信视频2026-04-16_194935_072.mp4

# 合成完成后自动发布开关
AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE=false

# 自动发布时使用的抖音账号名
AUTO_PUBLISH_DOUYIN_ACCOUNT=creator

# 自动发布可附加标签（逗号分隔）
AUTO_PUBLISH_DOUYIN_TAGS=电商,种草

# 自动发布标题前缀（可选）
AUTO_PUBLISH_DOUYIN_TITLE_PREFIX=[AI视频]
```

使用前请在当前项目环境中安装浏览器自动化依赖（推荐其一）：

1. `pip install patchright`
2. `patchright install chromium`
3. 或使用 Playwright：`pip install playwright && playwright install chromium`

后端发布相关接口：

1. `POST /api/publish/douyin/login/start`：创建扫码登录会话
2. `GET /api/publish/douyin/login/sessions/{session_id}`：轮询登录状态和二维码
3. `GET /api/publish/accounts?platform=douyin`：获取已登录账号
4. `POST /api/publish/douyin/start`：提交发布任务
5. `GET /api/publish/tasks/{task_id}`：查询发布任务状态

---

## 🛠 技术栈

### 前端
- **框架**：React 19 + TypeScript 5
- **构建工具**：Vite 6
- **样式方案**：Tailwind CSS v4 + CSS 变量双主题（Light / Dark）
- **图标库**：Lucide React
- **状态管理**：React 原生 State（当前无 Redux / Zustand）
- **单元测试**：Vitest + React Testing Library
- **E2E 测试**：Playwright

### 后端
- **框架**：FastAPI (Python 3.12+)
- **核心能力**：
  - `creative_plan_builder.py` — LLM 分镜规划（当前 mock）
  - `tts_voiceover_builder.py` — 英文口播文案 + TTS（当前 mock）
  - `batch_queue.py` + `batch_worker.py` — SQLite 批量队列与后台 Worker
  - `video_pipeline.py` + `mix_audio_into_video.py` — FFmpeg 视频/音频合成
- **Prompt 模板**：YAML 外部化配置，位于 `backend/prompts/`
- **Mock 模式**：默认开启，避免真实 API 调用产生费用

---

## 📂 项目结构

```
ai-video-studio/
├── backend/                    # FastAPI 后端
│   ├── api.py                  # API 入口（/api/import、/api/plan、/api/assemble 等）
│   ├── core/                   # 核心业务逻辑
│   │   ├── creative_plan_builder.py
│   │   ├── tts_voiceover_builder.py
│   │   ├── wan_batch_generate.py
│   │   └── video_pipeline.py
│   ├── prompts/                # YAML prompt 模板
│   │   ├── planning/
│   │   └── copy/
│   └── utils/                  # 通用工具（csv_importer、prompt_loader）
├── scripts/                    # 开发辅助脚本
│   └── generate_test_batch.py  # 生成 10~100 条合成商品数据，用于批量压力测试
├── dist/                       # 前端生产构建产物（可直接运行）
├── e2e/                        # Playwright E2E 测试
├── public/                     # 静态资源
├── src/
│   ├── api/
│   │   └── client.ts           # 前端 HTTP 客户端（对接 FastAPI）
│   ├── components/
│   │   ├── DropdownSelector.tsx
│   │   ├── StepBar.tsx
│   │   ├── modals/             # VideoModal、CopyVoiceModal
│   │   └── stages/             # Upload / Proposal / Align / Export
│   ├── data/
│   │   └── mock.ts             # 初始演示数据
│   ├── types/
│   │   └── index.ts            # TypeScript 类型定义
│   ├── utils/
│   │   └── helpers.tsx         # 通用辅助函数
│   ├── App.tsx                 # 主应用 + 全局状态
│   ├── index.css               # 全局样式 + CSS 变量
│   └── main.tsx                # 入口文件
├── start.command               # macOS 一键启动脚本（纯前端）
├── start.bat                   # Windows 一键启动脚本（纯前端）
├── AGENTS.md                   # AI 开发助手规范
├── COLLABORATION.md            # 协作者入门手册
├── package.json
├── vite.config.ts
├── playwright.config.ts
└── README.md                   # 本文件
```

---

## 🧪 测试

```bash
# 单元测试
npm run test

# E2E 测试
npm run test:e2e

# ESLint 检查
npm run lint
```

---

## 🤝 协作方式

本仓库为**私有仓库**，采用 **Pull Request（PR）** 模式协作：

1. 协作者可以 `clone` 代码到本地查看和运行
2. 如需修改代码，请**先 fork 或开 feature branch**，完成后提交 **Pull Request**
3. 项目发起人负责 review、测试并通过 `merge` 入主分支

详细规范请参阅 [`COLLABORATION.md`](./COLLABORATION.md)。

---

## 🗺 后续路线图

| 优先级 | 事项 | 状态 |
|--------|------|------|
| P0 | **后端架构**：FastAPI 骨架已搭建，对接了 import / plan / render / voice / assemble | ✅ 已完成 |
| P1 | **输入与上传流程**：支持真实图片上传、CSV / Excel 批量导入、类目选择 | ✅ 已完成 |
| P2 | **导出成片**：FFmpeg 拼接已可用，支持字幕烧录、BGM 混音、ZIP 批量下载 | ✅ 已完成 |
| P3 | 接入真实视频生成 API（Wan / Seedance / Keling / Veo） | 🔜 待接入 |
| P4 | 接入真实 TTS（ElevenLabs / Edge-TTS / CosyVoice） | ✅ 已接入 Qwen-TTS |
| P5 | **一键快速模式**：前端已支持，后端已打通自动串行执行 | ✅ 已完成 |
| P5.5 | **批量生产模式**：SQLite 队列 + Worker + ZIP 打包 + 进度追踪 | ✅ 已完成 |
| P6 | **多平台分发**：接入官方 API 或合规 SDK，支持抖音/小红书/视频号等 | 🔜 规划中 |
| P7 | 用户系统 + 项目保存 / 加载 / 云端持久化 | 🔜 规划中 |
| P8 | Timeline 高级功能：音量包络、变速、多 BGM 轨道 | 🔜 规划中 |

---

## 💡 推荐安装的工具与技能

如果你是使用 AI 辅助开发的协作者，以下工具/技能能显著提升在这个项目上的开发效率：

| 工具 / Skill | 用途 | 安装方式 |
|-------------|------|----------|
| **mcp-browser-screenshot** | AI 截图验证。改完 UI 后让 AI 直接看 `localhost:5173` 的渲染效果 | `npm install -D mcp-browser-screenshot && npx playwright install chromium` |
| **ts-morph** | AST 级代码重构。已作为 devDependency 安装，用于安全拆分大文件 | 已内置：`npm list ts-morph` |
| **using-git-worktrees** (Kimi CLI Skill) | 创建隔离工作区，让 AI 在独立分支做实验，避免污染主分支 | 若使用 Kimi CLI，通常已自带该 Skill |
| **Playwright** | E2E 测试与浏览器自动化。已安装，用于 `npm run test:e2e` | 已内置 |

---

## ⚠️ 声明

本项目仅供学习、研究和技术交流使用。若涉及第三方平台 API 接入，请遵守各平台的开发者协议与使用规范。
