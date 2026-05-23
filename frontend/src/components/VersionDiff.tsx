import { useMemo } from 'react';

interface VersionInfo {
  id: string;
  version_number: number;
  content: string;
  word_count: number;
  quality_score: number | null;
  created_at: string;
}

interface Props {
  v1: VersionInfo;
  v2: VersionInfo;
  onClose: () => void;
}

interface DiffLine {
  type: 'equal' | 'added' | 'removed';
  content: string;
}

const MAX_LINES = 2000;

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
    const maxLen = Math.min(oldLines.length, newLines.length, MAX_LINES);
    const result: DiffLine[] = [];
    for (let i = 0; i < maxLen; i++) {
      if (oldLines[i] === newLines[i]) {
        result.push({ type: 'equal', content: oldLines[i] });
      } else {
        result.push({ type: 'removed', content: oldLines[i] });
        result.push({ type: 'added', content: newLines[i] });
      }
    }
    if (oldLines.length > maxLen) {
      for (let i = maxLen; i < oldLines.length; i++) result.push({ type: 'removed', content: oldLines[i] });
    }
    if (newLines.length > maxLen) {
      for (let i = maxLen; i < newLines.length; i++) result.push({ type: 'added', content: newLines[i] });
    }
    return result;
  }

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const temp: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'equal', content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: 'added', content: newLines[j - 1] });
      j--;
    } else {
      temp.push({ type: 'removed', content: oldLines[i - 1] });
      i--;
    }
  }

  temp.reverse();
  return temp;
}

function buildSideBySide(diffLines: DiffLine[]): { left: DiffLine | null; right: DiffLine | null }[] {
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.type === 'equal') {
      rows.push({ left: line, right: line });
      i++;
    } else if (line.type === 'removed') {
      const removals: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'removed') {
        removals.push(diffLines[i]);
        i++;
      }
      const additions: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'added') {
        additions.push(diffLines[i]);
        i++;
      }
      const maxLen = Math.max(removals.length, additions.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          left: k < removals.length ? removals[k] : null,
          right: k < additions.length ? additions[k] : null,
        });
      }
    } else if (line.type === 'added') {
      rows.push({ left: null, right: line });
      i++;
    } else {
      i++;
    }
  }
  return rows;
}

export default function VersionDiff({ v1, v2, onClose }: Props) {
  const diffLines = useMemo(() => computeLineDiff(v1.content, v2.content), [v1.content, v2.content]);
  const rows = useMemo(() => buildSideBySide(diffLines), [diffLines]);
  const tooLarge = v1.content.split('\n').length > MAX_LINES || v2.content.split('\n').length > MAX_LINES;

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-study-deep">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-study-border/50 bg-study-surface">
        <div className="flex items-center gap-6">
          <h3 className="font-display text-lg font-bold text-parchment">版本对比</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-parchment-dim/70">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400/30 border border-red-400/50" />
              v{v1.version_number}
              {v1.quality_score !== null && (
                <span className="font-mono text-parchment-dim/40">({v1.quality_score.toFixed(1)})</span>
              )}
            </span>
            <svg className="w-4 h-4 text-parchment-dim/25" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
            <span className="flex items-center gap-1.5 text-parchment-dim/70">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-400/30 border border-green-400/50" />
              v{v2.version_number}
              {v2.quality_score !== null && (
                <span className="font-mono text-parchment-dim/40">({v2.quality_score.toFixed(1)})</span>
              )}
            </span>
          </div>
          {tooLarge && (
            <span className="text-[10px] text-amber-400/70">大文件使用简化对比模式</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-parchment-dim/60">
            <span className="text-green-400/80">+{stats.added}</span>
            <span className="text-red-400/80">-{stats.removed}</span>
          </div>
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">
            关闭
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto bg-study-deep">
        <div className="grid grid-cols-2 divide-x divide-study-border/40 min-h-full">
          {/* Left: old version */}
          <div>
            <div className="px-4 py-2.5 bg-study-surface border-b border-study-border/40 sticky top-0 z-10">
              <span className="text-xs text-parchment-dim/60 font-medium">v{v1.version_number} · {v1.word_count.toLocaleString()} 字</span>
            </div>
            <div className="px-2">
              {rows.map((row, idx) => {
                const line = row.left;
                if (!line) {
                  return (
                    <div key={`l-${idx}`} className="flex font-mono text-[13px] leading-7 bg-green-500/5 min-h-[1.75rem]">
                      <span className="w-10 flex-shrink-0 text-right pr-2 text-parchment-dim/15 select-none" />
                      <span className="flex-1 px-3">&nbsp;</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`l-${idx}`}
                    className={`flex font-mono text-[13px] leading-7 ${
                      line.type === 'removed' ? 'bg-red-500/10' : 'hover:bg-study-glow/30'
                    }`}
                  >
                    <span className="w-10 flex-shrink-0 text-right pr-2 text-parchment-dim/15 select-none">
                      {line.type === 'removed' ? '-' : ''}
                    </span>
                    <span className={`flex-1 px-3 whitespace-pre-wrap break-words ${
                      line.type === 'removed' ? 'text-red-400/70 line-through decoration-red-400/30' : 'text-parchment-dim/80'
                    }`}>
                      {line.content || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: new version */}
          <div>
            <div className="px-4 py-2.5 bg-study-surface border-b border-study-border/40 sticky top-0 z-10">
              <span className="text-xs text-parchment-dim/60 font-medium">v{v2.version_number} · {v2.word_count.toLocaleString()} 字</span>
            </div>
            <div className="px-2">
              {rows.map((row, idx) => {
                const line = row.right;
                if (!line) {
                  return (
                    <div key={`r-${idx}`} className="flex font-mono text-[13px] leading-7 bg-red-500/5 min-h-[1.75rem]">
                      <span className="w-10 flex-shrink-0 text-right pr-2 text-parchment-dim/15 select-none" />
                      <span className="flex-1 px-3">&nbsp;</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`r-${idx}`}
                    className={`flex font-mono text-[13px] leading-7 ${
                      line.type === 'added' ? 'bg-green-500/10' : 'hover:bg-study-glow/30'
                    }`}
                  >
                    <span className="w-10 flex-shrink-0 text-right pr-2 text-parchment-dim/15 select-none">
                      {line.type === 'added' ? '+' : ''}
                    </span>
                    <span className={`flex-1 px-3 whitespace-pre-wrap break-words ${
                      line.type === 'added' ? 'text-green-400/80' : 'text-parchment-dim/80'
                    }`}>
                      {line.content || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
