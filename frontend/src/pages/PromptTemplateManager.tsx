import { useEffect, useState } from 'react';
import { promptTemplatesApi, PromptTemplate, PromptTemplateCreate } from '../api/promptTemplates';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';

const templateTypes = [
  { value: 'chapter', label: '章节生成' },
  { value: 'continue', label: '续写' },
  { value: 'outline', label: '大纲生成' },
];

const defaultTemplateContent = `你是一位专业的{genre}小说作家。
请根据以下大纲和要求，撰写小说的第{chapter_number}章内容。

章节标题：{chapter_title}
章节概述：{chapter_summary}
详细大纲：{detail_outline}

前文摘要：
{prev_summaries}

专有名词（请保持一致）：
{terminologies}

参考风格：
{style_reference}

要求：
- 字数：{min_words}-{max_words}字
- 语言：{language}
- 对话占比：约{dialogue_ratio}%
- 直接输出正文内容，不要包含章节标题和作者注释`;

export default function PromptTemplateManager() {
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptTemplateCreate>({
    name: '',
    type: 'chapter',
    content: defaultTemplateContent,
    is_default: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data } = await promptTemplatesApi.list();
      setTemplates(data);
    } catch {
      showToast('error', '加载模板失败');
    }
    setLoading(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForm({ name: '', type: 'chapter', content: defaultTemplateContent, is_default: false });
    setShowForm(true);
  };

  const handleEdit = (t: PromptTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, type: t.type, content: t.content, is_default: t.is_default });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await promptTemplatesApi.update(editingId, form);
        showToast('success', '模板已更新');
      } else {
        await promptTemplatesApi.create(form);
        showToast('success', '模板已创建');
      }
      setShowForm(false);
      loadTemplates();
    } catch {
      showToast('error', '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: '确定删除此模板？', variant: 'danger', confirmText: '删除' })) return;
    try {
      await promptTemplatesApi.delete(id);
      showToast('success', '模板已删除');
      loadTemplates();
    } catch {
      showToast('error', '删除失败');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await promptTemplatesApi.setDefault(id);
      showToast('success', '已设为默认');
      loadTemplates();
    } catch {
      showToast('error', '设置失败');
    }
  };

  return (
    <div className="animate-fade-in">
      {Dialog}
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">Prompt 模板</h1>
          <p className="text-parchment-dim/50 mt-1 text-sm">管理章节生成的 Prompt 模板，使用变量自定义生成指令</p>
        </div>
        <button onClick={handleCreate} className="btn-primary text-sm">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新建模板
          </span>
        </button>
      </div>

      {/* Variables guide */}
      <div className="card mb-6">
        <div className="section-title mb-3">可用变量</div>
        <div className="flex flex-wrap gap-1.5">
          {['genre', 'chapter_number', 'chapter_title', 'chapter_summary', 'detail_outline', 'terminologies', 'prev_summaries', 'style_reference', 'min_words', 'max_words', 'language', 'dialogue_ratio'].map((v) => (
            <span key={v} className="tag font-mono text-[11px]">
              {'{' + v + '}'}
            </span>
          ))}
        </div>
      </div>

      {/* Template list */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-parchment-dim/40">
          <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-parchment-dim/40 text-sm mb-3">暂无模板</p>
          <button onClick={handleCreate} className="btn-secondary text-sm">创建第一个模板</button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t, i) => (
            <div key={t.id} className="card-compact stagger-item" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-parchment text-sm">{t.name}</h3>
                    {t.is_default && (
                      <span className="tag text-[10px]">默认</span>
                    )}
                    <span className="tag-muted text-[10px]">
                      {templateTypes.find((tp) => tp.value === t.type)?.label || t.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-parchment-dim/30 line-clamp-2 font-mono leading-relaxed">
                    {t.content.slice(0, 150)}...
                  </p>
                </div>
                <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                  {!t.is_default && (
                    <button onClick={() => handleSetDefault(t.id)} className="btn-ghost text-[11px] px-2 py-1">
                      设为默认
                    </button>
                  )}
                  <button onClick={() => handleEdit(t)} className="btn-ghost text-[11px] px-2 py-1">
                    编辑
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="btn-ghost text-[11px] px-2 py-1 text-red-400/60 hover:text-red-400">
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-3xl max-h-[85vh] overflow-y-auto mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-bold text-parchment">
                {editingId ? '编辑模板' : '新建模板'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-parchment-dim/30 hover:text-parchment-dim transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">模板名称 *</label>
                  <input type="text" className="input w-full" placeholder="输入模板名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">模板类型</label>
                  <select className="input w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {templateTypes.map((tp) => (
                      <option key={tp.value} value={tp.value}>{tp.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">模板内容 *</label>
                <textarea
                  className="textarea w-full h-72 font-mono text-sm leading-relaxed"
                  placeholder="输入模板内容，使用 {变量名} 插入动态内容"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="accent-ink"
                />
                <label htmlFor="is_default" className="text-sm text-parchment-dim">设为默认模板</label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-study-border/40">
                <button type="submit" className="btn-primary flex-1">
                  {editingId ? '保存修改' : '创建模板'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
