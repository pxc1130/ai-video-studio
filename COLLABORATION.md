# AI 视频工坊 — 协作开发手册

> **版本**：v0.4（前后端完整版 + 批量生产）  
> **最后更新**：2026-04-16  
> **受众**：新加入的协作者（前端、后端、产品、设计均可参考）  
> **目的**：帮助协作者快速理解项目结构、运行方式、产品逻辑与开发边界。

---

## 1. 项目定位

**AI 视频工坊** 是一个浏览器端的 AI 视频生产工具，目标是把 "商品/素材 → AI 视频成片 → 多平台分发" 的全链路做得既**可控**又**高效**。

我们的产品逻辑包含两条使用路径：

### 路径 A：4-Stage 精细工作流（默认）
面向**创意编导、广告设计师、内容创作者**，强调每一步都可审校、可微调：

```
素材规划（Upload）
    ↓  AI 分析商品/输入，自动生成分镜 + 口播文案
创意方案（Proposal）
    ↓  人工审校、拖拽重排、Chat 改 Prompt、确认状态
音画对齐（Align）
    ↓  在时间轴上精确 trim / split / 对齐配音与 BGM
导出成片（Export）
    ↓  视频合成与格式选择
平台分发（Distribute） ← 未来扩展
    ↓  一键发布到抖音、小红书、视频号等（走官方 API / 合规 SDK）
```

### 路径 B：一键快速生成
面向**追求效率的用户**或**重复性生产场景**。通过设置开关，允许用户跳过中间审校步骤：
- 上传素材 → 一键确认 → 后台自动走完 Proposal + Align → 直接导出成片
- 成片后可选择"自动分发到绑定的平台账号"

### 路径 C：批量生产模式
面向**一天需要生产几十上百条视频**的电商团队：
- 上传 CSV / Excel + 批量商品图片 → 系统自动排队生成
- 每个商品独立走 plan → render → voice → assemble 流程
- 生成完成后打包为 ZIP，按 `product_id` 命名每个 MP4
- 支持实时进度追踪和 ETA 预估

> 当前版本已同时支持路径 A（精细工作流）和路径 C（批量生产），路径 B 作为配置化能力逐步叠加，**不会替代**现有的 4-Stage 界面。

---

## 2. 快速开始

### 环境要求
- Node.js 18+（推荐 20+）
- npm 9+
- macOS / Windows / Linux 均可

### 安装与运行
```bash
cd ~/Desktop/ai-video-studio
npm install
npm run dev
```
默认打开 `http://localhost:5173`。

### 常用命令
```bash
npm run build        # 生产构建（必须先通过）
npm run test         # Vitest 单元测试
npm run test:e2e     # Playwright E2E 测试
npm run lint         # ESLint 检查
```

---

## 3. 完整工作流详解

### Stage 1：素材规划（Upload）
**输入**：用户上传的商品图、产品信息、或参考链接。  
**输出**：点击"开始规划"后，系统自动初始化 `shots[]`、`copyAsset`、`voiceAsset`，进入 Proposal。

### Stage 2：创意方案（Proposal）
**输入**：AI 生成的初始分镜与口播文案。  
**输出**：经过人工审校后的确认状态。  
**核心交互**：
- **Shot Grid**：4 个 shot 卡片，每个包含封面、prompt、时长、生成模型、状态 badge
- **拖拽重排**：拖动卡片调整镜头顺序，释放后自动更新 index 和链式动画
- **Chat 式改 Prompt**：点击 shot 的"重新生成"弹出 `VideoModal`，用自然语言修改分镜描述
- **状态流转**：`待生成` → `生成中` → `待确认` → `已通过`
- **口播与配音**：右侧管理 `CopyAsset`（口播文案）和 `VoiceAsset`（配音音色选择）

### Stage 3：音画对齐（Align）
**输入**：Proposal 阶段确认后的 shot 序列、口播文案、配音音色、BGM。  
**输出**：精确对齐后的 timeline 状态（可被导出）。  
**核心交互**：
- **三轨道时间轴**：
  - **Video**：shot 序列（自动链式排列，trim 后自动重算 start）
  - **Voice**：`VoiceClip[]` 数组，支持 split / trim / move / delete
  - **BGM**：`BgmClip[]` 数组，同视频轨逻辑
- **Playhead**：红色游标，可拖动定位；空格键播放/暂停
- **工具栏**：播放、回退起点、分割（`Ctrl+S`）、删除（`Delete`）、回退（`Ctrl+Z`）、重置
- **Zoom 缩放**：20 ~ 120 px/s

### Stage 4：导出成片（Export）
**输入**：Align 阶段产出的 timeline 状态。  
**输出**：渲染完成的视频文件。  
**当前状态**：✅ 已接入 FFmpeg 合成，输出 `final_with_voice.mp4`。页面同时展示产物汇总：文件列表、语音文案、分镜 Prompt 与参考图。

### Stage 5：平台分发（Distribute）—— 规划中
**输入**：Export 产出的成片 + 标题/话题/封面。  
**输出**：发布到抖音、小红书、视频号等平台。  
**实现策略**：计划通过官方开放平台 API 或合规 SaaS SDK 完成，**不采用浏览器 RPA**（避免风控与合规风险）。

> 当前代码中已提供“社交平台一键发布”MVP（首期抖音）：导出阶段可在合成后一键提交发布，并可在前端直接触发扫码登录。发布执行逻辑已迁入本仓库后端（`backend/core/publish`），Cookie 存储在 `backend_data/cookies`，不再依赖外部 CLI 桥接。该能力默认可用，自动发布仅在显式配置环境变量后启用。

---

## 4. 两种使用模式的 UI 策略

| 模式 | 入口 | 用户看到的流程 | 适用场景 |
|------|------|----------------|----------|
| **标准模式** | 默认进入 Upload | 完整 4-Stage，每步可审校 | 创意策划、广告制作、新品首发 |
| **快速模式** | Upload 页提供"一键生成"开关 | 上传素材 → 确认参数 → 等待成片 → 可选分发 | 批量生产、复用模板、熟悉后的老用户 |

> **开发原则**：快速模式是"配置化跳过"，而不是"删除 stage"。底层逻辑仍复用 Proposal + Align 的计算能力，只是 UI 层面收起中间步骤。

---

## 5. 技术栈

- **框架**：React 19 + TypeScript 5
- **构建**：Vite 6
- **样式**：Tailwind CSS v4 + 自定义 CSS 变量（双主题：Light / Dark）
- **图标**：Lucide React
- **状态**：纯 React State（目前无 Redux / Zustand）
- **测试**：Vitest + React Testing Library + Playwright
- **AST 重构**：ts-morph（已用于安全拆分 `App.tsx`）

---

## 6. 代码结构与约定

### 6.1 目录结构
```
src/
├── App.tsx                     # 主应用：stage 路由 + 全局状态
├── types/
│   └── index.ts                # 所有 TS 类型定义
├── data/
│   └── mock.ts                 # 初始 mock 数据
├── utils/
│   └── helpers.tsx             # statusBadge、formatTime 等纯函数
├── components/
│   ├── StepBar.tsx             # 顶部步骤导航栏
│   ├── DropdownSelector.tsx    # 自定义向上展开下拉框
│   ├── modals/                 # VideoModal、CopyVoiceModal
│   └── stages/                 # Upload / Proposal / Align / Export
├── index.css                   # 全局样式 + CSS 变量
└── main.tsx                    # 入口文件
```

### 6.2 关键约定（违反会导致构建失败或 UI 回归）
1. **主题系统禁令**：
   - 禁止硬编码 `bg-black`、`text-white` 或任意 dark-mode hex 值
   - 必须使用 CSS 变量：`bg-runway-page`、`text-runway-text`、`border-runway-border` 等
2. **交互元素**：
   - 所有可点击元素必须有 `cursor-pointer`
   - 按钮推荐用 `btn-interactive`，卡片推荐用 `card-interactive`
3. **构建安全**：
   - 任何非平凡改动后必须运行 `npm run build`
   - 构建失败必须优先修复，不能堆积
4. **文件拆分**：
   - 禁止用 naive 字符串切分重构组件
   - 必须用 AST 工具（ts-morph）或手动安全迁移

---

## 7. 状态管理说明

目前所有状态集中在 `App.tsx` 顶层，通过 props 向下传递：

```tsx
const [shots, setShots] = useState<Shot[]>(INITIAL_SHOTS);
const [copyAsset, setCopyAsset] = useState<CopyAsset>(INITIAL_COPY);
const [voiceAsset, setVoiceAsset] = useState<VoiceAsset>(INITIAL_VOICE);
```

### 为什么不用状态管理库？
- 当前组件树不深，prop drilling 可控
- 下一阶段若接入后端 API，可能会引入 Zustand / TanStack Query 做服务端状态管理
- **现阶段不要随意引入新状态库**，避免过度设计

---

## 8. 测试覆盖

### 单元测试
- `src/App.test.tsx`：检查 4 个 stage tab 渲染 + 默认显示 Upload stage

### E2E 测试
- `e2e/smoke.spec.ts`：打开首页 → 点击"音画对齐" → 检查 timeline 三轨道可见

### 运行方式
```bash
npm run test         # Vitest
npm run test:e2e     # Playwright
```

---

## 9. 已知限制与待办（优先级排序）

### P0：后端架构设计与基础服务搭建
- **当前状态**：✅ FastAPI 后端已搭建，SQLite 批量队列 + 后台 Worker 已运行
- **已完成**：单条工作流 API、批量任务 API、FFmpeg 视频/音频合成、ZIP 打包下载
- **待扩展**：若需支撑单日 1000+ 条视频，需将 SQLite Worker 升级为 Celery + Redis / RabbitMQ，并接入分布式对象存储（OSS / S3）

### P1：输入与上传流程优化
- **当前状态**：✅ 已支持真实图片上传、CSV / Excel 批量导入、文件夹自动扫描
- **需要扩展**：
  - 支持 URL 自动抓取（如抖音/淘宝商品链接）
  - 支持 Google Sheets / 飞书文档 API 直连导入
  - 支持电商 API / 商品信息接口对接（用于自动化输入）
- **说明**：当前已具备统一的批量输入适配层（`batch_queue.py`），能把 CSV/Excel + 图片自动标准化为工作流初始状态。

### P2：导出真实化
- **当前状态**：✅ 已接入 FFmpeg 合成，输出 `final_with_voice.mp4`，支持字幕烧录、BGM 混音
- **待扩展**：接入云函数 / GPU 渲染集群以支撑高并发；Timeline 高级编辑（变速、音量包络）

### P3：AI 生成接入
- **当前状态**：✅ Qwen 多模态规划模型和 Qwen-TTS 已接入并运行
- 需要接入真实文生视频 API（Wan 2.6 / Wan 2.7 / Seedance / Keling / Veo），让 render 步骤从 Mock 占位视频变为真实动态画面

### P4：配音合成接入
- **当前状态**：✅ 已接入 Qwen-TTS（`qwen3-tts-instruct-flash`），自动生成英文口播音频
- 可选扩展：接入 ElevenLabs / CosyVoice / Edge-TTS 以支持更多音色和语言

### P5：一键快速模式
- **当前状态**：✅ 已支持。UploadStage 右上角可切换 standard / fast 模式
- 用户确认输入后，后端自动串行执行 Proposal（AI 生成分镜）+ Align（默认对齐逻辑）+ Export（自动合成），直接返回成片
- **说明**：这不是删除现有 4-Stage UI，而是在底层能力之上增加一个"自动跑完"的快捷入口。

### P6：平台分发
- 接入官方开放平台 API 或合规 SaaS SDK
- 支持抖音、小红书、视频号等主流平台的自动发布
- **说明**：优先走官方 API，不走浏览器 RPA 方案。

### P7：用户系统与持久化
- 用户注册 / 登录
- 项目（Project）的保存、加载、版本历史
- 云端素材库与成片管理

### P8：高级 Timeline
- 音量包络线、变速、多 BGM 轨道、关键帧

---

## 10. 外部资源与依赖

### 已安装的可选工具
- `mcp-browser-screenshot` + Playwright Chromium：用于 AI 辅助开发时的浏览器截图验证

### 重要的未接入资源
- **文生视频 API**：需要申请各平台 API Key（具体渠道和定价策略由项目发起人统一对接）
- **TTS 服务**：CosyVoice 开源可本地部署，也可先用 Edge-TTS 做 MVP
- **分发 SDK**：正在评估 Upload-Post 等合规方案

---

## 11. 协作者守则

1. **提交前必须 build**：`npm run build` 是硬门槛
2. **重大重构先开分支**：我们已配置好 `.worktrees/` 支持，鼓励用 `git worktree` 做隔离实验
3. **不要改历史决策文件**：`AGENTS.md` 和 `COLLABORATION.md` 的修改需与项目发起人同步
4. **发现冲突先问**：如果不确定某段代码的意图（尤其是 `AlignStage` 的 timeline drag 逻辑），优先沟通而非直接重写

---

## 12. 联系人

- **项目发起人 / 架构决策人**：_______（请项目 Owner 自行补充姓名/联系方式）
- **当前代码状态**：前后端完整贯通，批量队列、FFmpeg 合成、TTS、字幕、BGM、ZIP 打包均已可用
- **下一步重点**：接入真实文生视频 API（替换 Mock 占位视频），以及数字人 Lip Sync 技术评估
