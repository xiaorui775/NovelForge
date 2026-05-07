import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi, SearchResult } from '../api/search';

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
}

type SearchItem = {
  id: string;
  label: string;
  sublabel: string;
  type: string;
  path: string;
};

export default function SearchPanel({ open, onClose }: SearchPanelProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await searchApi.search(query.trim());
        setResults(data);
        setActiveIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults(null);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Flatten results into a navigable list
  const items: SearchItem[] = [];
  if (results) {
    for (const p of results.projects) {
      items.push({ id: p.id, label: p.name, sublabel: p.description.slice(0, 60), type: '项目', path: `/projects/${p.id}` });
    }
    for (const ch of results.chapters) {
      items.push({ id: ch.id, label: ch.snippet, sublabel: '章节内容', type: '章节', path: `/projects/${ch.project_id}/chapters/${ch.id}` });
    }
    for (const c of results.characters) {
      items.push({ id: c.id, label: c.name, sublabel: c.description.slice(0, 60), type: '角色', path: '/characters' });
    }
    for (const t of results.terminology) {
      items.push({ id: t.id, label: t.term, sublabel: t.description.slice(0, 60), type: '术语', path: `/projects/${t.project_id}/terminology` });
    }
  }

  const handleSelect = useCallback((item: SearchItem) => {
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      handleSelect(items[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [items, activeIndex, handleSelect, onClose]);

  if (!open) return null;

  const typeColors: Record<string, string> = {
    '项目': 'text-ink',
    '章节': 'text-amber-400',
    '角色': 'text-green-400',
    '术语': 'text-blue-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl mx-4 bg-study-card border border-study-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-study-border/50">
          <svg className="w-4 h-4 text-parchment-dim/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-parchment text-sm outline-none placeholder-parchment-dim/30"
            placeholder="搜索项目、章节、角色、术语..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && (
            <svg className="w-4 h-4 text-parchment-dim/40 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-parchment-dim/30 text-sm">
              输入关键词开始搜索
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-parchment-dim/30 text-sm">
              无搜索结果
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={`${item.type}-${item.id}`}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  idx === activeIndex ? 'bg-ink/10' : 'hover:bg-study-glow'
                }`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-study-surface ${typeColors[item.type] || 'text-parchment-dim'}`}>
                  {item.type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-parchment truncate">{item.label}</div>
                  {item.sublabel && item.sublabel !== item.label && (
                    <div className="text-[11px] text-parchment-dim/40 truncate">{item.sublabel}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-study-border/30 flex items-center gap-4 text-[10px] text-parchment-dim/30">
          <span>↑↓ 导航</span>
          <span>Enter 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
