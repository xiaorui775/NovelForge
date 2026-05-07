import { useState, useEffect } from 'react';
import { coversApi, CoverImage, CoverImageGenerate } from '../api/covers';
import { useModelState } from '../stores/modelStore';
import { useUIStore } from '../stores/uiStore';

interface CoverGeneratorProps {
  projectId: string;
  onCoverSelected?: (imageUrl: string) => void;
}

const STYLES = [
  { value: '', label: '默认' },
  { value: 'vivid', label: '鲜艳' },
  { value: 'natural', label: '自然' },
];

const SIZES = [
  { value: '1024x1024', label: '1:1' },
  { value: '1024x1792', label: '竖版' },
  { value: '1792x1024', label: '横版' },
];

export default function CoverGenerator({ projectId, onCoverSelected }: CoverGeneratorProps) {
  const { models, fetchModels } = useModelState();
  const { showToast } = useUIStore();

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [style, setStyle] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [generating, setGenerating] = useState(false);
  const [covers, setCovers] = useState<CoverImage[]>([]);
  const [loading, setLoading] = useState(false);

  const imageModels = models.filter((m) => m.model_type === 'image');

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (imageModels.length > 0 && !selectedModel) {
      setSelectedModel(imageModels[0].id);
    }
  }, [imageModels, selectedModel]);

  useEffect(() => {
    if (open) loadCovers();
  }, [open, projectId]);

  const loadCovers = async () => {
    setLoading(true);
    try {
      const { data } = await coversApi.list(projectId);
      setCovers(data.items);
    } catch {
      showToast('error', '加载封面失败');
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedModel) return;
    setGenerating(true);
    try {
      const payload: CoverImageGenerate = {
        prompt: prompt.trim(),
        model_id: selectedModel,
        size,
        quality: 'standard',
        style: style || undefined,
      };
      const { data } = await coversApi.generate(projectId, payload);
      setCovers((prev) => [data, ...prev]);
      showToast('success', '封面生成成功');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '生成失败';
      showToast('error', message);
    }
    setGenerating(false);
  };

  const handleSelect = async (cover: CoverImage) => {
    try {
      await coversApi.select(projectId, cover.id);
      setCovers((prev) => prev.map((c) => ({ ...c, is_selected: c.id === cover.id })));
      onCoverSelected?.(cover.image_url);
      showToast('success', '已设为封面');
    } catch {
      showToast('error', '设置失败');
    }
  };

  const handleDelete = async (coverId: string) => {
    try {
      await coversApi.delete(projectId, coverId);
      setCovers((prev) => prev.filter((c) => c.id !== coverId));
      showToast('success', '已删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost text-sm px-3" title="AI 封面生成">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold text-parchment">AI 封面生成</h3>
              <button onClick={() => setOpen(false)} className="btn-ghost !p-1.5 text-parchment-dim/50 hover:text-ink">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Generation form */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">
                  提示词
                </label>
                <textarea
                  className="input w-full h-20 resize-none text-sm"
                  placeholder="描述你想要的封面风格，例如：一个孤独的剑客站在悬崖边，远眺日落，水墨画风格..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">
                    模型
                  </label>
                  <select className="input w-full text-sm py-2" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                    {imageModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">
                    风格
                  </label>
                  <select className="input w-full text-sm py-2" value={style} onChange={(e) => setStyle(e.target.value)}>
                    {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">
                    尺寸
                  </label>
                  <select className="input w-full text-sm py-2" value={size} onChange={(e) => setSize(e.target.value)}>
                    {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim() || !selectedModel}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    生成中...
                  </>
                ) : '生成封面'}
              </button>
            </div>

            {/* Gallery */}
            <div>
              <h4 className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium mb-3">封面画廊</h4>
              {loading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2].map((i) => <div key={i} className="aspect-square bg-study-deep rounded-xl animate-pulse" />)}
                </div>
              ) : covers.length === 0 ? (
                <p className="text-center text-sm text-parchment-dim/30 py-8">暂无封面</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {covers.map((cover) => (
                    <div key={cover.id} className="relative group rounded-xl overflow-hidden border border-study-border/40">
                      <img src={cover.image_url} alt={cover.prompt} className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-[11px] text-parchment-dim/70 line-clamp-2 mb-2">{cover.revised_prompt || cover.prompt}</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleSelect(cover)} className="btn-primary text-xs flex-1">
                            {cover.is_selected ? '当前封面' : '设为封面'}
                          </button>
                          <button onClick={() => handleDelete(cover.id)} className="btn-ghost text-xs text-red-400">
                            删除
                          </button>
                        </div>
                      </div>
                      {cover.is_selected && (
                        <div className="absolute top-2 right-2 bg-ink text-parchment text-[10px] px-2 py-0.5 rounded-full">
                          封面
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
