import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { storyBibleApi, StoryBibleEntry, StoryBibleCreate, BIBLE_CATEGORIES } from '../api/storyBible';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import { useProjectStore } from '../stores/projectStore';

export default function StoryBible() {
  const { id: projectId } = useParams<{ id: string }>();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const { currentProject, fetchProject } = useProjectStore();

  const [entries, setEntries] = useState<StoryBibleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StoryBibleEntry[] | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StoryBibleEntry | null>(null);
  const [form, setForm] = useState<StoryBibleCreate>({ title: '', content: '', category: 'custom', tags: '' });

  // Detail view
  const [selectedEntry, setSelectedEntry] = useState<StoryBibleEntry | null>(null);

  useEffect(() => {
    if (projectId) {
      loadEntries();
      fetchProject(projectId);
    }
  }, [projectId, activeCategory, fetchProject]);

  const loadEntries = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await storyBibleApi.list(projectId, activeCategory ?? undefined);
      setEntries(data);
    } catch { showToast('error', '加载故事圣经失败'); }
    setLoading(false);
  };

  const handleSearch = useCallback(async () => {
    if (!projectId || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const { data } = await storyBibleApi.search(projectId, searchQuery.trim());
      setSearchResults(data);
    } catch { showToast('error', '搜索失败'); }
  }, [projectId, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !form.title.trim()) return;
    try {
      if (editing) {
        await storyBibleApi.update(editing.id, form);
        showToast('success', '条目更新成功');
      } else {
        await storyBibleApi.create(projectId, form);
        showToast('success', '条目创建成功');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ title: '', content: '', category: activeCategory || 'custom', tags: '' });
      loadEntries();
    } catch { showToast('error', '操作失败'); }
  };

  const handleEdit = (entry: StoryBibleEntry) => {
    setEditing(entry);
    setForm({ title: entry.title, content: entry.content, category: entry.category, tags: entry.tags });
    setShowForm(true);
    setSelectedEntry(null);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!await confirm({ message: `确定删除 "${title}" 吗？`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await storyBibleApi.delete(id);
      showToast('success', '已删除');
      if (selectedEntry?.id === id) setSelectedEntry(null);
      loadEntries();
    } catch { showToast('error', '删除失败'); }
  };

  const displayEntries = searchResults ?? entries;

  const getCategoryLabel = (value: string) =>
    BIBLE_CATEGORIES.find(c => c.value === value)?.label ?? value;

  const getCategoryIcon = (value: string) => {
    const icons: Record<string, JSX.Element> = {
      character: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      worldview: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
      plot: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" /></svg>,
      timeline: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      custom: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    };
    return icons[value] ?? icons.custom;
  };

  return (
    <div className="animate-fade-in h-[calc(100vh-7rem)] flex gap-6">
      {Dialog}

      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col">
        <div className="mb-6">
          <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name || '返回项目详情'}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">故事圣经</h1>
          <div className="mt-3 rounded-md border border-ink/20 bg-ink/5 px-3 py-2 text-[11px] text-parchment-dim/55 leading-relaxed">
            建议先维护术语库与角色/世界观；只有在长篇、多线叙事或一致性冲突较多时，再使用故事圣经。
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-parchment-dim/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            className="input w-full pl-9 py-1.5 text-xs"
            placeholder="搜索条目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category nav */}
        <nav className="space-y-0.5 flex-1">
          <button
            onClick={() => { setActiveCategory(null); setSearchQuery(''); setSearchResults(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
              activeCategory === null && !searchResults ? 'bg-ink/15 text-parchment' : 'text-parchment-dim/60 hover:text-parchment hover:bg-study-glow'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
            </svg>
            全部
          </button>
          {BIBLE_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setActiveCategory(cat.value); setSearchQuery(''); setSearchResults(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                activeCategory === cat.value ? 'bg-ink/15 text-parchment' : 'text-parchment-dim/60 hover:text-parchment hover:bg-study-glow'
              }`}
            >
              {getCategoryIcon(cat.value)}
              {cat.label}
            </button>
          ))}
        </nav>

        {/* Add button */}
        <button
          onClick={() => {
            setEditing(null);
            setForm({ title: '', content: '', category: activeCategory || 'custom', tags: '' });
            setShowForm(true);
            setSelectedEntry(null);
          }}
          className="btn-primary text-sm w-full mt-4"
        >
          + 新建条目
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-6 min-w-0">
        {/* Entry list */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-parchment">
              {searchResults ? `搜索: "${searchQuery}"` : activeCategory ? getCategoryLabel(activeCategory) : '全部条目'}
              <span className="text-xs text-parchment-dim/30 ml-2">({displayEntries.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="animate-pulse card-compact"><div className="h-16 bg-study-surface rounded" /></div>)}</div>
          ) : displayEntries.length === 0 ? (
            <div className="card text-center py-16 flex-1 flex items-center justify-center">
              <div>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
                  <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="font-display text-lg text-parchment mb-1">
                  {searchResults ? '没有找到匹配的条目' : '还没有条目'}
                </p>
                <p className="text-parchment-dim/50 text-sm mb-6">
                  {searchResults ? '换个关键词试试' : '创建条目来管理你的故事设定'}
                </p>
                {!searchResults && (
                  <button onClick={() => { setEditing(null); setForm({ title: '', content: '', category: activeCategory || 'custom', tags: '' }); setShowForm(true); }} className="btn-primary text-sm">
                    + 创建第一个条目
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1 overflow-y-auto flex-1 pr-1">
              {displayEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => { setSelectedEntry(entry); setShowForm(false); }}
                  className={`flex items-start gap-3 py-3 px-4 rounded-lg cursor-pointer transition-all group ${
                    selectedEntry?.id === entry.id ? 'bg-ink/15 border border-ink/20' : 'hover:bg-study-glow border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-parchment text-sm truncate">{entry.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-study-surface text-parchment-dim/40 flex-shrink-0">
                        {getCategoryLabel(entry.category)}
                      </span>
                    </div>
                    {entry.content && (
                      <p className="text-xs text-parchment-dim/35 mt-1 line-clamp-2">{entry.content}</p>
                    )}
                    {entry.tags && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {entry.tags.split(',').filter(Boolean).map((tag, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink/10 text-parchment-dim/40">{tag.trim()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pt-0.5">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }} className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id, entry.title); }} className="p-1.5 text-parchment-dim/30 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail / Edit panel */}
        {(selectedEntry || showForm) && (
          <div className="w-96 flex-shrink-0 card border-ink/20 animate-slide-up overflow-y-auto">
            {showForm ? (
              /* Edit/Create Form */
              <div>
                <h3 className="font-display text-lg font-semibold text-parchment mb-5">
                  {editing ? '编辑条目' : '新建条目'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">标题 *</label>
                    <input type="text" className="input w-full" placeholder="条目标题..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">分类</label>
                    <div className="flex flex-wrap gap-1.5">
                      {BIBLE_CATEGORIES.map((c) => (
                        <button key={c.value} type="button" onClick={() => setForm({ ...form, category: c.value })}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${form.category === c.value ? 'bg-ink text-study-deep' : 'bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border'}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">内容</label>
                    <textarea className="textarea w-full h-48" placeholder="详细描述..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">标签（逗号分隔）</label>
                    <input type="text" className="input w-full" placeholder="标签1, 标签2, ..." value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" className="btn-primary text-sm">{editing ? '保存' : '创建'}</button>
                    <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary text-sm">取消</button>
                  </div>
                </form>
              </div>
            ) : selectedEntry ? (
              /* Detail View */
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-study-surface text-parchment-dim/40">
                      {getCategoryLabel(selectedEntry.category)}
                    </span>
                    <h3 className="font-display text-xl font-bold text-parchment mt-2">{selectedEntry.title}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(selectedEntry)} className="p-2 text-parchment-dim/40 hover:text-ink transition-colors rounded-md hover:bg-ink/10">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(selectedEntry.id, selectedEntry.title)} className="p-2 text-parchment-dim/40 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                {selectedEntry.tags && (
                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {selectedEntry.tags.split(',').filter(Boolean).map((tag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-ink/10 text-parchment-dim/50">{tag.trim()}</span>
                    ))}
                  </div>
                )}

                <div className="prose prose-invert max-w-none">
                  {selectedEntry.content ? (
                    <div className="text-sm text-parchment/80 whitespace-pre-wrap leading-relaxed">{selectedEntry.content}</div>
                  ) : (
                    <p className="text-parchment-dim/30 text-sm italic">暂无内容</p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-study-border text-[10px] text-parchment-dim/25">
                  创建于 {new Date(selectedEntry.created_at).toLocaleString('zh-CN')}
                  {selectedEntry.updated_at !== selectedEntry.created_at && (
                    <> · 更新于 {new Date(selectedEntry.updated_at).toLocaleString('zh-CN')}</>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
