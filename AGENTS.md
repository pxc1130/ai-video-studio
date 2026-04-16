# AI Agent Instructions — ai-video-studio

> **受众**：本文档主要供 AI 开发助手（如 Kimi、Claude Code 等）阅读，用于理解项目规范、技术栈和开发边界。

---

## 1. Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript 5
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS v4 + custom CSS variables (dual-theme)
- **Icons**: Lucide React (from `public/icons.svg` sprite when possible)
- **State**: Local React state (no external state library)
- **Testing**: Vitest + React Testing Library + Playwright

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Entry**: `backend/api.py` (runs on `http://127.0.0.1:8000`)
- **Core modules**: `backend/core/` — creative planning, TTS, mock clients
- **Prompt templates**: `backend/prompts/` — YAML-based, editable without touching Python

---

## 2. Theme System (Critical)
- **Never** hardcode `bg-black`, `text-white`, or arbitrary dark-mode hex values in components.
- Always use the CSS-variable palette:
  - `bg-runway-page` / `text-runway-text`
  - `border-runway-border`
  - `bg-runway-surface`, `bg-runway-card`, `text-runway-text-secondary`
  - Semantic colors: `text-framer-blue`, `text-success`, `text-warning`, `text-error`
- Dark mode is triggered by `data-theme="dark"` on `<html>`; Tailwind config uses `darkMode: ['class', '[data-theme="dark"]']`.

---

## 3. Interactive Elements
- Every clickable element must have `cursor-pointer`.
- Use the shared utilities in `src/index.css`:
  - `btn-interactive` for buttons
  - `card-interactive` for hover-lift cards
- Respect `:active` / `scale-[0.98]` micro-interactions on press.

---

## 4. Build Safety Rule
- **Run `npm run build` after any non-trivial change.**
- If the build fails, **revert or fix immediately** before doing anything else.
- Do not introduce `any` typed values unless absolutely unavoidable.
- If tests fail (`npm run test` or `npm run test:e2e`), treat them with the same urgency as build failures.

---

## 5. File Architecture (Current)

### Frontend (`src/`)
- `src/App.tsx` 已被拆分为 71 行的主路由文件，所有 Stage、Modal、类型和 helpers 已迁移到独立模块：
  - `src/components/stages/` — UploadStage, ProposalStage, AlignStage, ExportStage
  - `src/components/modals/` — VideoModal, CopyVoiceModal
  - `src/types/` — 全局类型定义（已扩展后端 API 类型）
  - `src/utils/` — 纯函数辅助 + `planToFrontendState()` 数据映射
  - `src/data/` — mock 数据
  - `src/api/client.ts` — 前端 HTTP 客户端，对接 FastAPI
- **Do NOT attempt line-based or naive string splitting** to break files apart. AST-based refactoring (e.g., `ts-morph`) is required if you ever need to further split large files.
- Prefer adding new small helper files in `src/utils/` or `src/components/` over growing existing stage files.

### Backend (`backend/`)
- `backend/api.py` — FastAPI 服务，提供单条工作流和批量队列 API
- `backend/core/creative_plan_builder.py` — 调用 LLM 生成 `creative_plan.json`（支持 mock 模式）
- `backend/core/tts_voiceover_builder.py` — 生成英文口播文案 + TTS（支持 mock 模式）
- `backend/core/batch_queue.py` — SQLite 批量任务队列（批次 + 子任务）
- `backend/core/batch_worker.py` — 后台 Worker，串行处理批量视频生成；带单例启动锁防止 uvicorn reload 重复创建线程
- `backend/core/mock_client.py` — Mock OpenAI / TTS 客户端，本地开发时避免真实 API 调用
- `backend/utils/prompt_loader.py` — YAML prompt 模板加载器
- `backend/utils/csv_importer.py` — CSV / Excel 批量导入工具
- `scripts/generate_test_batch.py` — 快速生成 10~100 条合成商品数据与占位图，用于边界/压力测试

---

## 6. Prompt Configuration (Important)

**所有 LLM prompt 都已外部化到 YAML 文件。**

- 规划类 prompt: `backend/prompts/planning/tiktok_us_ecommerce.yaml`
- 口播类 prompt: `backend/prompts/copy/tiktok_us_influencer.yaml`

**批量生成相关配置**：
- 默认 BGM 路径：`backend/assets/bgm_default.mp3`
- 批量产物 ZIP 路径：`backend_data/batch_downloads/{batch_id}.zip`
- 队列数据库：`backend_data/batch_queue.db`
- `batch_queue.update_item()` 使用动态 SQL：仅当传入字段不为 `None` 时才更新，避免覆盖已有值（如 `run_id`、`plan_path`）

**规则**：
- 如需修改 AI 的输出风格、语气、约束，**直接编辑 YAML**，不要修改 Python 代码。
- YAML 使用简单的 `{{ variable }}` 模板语法，由 `prompt_loader.py` 渲染。
- 新增类目（如 `sports_equipment`）时，在对应 YAML 的 `category_briefs` 下添加即可。

---

## 7. Mock Mode

当前后端默认运行在 **mock 模式**（不调用真实 LLM / TTS / 视频生成 API），原因：
1. API 费用高，调试阶段需要控制成本。
2. 方便本地快速验证数据流和前端对接。

**mock 行为**：
- `creative_plan_builder.py` → 返回预设的英文电商场景 plan
- `wan_batch_generate.py`（由 api.py 调用）→ 生成黑色静音占位 MP4（分辨率 1080×1920）
- `tts_voiceover_builder.py` → 生成静音 WAV + 模拟文案
- `assemble` → 用 FFmpeg 拼接占位视频和静音音频

**如何关闭 mock**：
1. 在 `backend/api.py` 中，把 `planPipeline` 和 voice branch 的 `use_mock=True` 改为 `False`
2. 确保环境变量 `DASHSCOPE_API_KEY` 已设置
3. 将 TTS 模块替换为真实 provider（ElevenLabs / Edge-TTS）

---

## 8. Workflow Modes

前端现在支持两种模式：

1. **标准模式 (`standard`)**：Upload → Proposal → Align → Export，每步可人工审阅修改。
2. **一键直出模式 (`fast`)**：UploadStage 点击"一键生成视频"后，后端自动连续执行 plan → render → voice → assemble，直接跳到 ExportStage。

切换开关位于 UploadStage 右上角。

---

## 9. Modal / Layout Conventions
- `VideoModal`: preview on the **left**, chat controls on the **right**.
- Dropdowns inside modals should use the custom `DropdownSelector` (opens upward) to avoid bottom truncation.
- Close button sits in the **outer header top-right**, not inside the modal body.

---

## 10. Stage-Specific Rules

### UploadStage / BatchUploadModal
- 新增类目选择（shoes / apparel / outdoor_gear / default）
- 支持脚本模板输入（可选）
- 支持图片多选上传（真实调用 `/api/products/import`）
- 支持 CSV / Excel 批量上传（调用 `/api/batch/upload`）
- 右上角有 standard / fast 模式切换
- 批量上传弹窗包含「本地上传」和「在线文档」两个 Tab

### ProposalStage
- Shot grid cards use status badges as **rotated stickers outside the card bounds** (`-top-3 -right-3 rotate-3`).
- Drag handle icon is **removed**; the whole card body is the drag handle.
- "Shot N" label sits **top-left outside bounds** (`-top-3 -left-3`).
- 如果后端返回了 `reference_image`，`coverUrl` 会自动映射为 artifact URL。

### AlignStage (Timeline Editor)
- Uses a **history stack** for undo; every destructive operation pushes a snapshot.
- Keyboard shortcuts: `Ctrl+S` split, `Ctrl+Z` undo.
- RAF play loop must clean up on unmount/pause.
- Voice track is now a multi-clip `VoiceClip[]` array (supports split/trim/move/delete).

### ExportStage
- 显示真实的后端生成状态（`completed` / `failed` / `assembling`）
- 完成后提供 `artifactUrl(runId, 'deliverables/final_with_voice.mp4')` 下载链接
- 新增产物汇总面板：文件在线播放/查看、语音文案、分镜 Prompt + 参考图

### BatchList
- 展示批量任务历史，支持进度条 + ETA
- 展开后可查看每个子任务状态
- 完成后提供 ZIP 下载按钮

---

## 11. Distribution / Publishing (Future)
- Multi-platform distribution (e.g., Douyin, Xiaohongshu, WeChat Channels, TikTok) is on the roadmap.
- **If you help implement this**: prefer official platform APIs or legitimate SaaS SDKs (e.g., Upload-Post). **Do NOT** introduce browser RPA (Playwright-based social-auto-upload) into the codebase due to compliance and maintenance risks.

---

## 12. Git Workflow for AI Agents
- **Commit before every major refactoring.** Use atomic commits with descriptive messages.
- If experimenting with risky changes, create a feature branch or use `git worktree` for isolation.
- Never leave the working tree with a broken build.

---

## 13. Boundary Tests & Known Limits
- **压力测试**：50 项 CSV/Excel 批次均在 ~70s 内完成；并发 2×10 项批次上传无竞争；101 项被正确拒绝。
- **重复 product_id**：ZIP 打包自动添加 `_2`、`_3` 后缀，避免文件覆盖。
- **缺失图片 fallback**：若 `image_1` 无匹配，自动回退到全批次图片池。
- **Worker 并发策略**：当前为串行单线程（避免 ffmpeg 资源冲突与 API rate limit），后续可升级为 Celery + Redis。
- **FFmpeg 限制**：本地 ffmpeg 未编译 `drawtext` filter，字幕通过外部 SRT + `subtitles` filter 烧录；Mock TTS 音频为固定时长占位音。

---

## 14. MCP / Tooling Recommendations
- Visual validation: install `mcp-browser-screenshot` (Playwright-based) so the agent can screenshot `http://localhost:5173` after UI changes.
- Code review: after generating code, run a reflection pass asking: *"Does this follow the theme system? Does it break the build? Did I hardcode any colors?"*
