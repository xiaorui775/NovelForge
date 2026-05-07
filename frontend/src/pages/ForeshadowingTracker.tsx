import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { foreshadowingApi, Foreshadowing, ForeshadowingScanResult } from '../api/foreshadowing';
import { modelsApi, ModelConfig } from '../api/models';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: '待回收', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  resolved: { label: '已回收', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  abandoned: { label: '已放弃', color: 'text-parchment-dim/40', bg: 'bg-parchment-dim/5' },
};

export default function ForeshadowingTracker() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();

  const [items, setItems] = useState<Foreshadowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ForeshadowingScanResult[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadItems();
      loadModels();
    }
  }, [projectId]);

  const loadItems = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await foreshadowingApi.list(projectId);
      setItems(data);
    } catch {
      showToast('error', '加载伏笔列表失败');
    }
    setLoading(false);
  };

  const loadModels = async () => {
    try {
      const { data } = await modelsApi.list();
      const activeModels = data.filter((m) => m.is_active);
      setModels(activeModels);
      if (activeModels.length > 0) setSelectedModel(activeModels[0].id);
    } catch { /* silent */ }
  };

  const handleAdd = async () => {
    if (!projectId || !newDesc.trim()) return;
    try {
      await foreshadowingApi.create(projectId, { description: newDesc.trim(), notes: newNotes.trim() || undefined });
      setNewDesc('');
      setNewNotes('');
      setShowAdd(false);
      showToast('success', '伏笔已添加');
      loadItems();
    } catch {
      showToast('error', '添加失败');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await foreshadowingApi.update(id, { status });
      showToast('success', '状态已更新');
      loadItems();
    } catch {
      showToast('error', '更新失败');
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await foreshadowingApi.update(id, { description: editDesc.trim(), notes: editNotes.trim() || undefined });
      setEditingId(null);
      showToast('success', '伏笔已更新');
      loadItems();
    } catch {
      showToast('error', '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await foreshadowingApi.delete(id);
      showToast('success', '伏笔已删除');
      loadItems();
    } catch {
      showToast('error', '删除失败');
    }
  };

  const handleScan = async () => {
    if (!projectId || !selectedModel) return;
    setScanning(true);
    setScanResults([]);
    try {
      const { data } = await foreshadowingApi.scan(projectId, selectedModel);
      setScanResults(data);
      if (data.length === 0) {
        showToast('info', '未发现新的伏笔');
      } else {
        showToast('success', `发现 ${data.length} 个伏笔`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = axiosErr.response?.data?.detail || axiosErr.message || '扫描失败';
      showToast('error', msg);
    }
    setScanning(false);
  };

  const handleAcceptScan = async (result: ForeshadowingScanResult) => {
    if (!projectId) return;
    try {
      await foreshadowingApi.create(projectId, {
        description: result.description,
        plant_chapter_id: result.plant_chapter_id || undefined,
      });
      setScanResults((prev) => prev.filter((r) => r !== result));
      showToast('success', '伏笔已收录');
      loadItems();
    } catch {
      showToast('error', '收录失败');
    }
  };

  const openStats = items.filter((i) => i.status === 'open').length;
  const resolvedStats = items.filter((i) => i.status === 'resolved').length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">伏笔追踪</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input text-xs"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={handleScan}
            disabled={scanning || !selectedModel}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            {scanning ? '扫描中...' : 'AI 扫描'}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm">
            {showAdd ? '取消' : '手动添加'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 mb-6">
        <div className="card-compact flex-1">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">总伏笔</p>
          <p className="text-2xl font-display font-bold text-parchment mt-1">{items.length}</p>
        </div>
        <div className="card-compact flex-1">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">待回收</p>
          <p className="text-2xl font-display font-bold text-amber-400 mt-1">{openStats}</p>
        </div>
        <div className="card-compact flex-1">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">已回收</p>
          <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{resolvedStats}</p>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mb-6 animate-fade-in">
          <div className="section-title mb-3">添加伏笔</div>
          <textarea
            className="input w-full mb-3"
            rows={2}
            placeholder="描述伏笔内容..."
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <textarea
            className="input w-full mb-3"
            rows={2}
            placeholder="备注（可选）..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <button onClick={handleAdd} disabled={!newDesc.trim()} className="btn-primary text-sm disabled:opacity-50">
            添加
          </button>
        </div>
      )}

      {/* AI scan results */}
      {scanResults.length > 0 && (
        <div className="card mb-6 animate-fade-in">
          <div className="section-title mb-3">AI 扫描结果</div>
          <p className="text-xs text-parchment-dim/50 mb-4">以下伏笔由 AI 识别，点击"收录"添加到追踪列表</p>
          <div className="space-y-3">
            {scanResults.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-4 bg-study-deep/50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-parchment">{r.description}</p>
                  <p className="text-[11px] text-parchment-dim/40 mt-1">
                    第{r.plant_chapter_number}章 · 置信度 {(r.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleAcceptScan(r)} className="btn-ghost text-xs px-2 py-1 text-emerald-400">
                    收录
                  </button>
                  <button onClick={() => setScanResults((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost text-xs px-2 py-1 text-parchment-dim/40">
                    忽略
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health card */}
      {items.length > 0 && (() => {
        const active = items.filter(f => f.status === 'open');
        const resolved = items.filter(f => f.status === 'resolved');
        const abandoned = items.filter(f => f.status === 'abandoned');
        const stale = active.filter(f => {
          const plantNum = (f as any).plant_chapter?.chapter_number;
          return plantNum && currentProject && (currentProject as any).current_chapter && (currentProject as any).current_chapter - plantNum > 10;
        });
        return (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="card-compact text-center">
              <p className="text-2xl font-bold text-amber-400">{active.length}</p>
              <p className="text-[10px] text-parchment-dim/40 mt-0.5">活跃</p>
            </div>
            <div className="card-compact text-center">
              <p className="text-2xl font-bold text-emerald-400">{resolved.length}</p>
              <p className="text-[10px] text-parchment-dim/40 mt-0.5">已回收</p>
            </div>
            <div className="card-compact text-center">
              <p className="text-2xl font-bold text-parchment-dim/30">{abandoned.length}</p>
              <p className="text-[10px] text-parchment-dim/40 mt-0.5">已放弃</p>
            </div>
            <div className="card-compact text-center">
              <p className={`text-2xl font-bold ${stale.length > 0 ? 'text-red-400' : 'text-parchment-dim/20'}`}>{stale.length}</p>
              <p className="text-[10px] text-parchment-dim/40 mt-0.5">过期</p>
            </div>
          </div>
        );
      })()}

      {/* Foreshadowing list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center gap-3 text-parchment-dim/40">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">暂无伏笔</p>
          <p className="text-parchment-dim/50 text-sm">使用 AI 扫描自动识别伏笔，或手动添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="card group">
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      className="input w-full"
                      rows={2}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                    <textarea
                      className="input w-full"
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="备注..."
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(item.id)} className="btn-primary text-xs">保存</button>
                      <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-parchment leading-relaxed">{item.description}</p>
                      {item.notes && (
                        <p className="text-xs text-parchment-dim/40 mt-1">{item.notes}</p>
                      )}
                      <p className="text-[10px] text-parchment-dim/30 mt-2">
                        创建于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.status !== 'resolved' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'resolved')}
                            className="btn-ghost text-[11px] px-2 py-0.5 text-emerald-400"
                            title="标记已回收"
                          >
                            回收
                          </button>
                        )}
                        {item.status !== 'abandoned' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'abandoned')}
                            className="btn-ghost text-[11px] px-2 py-0.5 text-parchment-dim/40"
                            title="标记已放弃"
                          >
                            放弃
                          </button>
                        )}
                        {item.status !== 'open' && (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'open')}
                            className="btn-ghost text-[11px] px-2 py-0.5 text-amber-400"
                            title="重新打开"
                          >
                            重开
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditDesc(item.description);
                            setEditNotes(item.notes || '');
                          }}
                          className="btn-ghost text-[11px] px-2 py-0.5 text-parchment-dim/50"
                          title="编辑"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="btn-ghost text-[11px] px-2 py-0.5 text-red-400/60 hover:text-red-400"
                          title="删除"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
