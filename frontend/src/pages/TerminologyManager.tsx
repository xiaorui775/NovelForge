import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { terminologyApi, Terminology, TerminologyCreate } from '../api/terminology';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { useConfirm } from '../components/ConfirmDialog';

export default function TerminologyManager() {
  const { id: projectId } = useParams<{ id: string }>();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const { currentProject, fetchProject } = useProjectStore();
  const [terms, setTerms] = useState<Terminology[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Terminology | null>(null);
  const [form, setForm] = useState<TerminologyCreate>({ term: '', category: '', description: '' });

  const categories = ['地名', '人名', '组织', '功法', '物品', '事件', '其他'];

  useEffect(() => {
    if (projectId) {
      loadTerms();
      fetchProject(projectId);
    }
  }, [projectId, fetchProject]);

  const loadTerms = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await terminologyApi.list(projectId);
      setTerms(data);
    } catch { showToast('error', '加载术语失败'); }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    try {
      if (editing) {
        await terminologyApi.update(editing.id, form);
        showToast('success', '术语更新成功');
      } else {
        await terminologyApi.create(projectId, form);
        showToast('success', '术语创建成功');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ term: '', category: '', description: '' });
      loadTerms();
    } catch { showToast('error', '操作失败'); }
  };

  const handleEdit = (term: Terminology) => {
    setEditing(term);
    setForm({ term: term.term, category: term.category || '', description: term.description || '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string, term: string) => {
    if (!await confirm({ message: `确定删除术语 "${term}" 吗？`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await terminologyApi.delete(id);
      showToast('success', '已删除');
      loadTerms();
    } catch { showToast('error', '删除失败'); }
  };

  const grouped = terms.reduce((acc, term) => {
    const cat = term.category || '其他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(term);
    return acc;
  }, {} as Record<string, Terminology[]>);

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="mb-8">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {currentProject?.name || '返回项目详情'}
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">术语库</h1>
            <p className="text-parchment-dim/60 mt-1 text-sm">管理专有名词，保持一致性</p>
          </div>
          <button onClick={() => { setEditing(null); setForm({ term: '', category: '', description: '' }); setShowForm(true); }} className="btn-primary text-sm">
            + 添加术语
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-5">{editing ? '编辑术语' : '添加术语'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">术语名称 *</label>
                <input type="text" className="input w-full" placeholder="如：天元大陆、九阳神功..." value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">分类</label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${form.category === c ? 'bg-ink text-study-deep' : 'bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">描述</label>
              <textarea className="textarea w-full h-16" placeholder="术语的详细说明..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary text-sm">{editing ? '保存' : '添加'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="animate-pulse card-compact"><div className="h-10 bg-study-surface rounded" /></div>)}</div>
      ) : terms.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">还没有术语</p>
          <p className="text-parchment-dim/50 text-sm mb-6">添加专有名词，保持小说中的术语一致性</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 添加第一个术语</button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, categoryTerms]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-ink" />
                <span className="text-xs text-parchment-dim/60 uppercase tracking-wider font-medium">{category}</span>
                <span className="text-[11px] text-parchment-dim/25">({categoryTerms.length})</span>
              </div>
              <div className="space-y-1">
                {categoryTerms.map((term) => (
                  <div key={term.id} className="flex items-center justify-between py-2.5 px-4 rounded-lg hover:bg-study-glow transition-colors group">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-parchment text-sm">{term.term}</span>
                      {term.description && <span className="text-xs text-parchment-dim/35 truncate max-w-xs">{term.description}</span>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(term)} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(term.id, term.term)} className="p-1.5 text-parchment-dim/30 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
