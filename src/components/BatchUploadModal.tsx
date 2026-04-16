import { useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Images,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Monitor,
  FolderOpen,
} from 'lucide-react';
import * as api from '../api/client';

function BaseModal({ title, onClose, children, zIndex = 'z-50' }: { title: string; onClose: () => void; children: React.ReactNode; zIndex?: string }) {
  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/60 p-4`} onClick={onClose}>
      <div
        className="max-w-xl w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-runway-border bg-runway-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <BaseModal title="批量上传规则" onClose={onClose} zIndex="z-[60]">
      <div className="space-y-4 text-sm text-runway-text-secondary">
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">1. 文件结构</div>
          <div>请同时上传一个 CSV 文件和该批次涉及的所有商品图片。</div>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">2. CSV 必填列</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><code>product_id</code> — 商品唯一标识</li>
            <li><code>product_name</code> — 商品名称（用于脚本生成）</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">3. CSV 可选列</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><code>price</code> — 价格（如 89.99）</li>
            <li><code>category</code> — 类目（shoes / apparel / outdoor_gear / default）</li>
            <li><code>script_template</code> — 自定义脚本模板</li>
            <li><code>image_1</code>, <code>image_2</code>, <code>image_3</code>… — 显式指定图片文件名</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">4. 图片匹配规则（优先级从高到低）</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>如果 CSV 里有 <code>image_1/2/3…</code> 列，直接按列中的文件名匹配</li>
            <li>如果没有图片列，系统会自动匹配文件名以 <code>product_id</code> 开头的图片</li>
            <li>如果仍未匹配到，该商品将使用本批次全部图片作为公共素材池</li>
          </ul>
        </div>
        <div className="p-3 rounded-xl bg-runway-elevated border border-runway-border">
          <div className="font-medium text-runway-text mb-1">5. 数量限制</div>
          <div>单次最多支持 100 个商品，超出请分批上传。</div>
        </div>
      </div>
    </BaseModal>
  );
}

export function BatchUploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (batchId: string, count: number) => void;
}) {
  const [tab, setTab] = useState<'local' | 'online'>('local');
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const allowedExts = ['.csv', '.xlsx', '.xls'];

  const handleSheet = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setError('请上传 .csv 或 .xlsx / .xls 格式的文件');
      return;
    }
    setSpreadsheet(f);
    setError('');
  };

  const handleImages = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => [...prev, ...valid]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!spreadsheet) {
      setError('请先上传表格文件');
      return;
    }
    if (images.length === 0) {
      setError('请至少上传一张商品图片');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('spreadsheet', spreadsheet);
      images.forEach((img) => formData.append('images', img));
      const res = await api.uploadBatch(formData);
      onSuccess(res.batch_id, res.item_count);
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BaseModal title="批量生成视频" onClose={onClose}>
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex p-1 rounded-xl bg-runway-elevated border border-runway-border">
            <button
              onClick={() => setTab('local')}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                tab === 'local' ? 'bg-runway-surface shadow-sm text-runway-text' : 'text-runway-text-secondary hover:text-runway-text'
              }`}
            >
              本地上传
            </button>
            <button
              onClick={() => setTab('online')}
              className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                tab === 'online' ? 'bg-runway-surface shadow-sm text-runway-text' : 'text-runway-text-secondary hover:text-runway-text'
              }`}
            >
              在线文档
            </button>
          </div>

          {tab === 'local' ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-runway-text-secondary">
                  上传表格 + 商品图片，系统自动排队生成视频
                </div>
                <button
                  onClick={() => setShowRules(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-runway-border hover:bg-runway-elevated transition-colors cursor-pointer"
                >
                  <HelpCircle size={12} /> 规则说明
                </button>
              </div>

              {/* Spreadsheet upload */}
              <div className="p-4 rounded-2xl border border-runway-border bg-runway-page/60">
                <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                  <FileText size={16} className="text-framer-blue" />
                  商品表格（CSV / Excel）
                </div>
                <input
                  ref={sheetInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { handleSheet(e.target.files); e.currentTarget.value = ''; }}
                />
                {!spreadsheet ? (
                  <div
                    onClick={() => sheetInputRef.current?.click()}
                    className="border-2 border-dashed border-runway-border rounded-xl p-5 text-center hover:border-framer-blue/40 transition-colors cursor-pointer"
                  >
                    <Upload size={22} className="mx-auto mb-2 text-runway-text-secondary" />
                    <div className="text-sm text-runway-text-secondary">点击上传表格</div>
                    <div className="text-xs text-runway-textMuted mt-1">支持 CSV、Excel（.xlsx / .xls）</div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-runway-surface border border-runway-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-framer-blue" />
                      <span className="text-sm truncate">{spreadsheet.name}</span>
                    </div>
                    <button
                      onClick={() => setSpreadsheet(null)}
                      className="p-1 rounded hover:bg-runway-elevated text-runway-text-secondary cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Images upload */}
              <div className="p-4 rounded-2xl border border-runway-border bg-runway-page/60">
                <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                  <Images size={16} className="text-success" />
                  商品图片
                </div>
                <input
                  ref={imgInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { handleImages(e.target.files); e.currentTarget.value = ''; }}
                />
                <div
                  onClick={() => imgInputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); handleImages(e.dataTransfer.files); }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-runway-border rounded-xl p-5 text-center hover:border-success/40 transition-colors cursor-pointer"
                >
                  <Images size={22} className="mx-auto mb-2 text-runway-text-secondary" />
                  <div className="text-sm text-runway-text-secondary">点击或拖拽上传图片</div>
                  <div className="text-xs text-runway-textMuted mt-1">支持批量选择多张</div>
                </div>

                {images.length > 0 && (
                  <div className="mt-3 text-xs text-runway-textMuted">已上传 {images.length} 张图片</div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !spreadsheet || images.length === 0}
                className="w-full h-11 rounded-xl bg-framer-blue text-runway-text text-sm font-medium hover:bg-framer-blue/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {loading ? '提交中...' : '提交批量任务'}
              </button>
            </>
          ) : (
            <div className="p-5 rounded-2xl border border-runway-border bg-runway-page/60 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-runway-surface border border-runway-border flex items-center justify-center mx-auto">
                <Monitor size={24} className="text-runway-text-secondary" />
              </div>
              <div className="text-sm font-medium text-runway-text">在线文档导入</div>
              <div className="text-xs text-runway-text-secondary leading-relaxed">
                如需直接从 Google Sheets 或飞书多维表格拉取数据，<br />
                请先导出为 <b>CSV</b> 或 <b>Excel</b>，再切换至「本地上传」提交。<br />
                未来版本将支持粘贴文档链接自动同步。
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setTab('local')}
                  className="h-9 px-4 rounded-lg border border-runway-border bg-runway-surface text-runway-text text-xs font-medium hover:bg-runway-elevated transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <FolderOpen size={14} /> 切换到本地上传
                </button>
              </div>
            </div>
          )}
        </div>
      </BaseModal>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  );
}
