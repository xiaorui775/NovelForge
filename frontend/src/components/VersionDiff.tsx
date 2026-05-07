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

  // Guard against huge inputs
  if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
    // Fall back to simple line-by-line comparison
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

  // Build LCS table
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

  // Backtrack to produce diff
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

// Build aligned side-by-side rows: each row has a left and right entry
function buildSideBySide(diffLines: DiffLine[]): { left: DiffLine | null; right: DiffLine | null }[] {
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.type === 'equal') {
      rows.push({ left: line, right: line });
      i++;
    } else if (line.type === 'removed') {
      // Collect consecutive removals
      const removals: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'removed') {
        removals.push(diffLines[i]);
        i++;
      }
      // Collect consecutive additions
      const additions: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'added') {
        additions.push(diffLines[i]);
        i++;
      }
      // Pair them up
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-study-border/40 bg-study-card/95">
        <div className="flex items-center gap-6">
          <h3 className="font-display text-lg font-bold text-parchment">版本对比</h3>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-parchment-dim/60">
              <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40" />
              v{v1.version_number}
              {v1.quality_score !== null && (
                <span className="font-mono text-parchment-dim/40">({v1.quality_score.toFixed(1)})</span>
              )}
            </span>
            <svg className="w-3.5 h-3.5 text-parchment-dim/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
            <span className="flex items-center gap-1.5 text-parchment-dim/60">
              <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
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
          <div className="flex items-center gap-3 text-[11px] text-parchment-dim/50">
            <span className="text-green-400/70">+{stats.added}</span>
            <span className="text-red-400/70">-{stats.removed}</span>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 divide-x divide-study-border/30 min-h-full">
          {/* Left: old version */}
          <div>
            <div className="px-3 py-2 bg-study-deep/50 border-b border-study-border/30 sticky top-0 z-10">
              <span className="text-[11px] text-parchment-dim/40 font-mono">v{v1.version_number} · {v1.word_count.toLocaleString()} 字</span>
            </div>
            <div>
              {rows.map((row, idx) => {
                const line = row.left;
                if (!line) {
                  // Empty placeholder for alignment
                  return (
                    <div key={`l-${idx}`} className="flex font-mono text-[13px] leading-6 bg-green-500/4 min-h-[1.5rem]">
                      <span className="w-12 flex-shrink-0 border-r border-study-border/20" />
                      <span className="flex-1 px-3">&nbsp;</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`l-${idx}`}
                    className={`flex font-mono text-[13px] leading-6 ${
                      line.type === 'removed' ? 'bg-red-500/8' : ''
                    }`}
                  >
                    <span className="w-12 flex-shrink-0 text-right pr-3 text-parchment-dim/20 select-none border-r border-study-border/20">
                      {line.type !== 'added' ? '' : ''}
                    </span>
                    <span className={`flex-1 px-3 whitespace-pre-wrap break-words ${
                      line.type === 'removed' ? 'text-red-400/60 line-through' : 'text-parchment-dim/70'
                    }`}>
                      {line.content || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: new version */}
          <div>
            <div className="px-3 py-2 bg-study-deep/50 border-b border-study-border/30 sticky top-0 z-10">
              <span className="text-[11px] text-parchment-dim/40 font-mono">v{v2.version_number} · {v2.word_count.toLocaleString()} 字</span>
            </div>
            <div>
              {rows.map((row, idx) => {
                const line = row.right;
                if (!line) {
                  return (
                    <div key={`r-${idx}`} className="flex font-mono text-[13px] leading-6 bg-red-500/4 min-h-[1.5rem]">
                      <span className="w-12 flex-shrink-0 border-r border-study-border/20" />
                      <span className="flex-1 px-3">&nbsp;</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`r-${idx}`}
                    className={`flex font-mono text-[13px] leading-6 ${
                      line.type === 'added' ? 'bg-green-500/8' : ''
                    }`}
                  >
                    <span className="w-12 flex-shrink-0 text-right pr-3 text-parchment-dim/20 select-none border-r border-study-border/20" />
                    <span className={`flex-1 px-3 whitespace-pre-wrap break-words ${
                      line.type === 'added' ? 'text-green-400/70' : 'text-parchment-dim/70'
                    }`}>
                      {line.content || ' '}
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
