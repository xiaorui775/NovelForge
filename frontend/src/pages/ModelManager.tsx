import { useEffect, useState } from 'react';
import { useModelState } from '../stores/modelStore';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import type { ModelConfigCreate, ModelConfig } from '../api/models';

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'o1-mini': { input: 0.003, output: 0.012 },
  'o1-preview': { input: 0.015, output: 0.06 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },
  'glm-4': { input: 0.014, output: 0.014 },
  'moonshot-v1-8k': { input: 0.012, output: 0.012 },
  'qwen-turbo': { input: 0.0003, output: 0.0006 },
  'qwen-plus': { input: 0.004, output: 0.012 },
  'qwen-max': { input: 0.016, output: 0.064 },
};

export default function ModelManager() {
  const { models, loading, fetchModels, createModel, updateModel, deleteModel, testModel } = useModelState();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState<ModelConfigCreate>({
    name: '',
    provider: 'openai',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model_name: 'gpt-4',
    model_type: 'chat',
    input_cost_per_1k: 0.03,
    output_cost_per_1k: 0.06,
    max_tokens: 4096,
    max_context_tokens: 8192,
  });

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: '', provider: 'openai', base_url: 'https://api.openai.com/v1',
      api_key: '', model_name: 'gpt-4', model_type: 'chat', input_cost_per_1k: 0.03, output_cost_per_1k: 0.06, max_tokens: 4096, max_context_tokens: 8192,
    });
  };

  const handleModelNameChange = (modelName: string) => {
    const newForm = { ...form, model_name: modelName };
    // 自动填入已知模型的价格
    if (!editing) {
      const lower = modelName.toLowerCase();
      for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (lower.includes(key)) {
          newForm.input_cost_per_1k = pricing.input;
          newForm.output_cost_per_1k = pricing.output;
          break;
        }
      }
    }
    setForm(newForm);
  };

  const handleEdit = (model: ModelConfig) => {
    setEditing(model);
    setForm({
      name: model.name,
      provider: model.provider,
      base_url: model.base_url,
      api_key: '', // Don't pre-fill API key for security
      model_name: model.model_name,
      model_type: model.model_type,
      input_cost_per_1k: model.input_cost_per_1k,
      output_cost_per_1k: model.output_cost_per_1k,
      max_tokens: model.max_tokens,
      max_context_tokens: model.max_context_tokens,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const updateData: Record<string, unknown> = { ...form };
        if (!updateData.api_key) delete updateData.api_key; // Don't send empty API key
        await updateModel(editing.id, updateData);
        showToast('success', '模型已更新');
      } else {
        await createModel(form);
        showToast('success', '模型添加成功');
      }
      setShowForm(false);
      resetForm();
    } catch {
      showToast('error', editing ? '更新失败' : '添加失败');
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await testModel(id);
      showToast(result.success ? 'success' : 'error', result.message);
    } catch {
      showToast('error', '测试失败');
    }
    setTesting(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `确定删除模型 "${name}" 吗？`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await deleteModel(id);
      showToast('success', '已删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">模型配置</h1>
          <p className="text-parchment-dim/60 mt-1 text-sm">配置 OpenAI 兼容的 AI 模型</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          添加模型
        </button>
      </div>

      {showForm && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-5">{editing ? '编辑模型' : '添加新模型'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">模型名称</label>
                <input type="text" className="input w-full" placeholder="GPT-4 Turbo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">模型标识</label>
                <input type="text" className="input w-full" placeholder="gpt-4-turbo" value={form.model_name} onChange={(e) => handleModelNameChange(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">提供商</label>
                <select className="input w-full" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="zhipu">智谱</option>
                  <option value="moonshot">Moonshot</option>
                  <option value="qwen">通义千问</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">类型</label>
                <select className="input w-full" value={form.model_type} onChange={(e) => setForm({ ...form, model_type: e.target.value })}>
                  <option value="chat">文本生成</option>
                  <option value="image">图片生成</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">最大 Tokens</label>
                <input type="number" className="input w-full" placeholder="4096" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) })} min={256} step={256} />
              </div>
              <div>
                <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">上下文窗口</label>
                <input type="number" className="input w-full" placeholder="8192" value={form.max_context_tokens} onChange={(e) => setForm({ ...form, max_context_tokens: Number(e.target.value) })} min={1024} step={1024} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">API 地址</label>
              <input type="url" className="input w-full" placeholder="https://api.openai.com/v1" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">API Key</label>
              <input type="password" className="input w-full" placeholder={editing ? '留空则不修改' : 'sk-...'} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required={!editing} />
            </div>
            {form.model_type !== 'image' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">输入价格 (每 1K tokens)</label>
                  <input type="number" className="input w-full" placeholder="0.01" value={form.input_cost_per_1k} onChange={(e) => setForm({ ...form, input_cost_per_1k: Number(e.target.value) })} min={0} step={0.001} />
                </div>
                <div>
                  <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">输出价格 (每 1K tokens)</label>
                  <input type="number" className="input w-full" placeholder="0.03" value={form.output_cost_per_1k} onChange={(e) => setForm({ ...form, output_cost_per_1k: Number(e.target.value) })} min={0} step={0.001} />
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary text-sm">{editing ? '保存修改' : '保存'}</button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse card-compact"><div className="h-14 bg-study-surface rounded" /></div>
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">还没有配置模型</p>
          <p className="text-parchment-dim/50 text-sm mb-6">添加 OpenAI 兼容的模型配置</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ 添加第一个模型</button>
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((model, i) => (
            <div key={model.id} className="stagger-item card-compact group" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-medium text-parchment text-sm">{model.name}</h3>
                    <span className="tag-muted text-[10px]">{model.provider || 'openai'}</span>
                    <span className="tag-muted text-[10px]">{model.model_name}</span>
                    {model.model_type === 'image' && (
                      <span className="tag text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/15">图片</span>
                    )}
                    <span className={`flex items-center gap-1 text-[11px] ${model.is_active ? 'text-ink' : 'text-parchment-dim/30'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${model.is_active ? 'bg-ink' : 'bg-study-muted'}`} />
                      {model.is_active ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[11px] text-parchment-dim/30 truncate">{model.base_url}</p>
                    <span className={`text-[10px] flex-shrink-0 ${model.input_cost_per_1k > 0 ? 'text-parchment-dim/25' : 'text-amber-400/60'}`}>
                      {model.input_cost_per_1k > 0
                        ? `$${model.input_cost_per_1k}/$${model.output_cost_per_1k} per 1K`
                        : '未配置价格'
                      }
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(model)} className="btn-ghost text-xs">
                    编辑
                  </button>
                  <button onClick={() => handleTest(model.id)} disabled={testing === model.id} className="btn-ghost text-xs">
                    {testing === model.id ? '测试中...' : '测试'}
                  </button>
                  <button onClick={() => handleDelete(model.id, model.name)} className="btn-ghost text-xs text-red-400/70 hover:text-red-400">
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
