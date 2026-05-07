import { useEffect, useState } from 'react';
import { worldviewsApi, Worldview, WorldviewCreate } from '../api/worldviews';
import { charactersApi, Character } from '../api/characters';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';

export default function WorldviewManager() {
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [worldviews, setWorldviews] = useState<Worldview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Worldview | null>(null);
  const [form, setForm] = useState<WorldviewCreate>({ name: '', description: '', rules: '' });

  // Character association state
  const [expandedWorldview, setExpandedWorldview] = useState<string | null>(null);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [linkedCharacterIds, setLinkedCharacterIds] = useState<string[]>([]);
  const [showCharSelect, setShowCharSelect] = useState(false);

  useEffect(() => { loadWorldviews(); }, []);

  const loadWorldviews = async () => {
    setLoading(true);
    try {
      const { data } = await worldviewsApi.list();
      setWorldviews(data);
    } catch { showToast('error', '加载世界观失败'); }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await worldviewsApi.update(editing.id, form);
        showToast('success', '世界观更新成功');
      } else {
        await worldviewsApi.create(form);
        showToast('success', '世界观创建成功');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', description: '', rules: '' });
      loadWorldviews();
    } catch { showToast('error', '操作失败'); }
  };

  const handleEdit = (worldview: Worldview) => {
    setEditing(worldview);
    setForm({ name: worldview.name, description: worldview.description || '', rules: worldview.rules || '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `确定删除世界观 "${name}" 吗？`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await worldviewsApi.delete(id);
      showToast('success', '已删除');
      loadWorldviews();
    } catch { showToast('error', '删除失败'); }
  };

  const toggleCharacterPanel = async (worldviewId: string) => {
    if (expandedWorldview === worldviewId) {
      setExpandedWorldview(null);
      return;
    }
    try {
      const [{ data: chars }, { data: linked }] = await Promise.all([
        charactersApi.list(),
        worldviewsApi.getCharacters(worldviewId),
      ]);
      setAllCharacters(chars);
      setLinkedCharacterIds(linked.map(c => c.id));
      setExpandedWorldview(worldviewId);
      setShowCharSelect(false);
    } catch { showToast('error', '加载数据失败'); }
  };

  const handleLinkCharacter = async (characterId: string) => {
    if (!expandedWorldview) return;
    try {
      await worldviewsApi.addCharacter(expandedWorldview, characterId);
      setLinkedCharacterIds([...linkedCharacterIds, characterId]);
      setShowCharSelect(false);
      showToast('success', '角色已关联');
    } catch { showToast('error', '关联失败'); }
  };

  const handleUnlinkCharacter = async (characterId: string) => {
    if (!expandedWorldview) return;
    if (!await confirm({ message: '确定取消关联此角色？', variant: 'default', confirmText: '取消关联' })) return;
    try {
      await worldviewsApi.removeCharacter(expandedWorldview, characterId);
      setLinkedCharacterIds(linkedCharacterIds.filter(id => id !== characterId));
      showToast('success', '已取消关联');
    } catch { showToast('error', '操作失败'); }
  };

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">世界观</h1>
          <p className="text-parchment-dim/60 mt-1 text-sm">构建你的小说世界</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: '', description: '', rules: '' }); setShowForm(true); }} className="btn-primary text-sm">
          + 新建世界观
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-5">{editing ? '编辑世界观' : '新建世界观'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">世界观名称 *</label>
              <input type="text" className="input w-full" placeholder="如：九天大陆、赛博朋克2077..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">世界观描述</label>
              <textarea className="textarea w-full h-24" placeholder="描述这个世界的背景设定..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">世界规则</label>
              <textarea className="textarea w-full h-24" placeholder="如：修炼体系、魔法规则、科技水平..." value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary text-sm">{editing ? '保存' : '创建'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="animate-pulse card-compact"><div className="h-16 bg-study-surface rounded" /></div>)}</div>
      ) : worldviews.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">还没有世界观</p>
          <p className="text-parchment-dim/50 text-sm mb-6">创建世界观，定义你的小说宇宙</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 创建第一个世界观</button>
        </div>
      ) : (
        <div className="space-y-2">
          {worldviews.map((worldview, i) => (
            <div key={worldview.id} className="stagger-item card-compact group" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-parchment text-sm">{worldview.name}</h4>
                    <p className="text-[11px] text-parchment-dim/30 mt-0.5">创建于 {new Date(worldview.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleCharacterPanel(worldview.id)} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10" title="关联角色">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                  </button>
                  <button onClick={() => handleEdit(worldview)} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(worldview.id, worldview.name)} className="p-1.5 text-parchment-dim/30 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              {worldview.description && <p className="text-xs text-parchment-dim/40 mt-2.5 line-clamp-2 leading-relaxed">{worldview.description}</p>}

              {/* Character association panel */}
              {expandedWorldview === worldview.id && (
                <div className="mt-3 pt-3 border-t border-study-border/30 animate-slide-up">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">关联角色</span>
                    <button onClick={() => setShowCharSelect(!showCharSelect)} className="text-[11px] text-ink hover:underline">
                      + 关联角色
                    </button>
                  </div>
                  {showCharSelect && (
                    <div className="bg-study-deep rounded-lg p-3 mb-2">
                      <div className="flex flex-wrap gap-1.5">
                        {allCharacters.filter(c => !linkedCharacterIds.includes(c.id)).map(c => (
                          <button
                            key={c.id}
                            onClick={() => handleLinkCharacter(c.id)}
                            className="px-2.5 py-1 rounded-md text-[11px] bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border hover:border-ink/20 transition-all"
                          >
                            {c.name}
                          </button>
                        ))}
                        {allCharacters.filter(c => !linkedCharacterIds.includes(c.id)).length === 0 && (
                          <p className="text-[11px] text-parchment-dim/30">所有角色已关联</p>
                        )}
                      </div>
                    </div>
                  )}
                  {linkedCharacterIds.length === 0 ? (
                    <p className="text-[11px] text-parchment-dim/30">暂未关联角色</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {linkedCharacterIds.map(cid => {
                        const char = allCharacters.find(c => c.id === cid);
                        return (
                          <div key={cid} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-study-deep border border-study-border/40 group/chip">
                            <span className="text-[11px] text-parchment-dim/60">{char?.name || '未知'}</span>
                            <button onClick={() => handleUnlinkCharacter(cid)} className="text-parchment-dim/20 hover:text-red-400 transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
