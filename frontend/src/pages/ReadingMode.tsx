import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { outlinesApi, ChapterOutline } from '../api/outlines';
import { chaptersApi, Chapter } from '../api/chapters';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

function ReadingProgressBar({ scrollRef, continuousMode, currentChapter, totalChapters }: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  continuousMode: boolean;
  currentChapter: number;
  totalChapters: number;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!continuousMode) {
      // Single chapter mode: progress based on chapter index
      setProgress(totalChapters > 0 ? ((currentChapter + 1) / totalChapters) * 100 : 0);
      return;
    }

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let rafId: number;
    const updateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const maxScroll = scrollHeight - clientHeight;
      setProgress(maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProgress);
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    updateProgress();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [scrollRef, continuousMode, currentChapter, totalChapters]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-transparent">
      <div
        className="h-full bg-accent transition-[width] duration-150 ease-out"
        style={{ width: `${Math.min(100, progress)}%` }}
      />
    </div>
  );
}

interface ChapterWithContent {
  outline: ChapterOutline;
  chapter: Chapter | null;
}

export default function ReadingMode() {
  const { id: projectId, chapterIndex } = useParams<{ id: string; chapterIndex?: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [chapters, setChapters] = useState<ChapterWithContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [continuousMode, setContinuousMode] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadChapters();
    }
  }, [projectId, fetchProject]);

  // Jump to chapter from URL param
  useEffect(() => {
    if (chapterIndex && chapters.length > 0) {
      const idx = parseInt(chapterIndex, 10);
      if (!isNaN(idx) && idx >= 0 && idx < chapters.length) {
        setCurrentChapter(idx);
        if (continuousMode) {
          setTimeout(() => scrollToChapter(idx), 100);
        }
      }
    }
  }, [chapterIndex, chapters, continuousMode]);

  // Restore scroll position in continuous mode
  useEffect(() => {
    if (!continuousMode || chapters.length === 0) return;
    const saved = sessionStorage.getItem(`nf-read-scroll-${projectId}`);
    if (saved) {
      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        setTimeout(() => { scrollEl.scrollTop = parseInt(saved, 10); }, 50);
      }
    }
  }, [continuousMode, projectId, chapters]);

  // Save scroll position
  useEffect(() => {
    if (!continuousMode) return;
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    const handleScroll = () => {
      sessionStorage.setItem(`nf-read-scroll-${projectId}`, String(scrollEl.scrollTop));
    };
    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [continuousMode, projectId]);

  // IntersectionObserver for TOC highlight
  useEffect(() => {
    if (!continuousMode) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-chapter-idx'));
            if (!isNaN(idx)) setActiveTocIndex(idx);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );
    chapterRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [continuousMode, chapters]);

  const loadChapters = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data: outline } = await outlinesApi.get(projectId);
      const { data: chapterOutlines } = await outlinesApi.listChapters(outline.id);

      const results = await Promise.all(
        chapterOutlines.map(async (co) => {
          try {
            const { data: chapter } = await chaptersApi.getByOutline(co.id);
            return { outline: co, chapter: chapter.status === 'completed' ? chapter : null };
          } catch {
            return { outline: co, chapter: null };
          }
        })
      );
      setChapters(results);
    } catch {
      showToast('error', '加载章节失败');
    }
    setLoading(false);
  };

  const scrollToChapter = useCallback((idx: number) => {
    const el = chapterRefs.current.get(idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const totalWords = chapters.reduce((sum, c) => sum + (c.chapter?.word_count || 0), 0);
  const completedCount = chapters.filter((c) => c.chapter).length;

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
      <ReadingProgressBar
        scrollRef={scrollContainerRef}
        continuousMode={continuousMode}
        currentChapter={currentChapter}
        totalChapters={chapters.length}
      />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">阅读模式</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-parchment-dim/50">
            <span>{completedCount}/{chapters.length} 章</span>
            <span>·</span>
            <span>{totalWords.toLocaleString()} 字</span>
          </div>
          {/* Mode toggle */}
          <button
            onClick={() => setContinuousMode(!continuousMode)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
              continuousMode ? 'bg-ink text-parchment' : 'bg-study-deep text-parchment-dim/60 hover:text-parchment'
            }`}
          >
            {continuousMode ? '连续阅读' : '单章阅读'}
          </button>
          <div className="flex items-center gap-1 bg-study-deep rounded-lg p-1">
            <button
              onClick={() => setFontSize((s) => Math.max(14, s - 2))}
              className="px-2 py-1 text-xs text-parchment-dim/60 hover:text-parchment rounded transition-colors"
            >
              A-
            </button>
            <span className="text-[11px] text-parchment-dim/40 w-8 text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize((s) => Math.min(24, s + 2))}
              className="px-2 py-1 text-xs text-parchment-dim/60 hover:text-parchment rounded transition-colors"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {chapters.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-parchment-dim/40 text-sm">还没有章节</p>
        </div>
      ) : continuousMode ? (
        /* Continuous reading mode */
        <div className="flex gap-6">
          {/* Mini TOC sidebar */}
          <nav className="hidden lg:block w-48 flex-shrink-0">
            <div className="sticky top-4 space-y-0.5 max-h-[80vh] overflow-y-auto">
              {chapters.map((c, i) => (
                <button
                  key={c.outline.id}
                  onClick={() => scrollToChapter(i)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-all ${
                    activeTocIndex === i
                      ? 'bg-ink/20 text-ink font-medium'
                      : c.chapter
                      ? 'text-parchment-dim/40 hover:text-parchment-dim/70'
                      : 'text-parchment-dim/20'
                  }`}
                >
                  <span className="font-mono text-[10px] mr-1 opacity-40">{c.outline.chapter_number}</span>
                  {c.outline.title || `第${c.outline.chapter_number}章`}
                </button>
              ))}
            </div>
          </nav>

          {/* Continuous content */}
          <div ref={scrollContainerRef} className="flex-1 max-w-3xl mx-auto overflow-y-auto">
            {chapters.map((c, i) => (
              <div
                key={c.outline.id}
                ref={(el) => { if (el) chapterRefs.current.set(i, el); }}
                data-chapter-idx={i}
                className={i > 0 ? 'mt-16' : ''}
              >
                {/* Chapter divider */}
                {i > 0 && (
                  <div className="flex items-center justify-center mb-12">
                    <div className="h-px bg-study-border/30 flex-1" />
                    <span className="px-4 text-parchment-dim/20 text-sm select-none">◆</span>
                    <div className="h-px bg-study-border/30 flex-1" />
                  </div>
                )}

                {/* Chapter header */}
                <div className="text-center mb-8 pb-6 border-b border-study-border/20">
                  <h2
                    className="font-display font-bold text-parchment mb-1"
                    style={{ fontSize: `${fontSize + 6}px` }}
                  >
                    {c.outline.title || `第${c.outline.chapter_number}章`}
                  </h2>
                  {c.chapter && (
                    <p className="text-[11px] text-parchment-dim/30">
                      {c.chapter.word_count.toLocaleString()} 字
                    </p>
                  )}
                </div>

                {/* Chapter content */}
                {c.chapter ? (
                  <div
                    className="font-serif leading-[2] text-parchment-dim whitespace-pre-wrap pb-16"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {c.chapter.content}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-parchment-dim/30 text-sm mb-3">此章节尚未生成</p>
                    <Link
                      to={`/projects/${projectId}/chapters/${c.outline.id}`}
                      className="text-xs text-ink/50 hover:text-ink transition-colors"
                    >
                      前往生成 →
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {/* End marker */}
            <div className="text-center py-16 text-parchment-dim/20">
              <span className="text-lg">◆</span>
              <p className="text-xs mt-2">全书完</p>
            </div>
          </div>
        </div>
      ) : (
        /* Single chapter mode */
        <>
          {/* Chapter tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            {chapters.map((c, i) => (
              <button
                key={c.outline.id}
                onClick={() => setCurrentChapter(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentChapter === i
                    ? 'bg-ink text-parchment'
                    : c.chapter
                    ? 'bg-study-deep text-parchment-dim/60 hover:text-parchment hover:bg-study-glow'
                    : 'bg-study-deep/50 text-parchment-dim/30'
                }`}
              >
                {c.outline.title || `第${c.outline.chapter_number}章`}
              </button>
            ))}
          </div>

          {/* Single chapter content */}
          <div className="card max-w-3xl mx-auto">
            <div className="text-center mb-10 pb-8 border-b border-study-border/30">
              <h2
                className="font-display font-bold text-parchment mb-2"
                style={{ fontSize: `${fontSize + 8}px` }}
              >
                {chapters[currentChapter]?.outline.title || `第${chapters[currentChapter]?.outline.chapter_number}章`}
              </h2>
              {chapters[currentChapter]?.chapter && (
                <p className="text-[11px] text-parchment-dim/40">
                  {chapters[currentChapter].chapter!.word_count.toLocaleString()} 字
                </p>
              )}
            </div>

            {chapters[currentChapter]?.chapter ? (
              <div
                className="font-serif leading-[2] text-parchment-dim whitespace-pre-wrap"
                style={{ fontSize: `${fontSize}px` }}
              >
                {chapters[currentChapter].chapter!.content}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
                  <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="text-parchment-dim/50 text-sm mb-4">此章节尚未生成</p>
                <Link
                  to={`/projects/${projectId}/chapters/${chapters[currentChapter].outline.id}`}
                  className="btn-primary text-sm"
                >
                  前往生成
                </Link>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-study-border/30">
              <button
                onClick={() => setCurrentChapter((c) => Math.max(0, c - 1))}
                disabled={currentChapter === 0}
                className="btn-ghost text-sm disabled:opacity-30"
              >
                ← 上一章
              </button>
              <span className="text-[11px] text-parchment-dim/40">
                {currentChapter + 1} / {chapters.length}
              </span>
              <button
                onClick={() => setCurrentChapter((c) => Math.min(chapters.length - 1, c + 1))}
                disabled={currentChapter === chapters.length - 1}
                className="btn-ghost text-sm disabled:opacity-30"
              >
                下一章 →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
