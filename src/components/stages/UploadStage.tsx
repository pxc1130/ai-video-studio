import { useState, useRef } from 'react';
import { Trash2, Upload, Images, FileType2, RefreshCw, Sparkles, Zap, FileText, X, FolderOpen, HelpCircle, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import type { WorkflowMode } from '../../types';
import { parseProductFiles, type ParsedProductInfo } from '../../utils/productParser';

function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-w-lg w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-runway-border bg-runway-surface p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-runway-elevated text-runway-text-secondary">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RecognitionRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <BaseModal title="识别规则说明" onClose={onClose}>
      <div className="space-y-4 text-sm text-runway-text-secondary">
        <p>
          上传文件夹后，系统会按以下规则自动识别商品信息：
        </p>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">1. 图片识别</div>
          <div>自动收集文件夹中所有 .jpg / .png / .webp / .gif 图片。</div>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">2. 文本信息识别（优先级从高到低）</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><code className="px-1 py-0.5 rounded bg-runway-page text-xs">description.txt</code> — 纯文本描述</li>
            <li><code className="px-1 py-0.5 rounded bg-runway-page text-xs">summary.json</code> — 结构化摘要</li>
            <li><code className="px-1 py-0.5 rounded bg-runway-page text-xs">meta.json</code> — 淘宝/电商元数据</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">3. 字段提取规则</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>商品名称</b>：读取 JSON 中的 <code>item.title</code> 或 <code>title</code> 字段</li>
            <li><b>价格</b>：读取 <code>item.price</code> 或 <code>price</code>，自动过滤货币符号</li>
            <li><b>类目</b>：根据文本内容智能推断（户外装备 / 鞋类 / 服装 / 通用）</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">4. 必填要求</div>
          <div>
            为避免浪费 AI 生成额度，必须满足以下条件才能开始生成：
            <ul className="list-disc pl-5 mt-1">
              <li>至少上传 1 张商品图片</li>
              <li>商品名称已填写（可自动识别，也可手动输入）</li>
              <li>价格已填写（建议填写，确保口播和字幕准确）</li>
            </ul>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

function FolderPreviewModal({ folderName, files, onClose }: { folderName: string; files: string[]; onClose: () => void }) {
  return (
    <BaseModal title={`文件夹：${folderName}`} onClose={onClose}>
      <div className="text-xs text-runway-textMuted mb-2">共 {files.length} 个文件</div>
      <div className="max-h-80 overflow-y-auto rounded-xl border border-runway-border bg-runway-elevated p-2">
        <ul className="space-y-1">
          {files.map((name, idx) => {
            const ext = name.split('.').pop()?.toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
            const isJson = ext === 'json';
            return (
              <li key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-runway-surface text-sm">
                <span className={`w-1.5 h-1.5 rounded-full ${isImage ? 'bg-framer-blue' : isJson ? 'bg-success' : 'bg-runway-textMuted'}`} />
                <span className="text-runway-text truncate">{name}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </BaseModal>
  );
}

function FilePreviewModal({ fileName, content, onClose }: { fileName: string; content: string; onClose: () => void }) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  let display = content;
  if (ext === 'json') {
    try {
      display = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // keep raw
    }
  }
  return (
    <BaseModal title={fileName} onClose={onClose}>
      <pre className="max-h-96 overflow-auto rounded-xl border border-runway-border bg-runway-elevated p-4 text-xs text-runway-text leading-relaxed whitespace-pre-wrap">
        {display}
      </pre>
    </BaseModal>
  );
}

export function UploadStage({
  onNext: _onNext,
  mode,
  setMode,
  onImport,
  pipelineStatus: _pipelineStatus,
  pipelineError,
}: {
  onNext: () => void;
  mode: WorkflowMode;
  setMode: (m: WorkflowMode) => void;
  onImport: (formData: FormData) => Promise<void>;
  pipelineStatus: string;
  pipelineError: string;
}) {
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('outdoor_gear');
  const [scriptTemplate, setScriptTemplate] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [descFile, setDescFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState<string>('');
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showFolderPreview, setShowFolderPreview] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [filePreviewContent, setFilePreviewContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  const applyParsedInfo = (info: ParsedProductInfo, newImages: File[], newDescFile: File | null) => {
    if (info.productName) setProductName(info.productName);
    if (info.price) setPrice(info.price);
    if (info.category) setCategory(info.category);
    if (info.scriptTemplate) setScriptTemplate(info.scriptTemplate);
    setImages(newImages);
    setDescFile(newDescFile);
    setAutoFilled(info.autoFilledFields);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...valid]);
    setAutoFilled([]);
  };

  const handleFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Extract folder name from webkitRelativePath of the first file
    const firstPath = (files[0] as any).webkitRelativePath || '';
    const extractedFolder = firstPath.split('/')[0] || '';
    setFolderName(extractedFolder);
    setFolderFiles(Array.from(files).map(f => f.name));
    const { images: parsedImages, descFile: parsedDesc, info } = await parseProductFiles(files);
    applyParsedInfo(info, parsedImages, parsedDesc);
  };

  const handleDescFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'json', 'md'].includes(ext)) {
      alert('仅支持 .txt / .json / .md 格式的商品文本信息');
      return;
    }
    setDescFile(f);
    setAutoFilled([]);
  };

  const openFilePreview = async (file: File) => {
    try {
      const text = await file.text();
      setFilePreviewContent(text);
      setShowFilePreview(true);
    } catch {
      alert('文件预览失败');
    }
  };

  const handleStart = async () => {
    if (!productName.trim() || images.length === 0) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('productName', productName.trim());
    formData.append('price', price.trim());
    formData.append('category', category);
    formData.append('scriptTemplate', scriptTemplate);
    images.forEach(img => formData.append('images', img));
    if (descFile) {
      formData.append('descriptionFile', descFile);
    }
    try {
      await onImport(formData);
    } finally {
      setLoading(false);
    }
  };

  const missingItems: string[] = [];
  if (!productName.trim()) missingItems.push('商品名称');
  if (!price.trim()) missingItems.push('价格');
  if (images.length === 0) missingItems.push('商品图片');

  const canStart = missingItems.length === 0 && !loading;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      {showRules && <RecognitionRulesModal onClose={() => setShowRules(false)} />}

      {showFolderPreview && (
        <FolderPreviewModal
          folderName={folderName}
          files={folderFiles}
          onClose={() => setShowFolderPreview(false)}
        />
      )}
      {showFilePreview && (
        <FilePreviewModal
          fileName={descFile?.name || '预览文件'}
          content={filePreviewContent}
          onClose={() => setShowFilePreview(false)}
        />
      )}

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-medium tracking-tight-runway">素材规划</h1>
          <div className="flex items-center gap-2 p-1 rounded-full bg-runway-surface border border-runway-border">
            <button
              onClick={() => setMode('standard')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${mode === 'standard' ? 'bg-framer-blue text-runway-text' : 'text-runway-text-secondary hover:text-runway-text'}`}
            >
              标准模式
            </button>
            <button
              onClick={() => setMode('fast')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${mode === 'fast' ? 'bg-framer-blue text-runway-text' : 'text-runway-text-secondary hover:text-runway-text'}`}
            >
              <Zap size={12} /> 一键直出
            </button>
          </div>
        </div>
        <p className="text-runway-text-secondary mb-8">
          {mode === 'fast'
            ? '上传商品素材后，AI 将自动完成规划、生成与混音，直接输出成片。'
            : '上传商品素材，AI 将自动分析并生成分镜方案与口播文案。'}
        </p>

        <div className="space-y-6">
          {/* Folder quick upload */}
          <div className="p-6 rounded-2xl border border-dashed border-framer-blue/40 bg-framer-blue/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-framer-blue/10 flex items-center justify-center">
                <FolderOpen size={20} className="text-framer-blue" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">一键上传商品文件夹</div>
                <div className="text-xs text-runway-text-muted">自动识别图片、JSON 描述和商品信息</div>
              </div>
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-runway-border hover:bg-runway-surface transition-colors"
                title="查看识别规则"
              >
                <HelpCircle size={12} /> 识别规则
              </button>
            </div>

            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore — webkitdirectory is non-standard but widely supported
              webkitdirectory="true"
              directory=""
              multiple
              className="hidden"
              onChange={e => { handleFolder(e.target.files); e.currentTarget.value = ''; }}
            />

            {!folderName ? (
              <div
                onClick={() => folderInputRef.current?.click()}
                className="border-2 border-dashed border-framer-blue/30 rounded-xl p-5 text-center hover:border-framer-blue/60 transition-colors cursor-pointer bg-runway-surface"
              >
                <FolderOpen size={24} className="mx-auto mb-2 text-framer-blue" />
                <div className="text-sm font-medium text-runway-text">点击选择商品文件夹</div>
                <div className="text-xs text-runway-text-muted mt-1">系统会自动提取图片和 meta.json / summary.json</div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-xl bg-runway-surface border border-framer-blue/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-framer-blue/10 flex items-center justify-center shrink-0">
                    <FolderOpen size={18} className="text-framer-blue" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{folderName}</div>
                    <div className="text-xs text-runway-text-muted">已自动识别文件夹内容</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowFolderPreview(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-runway-border hover:bg-runway-elevated transition-colors flex items-center gap-1"
                  >
                    <Eye size={14} /> 查看
                  </button>
                  <button
                    onClick={() => {
                      setFolderName('');
                      setFolderFiles([]);
                      setImages([]);
                      setDescFile(null);
                      setProductName('');
                      setPrice('');
                      setCategory('outdoor_gear');
                      setScriptTemplate('');
                      setAutoFilled([]);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-runway-border hover:bg-runway-elevated transition-colors"
                  >
                    重新选择
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Images upload */}
          <div className="p-6 rounded-2xl border border-runway-border bg-runway-surface">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-framer-blue/10 flex items-center justify-center">
                <Images size={20} className="text-framer-blue" />
              </div>
              <div>
                <div className="text-sm font-medium">商品图片 <span className="text-error">*</span></div>
                <div className="text-xs text-runway-text-muted">主图、场景图、细节图等</div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => { handleFiles(e.target.files); e.currentTarget.value = ''; }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-runway-border rounded-xl p-6 text-center hover:border-runway-borderStrong transition-colors cursor-pointer"
            >
              <Upload size={24} className="mx-auto mb-2 text-runway-text-secondary" />
              <div className="text-sm text-runway-text-secondary">点击或拖拽上传图片</div>
              <div className="text-xs text-runway-text-muted mt-1">支持 JPG、PNG、WebP</div>
            </div>

            {images.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div key={`${img.name}-${idx}`} className="relative aspect-square rounded-lg border border-runway-border overflow-hidden group">
                    <img src={URL.createObjectURL(img)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <button
                      onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product text description upload */}
          <div className="p-6 rounded-2xl border border-runway-border bg-runway-surface">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <FileText size={20} className="text-success" />
              </div>
              <div>
                <div className="text-sm font-medium">商品文本信息</div>
                <div className="text-xs text-runway-text-muted">上传商品介绍、参数、卖点文案等（.txt / .json / .md）</div>
              </div>
            </div>

            <input
              ref={descInputRef}
              type="file"
              accept=".txt,.json,.md"
              className="hidden"
              onChange={e => { handleDescFile(e.target.files); e.currentTarget.value = ''; }}
            />

            {!descFile ? (
              <div
                onClick={() => descInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); handleDescFile(e.dataTransfer.files); }}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-runway-border rounded-xl p-5 text-center hover:border-runway-borderStrong transition-colors cursor-pointer"
              >
                <FileText size={22} className="mx-auto mb-2 text-runway-text-secondary" />
                <div className="text-sm text-runway-text-secondary">点击或拖拽上传商品文本信息</div>
                <div className="text-xs text-runway-text-muted mt-1">支持 .txt / .json / .md</div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-xl bg-runway-elevated border border-runway-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-success" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{descFile.name}</div>
                    <div className="text-xs text-runway-text-muted">{(descFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openFilePreview(descFile)}
                    className="p-2 rounded-lg hover:bg-runway-surface text-runway-text-secondary transition-colors"
                    title="预览"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => setDescFile(null)}
                    className="p-2 rounded-lg hover:bg-runway-surface text-runway-text-secondary transition-colors"
                    title="移除"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="p-6 rounded-2xl border border-runway-border bg-runway-surface">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-framer-blue/10 flex items-center justify-center">
                <FileType2 size={20} className="text-framer-blue" />
              </div>
              <div className="text-sm font-medium">商品信息</div>
            </div>

            {autoFilled.length > 0 && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20 text-success text-sm">
                <CheckCircle2 size={16} />
                <span>已自动识别并填充：{autoFilled.join('、')}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-runway-text-secondary block mb-1.5">商品名称 <span className="text-error">*</span></label>
                <input
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="例如：户外多功能折叠刀"
                  className="w-full h-10 bg-runway-elevated border border-runway-border rounded-lg px-3 text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                />
              </div>
              <div>
                <label className="text-xs text-runway-text-secondary block mb-1.5">价格（USD）<span className="text-error">*</span></label>
                <input
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="29.99"
                  className="w-full h-10 bg-runway-elevated border border-runway-border rounded-lg px-3 text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                />
              </div>
              <div>
                <label className="text-xs text-runway-text-secondary block mb-1.5">类目 <span className="text-error">*</span></label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full h-10 bg-runway-elevated border border-runway-border rounded-lg px-3 text-sm text-runway-text focus:outline-none focus:border-framer-blue"
                >
                  <option value="outdoor_gear">户外运动装备</option>
                  <option value="shoes">鞋类</option>
                  <option value="apparel">服装</option>
                  <option value="default">通用</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-runway-text-secondary block mb-1.5">脚本模板（可选）</label>
                <textarea
                  value={scriptTemplate}
                  onChange={e => setScriptTemplate(e.target.value)}
                  placeholder="如果你已有固定脚本结构，可以贴在这里，AI 会参考它生成口播..."
                  rows={3}
                  className="w-full bg-runway-elevated border border-runway-border rounded-lg px-3 py-2 text-sm text-runway-text focus:outline-none focus:border-framer-blue resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {pipelineError && (
          <div className="mt-4 p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
            {pipelineError}
          </div>
        )}

        {!canStart && !pipelineError && missingItems.length > 0 && (
          <div className="mt-4 flex items-center gap-2 p-4 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm">
            <AlertCircle size={16} />
            <span>请补充缺失信息后再开始，避免浪费 AI 生成额度：{missingItems.join('、')}</span>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="h-11 px-6 rounded-full bg-framer-blue text-runway-text text-sm font-medium hover:bg-framer-blue/90 disabled:opacity-40 transition-colors flex items-center gap-2 btn-interactive cursor-pointer"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : (mode === 'fast' ? <Zap size={16} /> : <Sparkles size={16} />)}
            {loading ? (mode === 'fast' ? '直出中...' : 'AI 规划中...') : (mode === 'fast' ? '一键生成视频' : '开始智能规划')}
          </button>
        </div>
      </div>
    </div>
  );
}
