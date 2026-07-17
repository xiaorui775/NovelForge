import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useModelState } from '../stores/modelStore';
import { outlinesApi, Outline, ChapterOutline } from '../api/outlines';
import { requestNotificationPermission, sendNotification } from '../utils/notify';
import { chaptersApi, CrossChapterConsistencyResult } from '../api/chapters';
import { projectsApi } from '../api/projects';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import ReverseOutlineView from '../components/ReverseOutlineView';
import CrossChapterCheckModal from '../components/outline/CrossChapterCheckModal';
import SplitChapterModal from '../components/outline/SplitChapterModal';

export default function OutlineManager() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { models, fetchModels } = useModelState();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [chapters, setChapters] = useState<ChapterOutline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateOutline, setShowCreateOutline] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [synopsis, setSynopsis] = useState('');
  const [totalChapters, setTotalChapters] = useState(20);
  const [pacingStyle, setPacingStyle] = useState('');
  const [newChapter, setNewChapter] = useState({ title: '', summary: '' });
  const [expandingDetail, setExpandingDetail] = useState<string | null>(null);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [showReverseOutline, setShowReverseOutline] = useState(false);
  const [crossChapterResult, setCrossChapterResult] = useState<CrossChapterConsistencyResult | null>(null);
  const [crossChapterChecking, setCrossChapterChecking] = useState(false);
  const [splitTarget, setSplitTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadOutline();
      fetchModels();
    }
  }, [projectId, fetchProject, fetchModels]);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  const loadOutline = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await outlinesApi.get(projectId);
      setOutline(data);
      const { data: chapterList } = await outlinesApi.listChapters(data.id);
      setChapters(chapterList);
    } catch {
      // No outline yet
    }
    setLoading(false);
  };

  const handleCreateOutline = async () => {
    if (!projectId) return;
    try {
      const { data } = await outlinesApi.create(projectId, { total_chapters: 20, synopsis });
      setOutline(data);
      setShowCreateOutline(false);
      showToast('success', '大纲创建成功');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '创建失败');
    }
  };

  const handleAddChapter = async () => {
    if (!outline) return;
    try {
      const { data } = await outlinesApi.createChapter(outline.id, {
        chapter_number: chapters.length + 1,
        title: newChapter.title,
        summary: newChapter.summary,
        sort_order: chapters.length,
      });
      setChapters([...chapters, data]);
      setShowAddChapter(false);
      setNewChapter({ title: '', summary: '' });
      showToast('success', '章节已添加');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '添加失败');
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!await confirm({ message: '确定删除此章节概述？', variant: 'danger', confirmText: '删除' })) return;
    try {
      await outlinesApi.deleteChapter(chapterId);
      setChapters(chapters.filter((c) => c.id !== chapterId));
      showToast('success', '已删除');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '删除失败');
    }
  };

  const handleExpandDetail = async (chapterOutlineId: string) => {
    if (!selectedModel) { showToast('error', '请先选择模型'); return; }
    setExpandingDetail(chapterOutlineId);
    try {
      const { data } = await outlinesApi.expandDetail(chapterOutlineId, selectedModel);
      setChapters(chapters.map(c => c.id === chapterOutlineId ? data : c));
      showToast('success', '细纲已生成');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '生成细纲失败');
    }
    setExpandingDetail(null);
  };

  const handleGenerateOutline = async () => {
    if (!projectId || !selectedModel) { showToast('error', '请先选择模型'); return; }
    setGeneratingOutline(true);
    try {
      const { data } = await outlinesApi.generateOutline(projectId, selectedModel, synopsis, totalChapters, pacingStyle);
      setOutline(data);
      const { data: chapterList } = await outlinesApi.listChapters(data.id);
      setChapters(chapterList);
      setShowCreateOutline(false);
      showToast('success', '大纲已生成');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '生成大纲失败');
    }
    setGeneratingOutline(false);
  };

  const handleBatchGenerate = () => {
    if (!selectedModel || chapters.length === 0) return;
    setBatchGenerating(true);
    setBatchProgress({ current: 0, total: chapters.length });
    requestNotificationPermission();

    chaptersApi.batchGenerate(
      selectedModel,
      chapters.map((c) => c.id),
      (event) => {
        if (event.type === 'batch_next') {
          setBatchProgress((prev) => ({ ...prev, current: (prev.current || 0) + 1 }));
        } else if (event.type === 'batch_done') {
          showToast('success', '批量生成完成');
          sendNotification('NovelForge', '批量生成完成');
          loadOutline();
        } else if (event.type === 'error') {
          showToast('error', event.message || '生成失败');
        }
      },
      () => {
        setBatchGenerating(false);
      },
    );
  };

  const handleCrossChapterCheck = async () => {
    if (!projectId || !selectedModel) { showToast('error', '请先选择模型'); return; }
    setCrossChapterChecking(true);
    setCrossChapterResult(null);
    try {
      const { data } = await chaptersApi.crossChapterConsistency(projectId, selectedModel);
      setCrossChapterResult(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '跨章一致性检查失败');
    }
    setCrossChapterChecking(false);
  };

  const handleSplitChapter = async (chapterOutlineId: string, position: number) => {
    if (!outline) return;
    try {
      await outlinesApi.splitChapter(chapterOutlineId, position);
      const { data: chapterList } = await outlinesApi.listChapters(outline.id);
      setChapters(chapterList);
      setSplitTarget(null);
      showToast('success', '章节已拆分');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '拆分失败');
    }
  };

  const handleMergeChapter = async (chapterOutlineId: string, nextChapterOutlineId: string) => {
    if (!await confirm({ message: '确认将下一章合并到当前章节？下一章内容将追加到末尾。', variant: 'danger', confirmText: '合并' })) return;
    if (!outline) return;
    try {
      await outlinesApi.mergeChapters(chapterOutlineId, nextChapterOutlineId);
      const { data: chapterList } = await outlinesApi.listChapters(outline.id);
      setChapters(chapterList);
      showToast('success', '章节已合并');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '合并失败');
    }
  };

  const handleImportTxt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    if (!file.name.endsWith('.txt')) {
      showToast('error', '仅支持 .txt 文件');
      return;
    }
    setImporting(true);
    try {
      const { data } = await projectsApi.importTxt(projectId, file);
      showToast('success', `成功导入 ${data.imported} 个章节`);
      loadOutline();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '导入失败');
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-parchment-dim/40">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {Dialog}
      {/* Header */}
      <div className="mb-8">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {currentProject?.name}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">大纲管理</h1>
          <Link to={`/projects/${projectId}/story-templates`} className="btn-ghost text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            故事结构模板
          </Link>
        </div>
      </div>

      {/* Synopsis */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title">全书大纲</div>
          {outline && (
            <button className="btn-ghost text-xs whitespace-nowrap" onClick={() => setShowCreateOutline(true)}>
              编辑
            </button>
          )}
        </div>
        {outline ? (
          <p className="text-parchment-dim/70 leading-relaxed text-sm font-serif">
            {outline.synopsis || '暂无大纲描述'}
          </p>
        ) : (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
              <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-parchment-dim/60 text-sm mb-4">还没有创建大纲</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowCreateOutline(true)} className="btn-primary text-sm">
                手动创建
              </button>
              <Link to={`/projects/${projectId}/story-templates`} className="btn-secondary text-sm flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                从模板创建
              </Link>
              <button onClick={() => { setShowCreateOutline(true); }} className="btn-secondary text-sm flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                AI 生成
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {importing ? '导入中...' : '导入 TXT'}
              </button>
              <input ref={fileInputRef} type="file" accept=".txt" onChange={handleImportTxt} className="hidden" />
            </div>
          </div>
        )}
      </div>

      {/* Create outline modal */}
      {showCreateOutline && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-4">创建大纲</h3>
          <textarea
            className="textarea w-full h-32 mb-4"
            placeholder="输入全书大纲概述或小说简介..."
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">章节数</label>
              <input
                type="number"
                className="input w-full text-sm py-2"
                min={5}
                max={100}
                value={totalChapters}
                onChange={(e) => setTotalChapters(parseInt(e.target.value) || 20)}
              />
            </div>
            <div>
              <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1.5">节奏风格</label>
              <select
                className="input w-full text-sm py-2"
                value={pacingStyle}
                onChange={(e) => setPacingStyle(e.target.value)}
              >
                <option value="">默认</option>
                <option value="fast">快节奏（爽文/悬疑）</option>
                <option value="slow">慢节奏（文学/言情）</option>
                <option value="balanced">张弛有度</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreateOutline} className="btn-primary text-sm">手动创建</button>
            <button
              onClick={handleGenerateOutline}
              disabled={generatingOutline || !selectedModel}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {generatingOutline ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  生成中...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  AI 生成
                </>
              )}
            </button>
            <button onClick={() => setShowCreateOutline(false)} className="btn-ghost text-sm">取消</button>
          </div>
        </div>
      )}

      {/* Chapter outlines */}
      {outline && (
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div className="section-title">
              章节概述
              <span className="text-xs text-parchment-dim/40 font-body font-normal ml-1">
                {chapters.length} 章
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input text-sm py-1.5 w-36"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={handleBatchGenerate}
                disabled={batchGenerating || !selectedModel || chapters.length === 0}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {batchGenerating ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {batchProgress.current}/{batchProgress.total}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    批量生成
                  </>
                )}
              </button>
              <button onClick={() => setShowAddChapter(true)} className="btn-secondary text-sm">
                + 添加
              </button>
              <button
                onClick={() => setShowReverseOutline(true)}
                disabled={!selectedModel}
                className="btn-ghost text-sm flex items-center gap-1.5"
                title="反向大纲：对比计划与实际写作"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
                反向大纲
              </button>
              <button
                onClick={handleCrossChapterCheck}
                disabled={crossChapterChecking || !selectedModel || chapters.length < 2}
                className="btn-ghost text-sm flex items-center gap-1.5"
                title="跨章节一致性扫描：检查角色状态、时间线、地点等跨章矛盾"
              >
                {crossChapterChecking ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    扫描中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    跨章检查
                  </>
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="btn-ghost text-sm flex items-center gap-1.5"
                title="导入 TXT 文件，自动拆分为章节"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {importing ? '导入中...' : '导入'}
              </button>
              <input ref={fileInputRef} type="file" accept=".txt" onChange={handleImportTxt} className="hidden" />
            </div>
          </div>

          {/* Add chapter form */}
          {showAddChapter && (
            <div className="bg-study-deep rounded-lg p-4 mb-5 border border-study-border animate-slide-up">
              <input
                type="text"
                className="input w-full mb-3 text-sm"
                placeholder="章节标题（可选）"
                value={newChapter.title}
                onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
              />
              <textarea
                className="textarea w-full h-20 mb-3 text-sm"
                placeholder="章节概述..."
                value={newChapter.summary}
                onChange={(e) => setNewChapter({ ...newChapter, summary: e.target.value })}
                required
              />
              <div className="flex gap-3">
                <button onClick={handleAddChapter} className="btn-primary text-sm">添加</button>
                <button onClick={() => setShowAddChapter(false)} className="btn-secondary text-sm">取消</button>
              </div>
            </div>
          )}

          {/* Chapter list */}
          {chapters.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-parchment-dim/40 text-sm">还没有章节概述</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter, index) => (
                <div
                  key={chapter.id}
                  className="stagger-item flex items-start gap-4 p-4 bg-study-deep rounded-lg border border-study-border/40 group hover:border-ink/15 transition-all duration-200"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="w-8 h-8 rounded-lg bg-ink/10 flex items-center justify-center text-ink/60 text-xs font-display font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-parchment text-sm">
                      {chapter.title || `第${chapter.chapter_number}章`}
                    </h4>
                    <p className="text-xs text-parchment-dim/50 mt-1 line-clamp-2 leading-relaxed">
                      {chapter.summary}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={chapter.detail_outline ? 'tag' : 'tag-muted'}>
                        {chapter.detail_outline ? '细纲已生成' : '无细纲'}
                      </span>
                      {!chapter.detail_outline && (
                        <button
                          onClick={() => handleExpandDetail(chapter.id)}
                          disabled={expandingDetail === chapter.id}
                          className="text-[11px] text-ink hover:underline disabled:text-parchment-dim/30"
                        >
                          {expandingDetail === chapter.id ? '生成中...' : '展开细纲'}
                        </button>
                      )}
                    </div>
                    {chapter.detail_outline && (
                      <p className="text-[11px] text-parchment-dim/30 mt-1.5 line-clamp-3 leading-relaxed">
                        {chapter.detail_outline}
                      </p>
                    )}
                    {chapter.content_summary && (
                      <div className="mt-2 p-2 bg-study-card/50 rounded border-l-2 border-ink/20">
                        <p className="text-[10px] text-ink/50 uppercase tracking-wider font-medium mb-1">内容摘要</p>
                        <p className="text-[11px] text-parchment-dim/60 leading-relaxed line-clamp-3">
                          {chapter.content_summary}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Link
                      to={`/projects/${projectId}/chapters/${chapter.id}`}
                      className="btn-ghost text-xs whitespace-nowrap"
                    >
                      写章节
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSplitTarget(chapter.id); }}
                      className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-study-glow"
                      title="拆分章节"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5" />
                      </svg>
                    </button>
                    {index < chapters.length - 1 && (
                      <button
                        onClick={() => handleMergeChapter(chapter.id, chapters[index + 1].id)}
                        className="p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-study-glow"
                        title="与下一章合并"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25h1.5m9 0H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-1.5" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteChapter(chapter.id)}
                      className="p-1.5 text-parchment-dim/30 hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10"
                    >
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
      )}
      {/* Split chapter modal */}
      {splitTarget && (
        <SplitChapterModal
          chapterOutlineId={splitTarget}
          onConfirm={handleSplitChapter}
          onClose={() => setSplitTarget(null)}
        />
      )}

      {/* Cross-chapter consistency result — centered modal (extracted component). */}
      {crossChapterResult && (
        <CrossChapterCheckModal
          result={crossChapterResult}
          onClose={() => setCrossChapterResult(null)}
        />
      )}

      {/* Reverse outline modal */}
      {showReverseOutline && outline && selectedModel && (
        <ReverseOutlineView
          outlineId={outline.id}
          modelId={selectedModel}
          onClose={() => setShowReverseOutline(false)}
        />
      )}
    </div>
  );
}
