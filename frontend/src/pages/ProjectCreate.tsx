import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { projectsApi } from '../api/projects';
import { worldviewsApi, Worldview } from '../api/worldviews';

const genres = ['玄幻', '仙侠', '武侠', '都市', '历史', '科幻', '悬疑', '言情', '奇幻', '末世'];

const languages = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

export default function ProjectCreate() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { createProject, updateProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [worldviews, setWorldviews] = useState<Worldview[]>([]);
  const [form, setForm] = useState({
    name: '', genre: '', description: '', language: 'zh-CN',
    target_words_per_chapter_min: 3000, target_words_per_chapter_max: 5000,
    dialogue_ratio: 0.4, style_reference: '', worldview_id: '',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    worldviewsApi.list().then(({ data }) => setWorldviews(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      projectsApi.get(id).then(({ data }) => {
        setForm({
          name: data.name,
          genre: data.genre || '',
          description: data.description || '',
          language: data.language,
          target_words_per_chapter_min: data.target_words_per_chapter_min,
          target_words_per_chapter_max: data.target_words_per_chapter_max,
          dialogue_ratio: data.dialogue_ratio,
          style_reference: data.style_reference || '',
          worldview_id: data.worldview_id || '',
          tags: data.tags || [],
        });
      }).catch(() => {
        showToast('error', '加载项目失败');
        navigate('/');
      });
    }
  }, [id, isEdit, navigate, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const submitData = {
      ...form,
      worldview_id: form.worldview_id || undefined,
    };
    try {
      if (isEdit) {
        await updateProject(id, submitData);
        showToast('success', '项目已更新');
        navigate(`/projects/${id}`);
      } else {
        const project = await createProject(submitData);
        showToast('success', '项目创建成功');
        navigate(`/projects/${project.id}`);
      }
    } catch { showToast('error', isEdit ? '更新失败' : '创建失败'); }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-3">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          返回
        </button>
        <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">{isEdit ? '编辑项目' : '新建小说项目'}</h1>
        <p className="text-parchment-dim/60 mt-1 text-sm">{isEdit ? '修改项目基本信息' : '配置你的小说基本信息'}</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">小说名称 *</label>
          <input type="text" className="input w-full text-lg font-display" placeholder="输入小说名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-2">小说类型</label>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <button key={g} type="button" onClick={() => setForm({ ...form, genre: g })}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${form.genre === g ? 'bg-ink text-study-deep' : 'bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border hover:border-ink/20'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">小说简介</label>
          <textarea className="textarea w-full h-24" placeholder="简要描述你的小说故事..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-2">写作语言</label>
          <div className="flex flex-wrap gap-1.5">
            {languages.map((lang) => (
              <button key={lang.value} type="button" onClick={() => setForm({ ...form, language: lang.value })}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${form.language === lang.value ? 'bg-ink text-study-deep' : 'bg-study-surface text-parchment-dim/60 hover:text-parchment border border-study-border hover:border-ink/20'}`}>
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">每章最少字数</label>
            <input type="number" className="input w-full" value={form.target_words_per_chapter_min} onChange={(e) => setForm({ ...form, target_words_per_chapter_min: Number(e.target.value) })} min={500} />
          </div>
          <div>
            <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">每章最多字数</label>
            <input type="number" className="input w-full" value={form.target_words_per_chapter_max} onChange={(e) => setForm({ ...form, target_words_per_chapter_max: Number(e.target.value) })} min={500} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-2">
            对话占比: <span className="text-ink">{Math.round(form.dialogue_ratio * 100)}%</span>
          </label>
          <input type="range" className="w-full accent-ink" min="0" max="1" step="0.05" value={form.dialogue_ratio} onChange={(e) => setForm({ ...form, dialogue_ratio: Number(e.target.value) })} />
          <div className="flex justify-between text-[11px] text-parchment-dim/30 mt-1">
            <span>叙述为主</span>
            <span>对话为主</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">风格参考文本</label>
          <textarea className="textarea w-full h-20" placeholder="粘贴一段你喜欢的小说风格文本作为参考..." value={form.style_reference} onChange={(e) => setForm({ ...form, style_reference: e.target.value })} />
        </div>

        <div>
          <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">标签</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-ink/10 text-parchment">
                {tag}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })}
                  className="text-parchment-dim/40 hover:text-red-400 ml-0.5"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            className="input w-full text-sm"
            placeholder="输入标签后按回车添加..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault();
                const tag = tagInput.trim();
                if (!form.tags.includes(tag) && form.tags.length < 20) {
                  setForm({ ...form, tags: [...form.tags, tag] });
                }
                setTagInput('');
              }
            }}
          />
        </div>

        {worldviews.length > 0 && (
          <div>
            <label className="block text-xs text-parchment-dim/50 uppercase tracking-wider font-medium mb-1.5">关联世界观</label>
            <select
              className="input w-full"
              value={form.worldview_id}
              onChange={(e) => setForm({ ...form, worldview_id: e.target.value })}
            >
              <option value="">不关联世界观</option>
              {worldviews.map((wv) => (
                <option key={wv.id} value={wv.id}>{wv.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-study-border/40">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? (isEdit ? '保存中...' : '创建中...') : (isEdit ? '保存修改' : '创建项目')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">取消</button>
        </div>
      </form>
    </div>
  );
}
