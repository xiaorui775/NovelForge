import { useEffect, useState } from 'react';
import { charactersApi, Character, CharacterCreate, CharacterRelation } from '../api/characters';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import CharacterGraph from '../components/CharacterGraph';

export default function CharacterLibrary() {
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [allRelations, setAllRelations] = useState<CharacterRelation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [form, setForm] = useState<CharacterCreate>({
    name: '', role_type: '', description: '', personality: '', background: '',
  });

  // Relations state
  const [expandedRelations, setExpandedRelations] = useState<string | null>(null);
  const [relations, setRelations] = useState<CharacterRelation[]>([]);
  const [showRelationFormFor, setShowRelationFormFor] = useState<string | null>(null);
  const [relationForm, setRelationForm] = useState({ to_character_id: '', relation_type: '', description: '' });

  useEffect(() => { loadCharacters(); }, []);

  const loadCharacters = async () => {
    setLoading(true);
    try {
      const { data } = await charactersApi.list();
      setCharacters(data);
    } catch { showToast('error', '加载角色失败'); }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await charactersApi.update(editing.id, form);
        showToast('success', '角色更新成功');
      } else {
        await charactersApi.create(form);
        showToast('success', '角色创建成功');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', role_type: '', description: '', personality: '', background: '' });
      loadCharacters();
    } catch { showToast('error', '操作失败'); }
  };

  const handleEdit = (character: Character) => {
    setEditing(character);
    setForm({
      name: character.name, role_type: character.role_type || '',
      description: character.description || '', personality: character.personality || '',
      background: character.background || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `确定删除角色 "${name}" 吗？`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await charactersApi.delete(id);
      showToast('success', '已删除');
      loadCharacters();
    } catch { showToast('error', '删除失败'); }
  };

  const loadRelations = async (characterId: string) => {
    if (expandedRelations === characterId) {
      setExpandedRelations(null);
      setRelations([]);
      setShowRelationFormFor(null);
      return;
    }
    try {
      const { data } = await charactersApi.listRelations(characterId);
      setRelations(data);
      setExpandedRelations(characterId);
      setShowRelationFormFor(null);
    } catch { showToast('error', '加载关系失败'); }
  };

  const handleAddRelation = async () => {
    if (!expandedRelations || !relationForm.to_character_id || !relationForm.relation_type) return;
    try {
      await charactersApi.createRelation({
        from_character_id: expandedRelations,
        to_character_id: relationForm.to_character_id,
        relation_type: relationForm.relation_type,
        description: relationForm.description || undefined,
      });
      showToast('success', '关系已添加');
      setRelationForm({ to_character_id: '', relation_type: '', description: '' });
      setShowRelationFormFor(null);
      loadRelations(expandedRelations);
    } catch { showToast('error', '添加失败'); }
  };

  const handleDeleteRelation = async (relationId: string) => {
    if (!await confirm({ message: '确定删除此关系？', variant: 'danger', confirmText: '删除' })) return;
    try {
      await charactersApi.deleteRelation(relationId);
      showToast('success', '已删除');
      if (expandedRelations) loadRelations(expandedRelations);
    } catch { showToast('error', '删除失败'); }
  };

  const roleTypes = ['主角', '女主', '配角', '反派', '导师', '路人'];

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">角色库</h1>
          <p className="text-parchment-dim/60 mt-1 text-sm">管理你的小说角色</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-study-deep rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-ink text-study-deep' : 'text-parchment-dim/50 hover:text-parchment'}`}
            >
              列表
            </button>
            <button
              onClick={() => {
                setViewMode('graph');
                if (allRelations.length === 0) {
                  charactersApi.listAllRelations().then(res => setAllRelations(res.data)).catch(() => {});
                }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'graph' ? 'bg-ink text-study-deep' : 'text-parchment-dim/50 hover:text-parchment'}`}
            >
              关系图谱
            </button>
          </div>
          <button onClick={() => { setEditing(null); setForm({ name: '', role_type: '', description: '', personality: '', background: '' }); setShowForm(true); }} className="btn-primary text-sm">
            + 新建角色
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-5">
            {editing ? '编辑角色' : '新建角色'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">角色名称 *</label>
                <input type="text" className="input w-full" placeholder="角色名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">角色类型</label>
                <div className="flex flex-wrap gap-1.5">
                  {roleTypes.map((t) => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, role_type: t })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${form.role_type === t ? 'bg-ink text-study-deep' : 'bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">角色描述</label>
              <textarea className="textarea w-full h-20" placeholder="外貌、身份等基本描述..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">性格特点</label>
              <textarea className="textarea w-full h-16" placeholder="性格特征..." value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">背景故事</label>
              <textarea className="textarea w-full h-16" placeholder="角色背景..." value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary text-sm">{editing ? '保存' : '创建'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse card-compact"><div className="h-20 bg-study-surface rounded" /></div>
          ))}
        </div>
      ) : viewMode === 'graph' ? (
        <div className="card">
          <CharacterGraph characters={characters} relations={allRelations} width={700} height={500} />
        </div>
      ) : characters.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">还没有角色</p>
          <p className="text-parchment-dim/50 text-sm mb-6">创建角色，丰富你的小说世界</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 创建第一个角色</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {characters.map((character, i) => (
            <div key={character.id} className="stagger-item card-compact group" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-parchment text-sm">{character.name}</h4>
                    {character.role_type && <span className="tag text-[10px] mt-0.5">{character.role_type}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => loadRelations(character.id)} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10" title="角色关系">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.068a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.25" />
                    </svg>
                  </button>
                  <button onClick={() => handleEdit(character)} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(character.id, character.name)} className="p-1.5 text-parchment-dim/30 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-2.5 h-16 overflow-hidden">
                {character.description && (
                  <p className="text-xs text-parchment-dim/40 line-clamp-2 leading-relaxed" title={character.description}>{character.description}</p>
                )}
                {character.personality && (
                  <p className="text-xs text-parchment-dim/30 mt-1 line-clamp-1" title={character.personality}>
                    <span className="text-parchment-dim/50">性格：</span>{character.personality}
                  </p>
                )}
                {character.background && (
                  <p className="text-xs text-parchment-dim/30 mt-1 line-clamp-1" title={character.background}>
                    <span className="text-parchment-dim/50">背景：</span>{character.background}
                  </p>
                )}
              </div>

              {/* Relations section */}
              {expandedRelations === character.id && (
                <div className="mt-3 pt-3 border-t border-study-border/30 animate-slide-up">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">角色关系</span>
                    <button onClick={() => { setShowRelationFormFor(showRelationFormFor === character.id ? null : character.id); }} className="text-[11px] text-ink hover:underline">
                      + 添加关系
                    </button>
                  </div>
                  {showRelationFormFor === character.id && (
                    <div className="bg-study-deep rounded-lg p-3 mb-2 space-y-2">
                      <select
                        className="input text-xs w-full"
                        value={relationForm.to_character_id}
                        onChange={(e) => setRelationForm({ ...relationForm, to_character_id: e.target.value })}
                      >
                        <option value="">选择目标角色</option>
                        {characters.filter(c => c.id !== character.id).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="input text-xs w-full"
                        placeholder="关系类型（如：师徒、兄弟、恋人、宿敌）"
                        value={relationForm.relation_type}
                        onChange={(e) => setRelationForm({ ...relationForm, relation_type: e.target.value })}
                      />
                      <input
                        type="text"
                        className="input text-xs w-full"
                        placeholder="描述（可选）"
                        value={relationForm.description}
                        onChange={(e) => setRelationForm({ ...relationForm, description: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleAddRelation} className="btn-primary text-[11px] py-1 px-3">添加</button>
                        <button onClick={() => setShowRelationFormFor(null)} className="btn-secondary text-[11px] py-1 px-3">取消</button>
                      </div>
                    </div>
                  )}
                  {relations.length === 0 ? (
                    <p className="text-[11px] text-parchment-dim/30">暂无关系</p>
                  ) : (
                    <div className="space-y-1.5">
                      {relations.map((rel) => {
                        const targetName = characters.find(c => c.id === rel.to_character_id)?.name || '未知';
                        return (
                          <div key={rel.id} className="flex items-center justify-between text-xs group/rel">
                            <div className="flex items-center gap-2">
                              <span className="tag text-[10px]">{rel.relation_type}</span>
                              <span className="text-parchment-dim/60">{targetName}</span>
                              {rel.description && <span className="text-parchment-dim/30">({rel.description})</span>}
                            </div>
                            <button onClick={() => handleDeleteRelation(rel.id)} className="p-1 text-parchment-dim/20 hover:text-red-400 opacity-0 group-hover/rel:opacity-100 transition-all">
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
