import { useState, useEffect } from 'react';
import { notesApi, ProjectNote, NoteCreate, CATEGORIES } from '../api/notes';
import { useUIStore } from '../stores/uiStore';

interface Props {
  projectId: string;
}

export default function ProjectNotes({ projectId }: Props) {
  const { showToast } = useUIStore();
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProjectNote | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NoteCreate>({ title: '', content: '', category: 'general' });

  useEffect(() => {
    loadNotes();
  }, [projectId, selectedCategory]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const { data } = await notesApi.list(projectId, selectedCategory || undefined);
      setNotes(data);
    } catch {
      showToast('error', '加载笔记失败');
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    try {
      const { data } = await notesApi.create(projectId, form);
      setNotes([data, ...notes]);
      setShowCreate(false);
      setForm({ title: '', content: '', category: 'general' });
      showToast('success', '笔记已创建');
    } catch {
      showToast('error', '创建失败');
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      const { data } = await notesApi.update(editing.id, {
        title: editing.title,
        content: editing.content,
        category: editing.category,
      });
      setNotes(notes.map((n) => (n.id === data.id ? data : n)));
      setEditing(null);
      showToast('success', '笔记已更新');
    } catch {
      showToast('error', '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notesApi.delete(id);
      setNotes(notes.filter((n) => n.id !== id));
      showToast('success', '笔记已删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
              !selectedCategory ? 'bg-ink/20 text-ink' : 'text-parchment-dim/40 hover:text-parchment-dim/60'
            }`}
          >
            全部
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(selectedCategory === cat.value ? null : cat.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                selectedCategory === cat.value ? 'bg-ink/20 text-ink' : 'text-parchment-dim/40 hover:text-parchment-dim/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-ghost text-xs flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新建笔记
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card-compact space-y-3">
          <input
            type="text"
            className="input w-full text-sm"
            placeholder="笔记标题"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <select
            className="input w-full text-sm py-1.5"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <textarea
            className="textarea w-full h-24 text-sm"
            placeholder="笔记内容..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn-primary text-xs">保存</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">取消</button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-20 bg-study-card rounded-lg" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-parchment-dim/30 text-sm">
          暂无笔记
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="card-compact group">
              {editing?.id === note.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    className="input w-full text-sm"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                  <select
                    className="input w-full text-sm py-1.5"
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <textarea
                    className="textarea w-full h-24 text-sm"
                    value={editing.content}
                    onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} className="btn-primary text-xs">保存</button>
                    <button onClick={() => setEditing(null)} className="btn-ghost text-xs">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-parchment text-sm">{note.title}</h4>
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-ink/10 text-parchment-dim/50">
                        {CATEGORIES.find((c) => c.value === note.category)?.label || note.category}
                      </span>
                    </div>
                    {note.content && (
                      <p className="text-xs text-parchment-dim/50 whitespace-pre-wrap line-clamp-3">
                        {note.content}
                      </p>
                    )}
                    <p className="text-[10px] text-parchment-dim/20 mt-1">
                      {new Date(note.updated_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button
                      onClick={() => setEditing(note)}
                      className="p-1 rounded text-parchment-dim/30 hover:text-ink transition-colors"
                      title="编辑"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1 rounded text-parchment-dim/30 hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
