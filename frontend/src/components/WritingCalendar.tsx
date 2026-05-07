import { useEffect, useState } from 'react';
import { analyticsApi } from '../api/analytics';

interface DayData {
  date: string;
  words: number;
  versions: number;
}

interface GoalMark {
  achieved: boolean;
  missed: boolean;
}

interface Props {
  goalMarks?: Record<string, GoalMark>;
  streakOverride?: number;
}

function getHeatColor(words: number, maxWords: number): string {
  if (words === 0) return 'bg-study-deep';
  const ratio = Math.min(words / maxWords, 1);
  if (ratio < 0.25) return 'bg-ink/20';
  if (ratio < 0.5) return 'bg-ink/40';
  if (ratio < 0.75) return 'bg-ink/60';
  return 'bg-ink';
}

export default function WritingCalendar({ goalMarks, streakOverride }: Props) {
  const [data, setData] = useState<DayData[]>([]);
  const [streak, setStreak] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

  useEffect(() => {
    analyticsApi.getDailyWords(365).then(({ data }) => {
      setData(data);
      const total = data.reduce((sum: number, d: DayData) => sum + d.words, 0);
      setTotalWords(total);

      if (typeof streakOverride === 'number') {
        setStreak(streakOverride);
        return;
      }

      const dateSet = new Set(data.filter((d: DayData) => d.words > 0).map((d: DayData) => d.date));
      let s = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (dateSet.has(key)) {
          s++;
        } else {
          break;
        }
      }
      setStreak(s);
    }).catch(() => {});
  }, [streakOverride]);

  const maxWords = Math.max(...data.map((d) => d.words), 1);
  const dataMap = new Map(data.map((d) => [d.date, d]));

  const today = new Date();
  const weeks: { date: Date; data?: DayData }[][] = [];
  let currentWeek: { date: Date; data?: DayData }[] = [];

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const cursor = new Date(startDate);
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    currentWeek.push({ date: new Date(cursor), data: dataMap.get(key) });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const monthLabels = ['1月', '', '3月', '', '5月', '', '7月', '', '9月', '', '11月', ''];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-bold text-parchment">写作日历</h3>
        <div className="flex items-center gap-4 text-[11px] text-parchment-dim/50">
          <span>连续写作 <span className="text-ink font-mono font-bold">{streak}</span> 天</span>
          <span>年度总字数 <span className="text-ink font-mono font-bold">{totalWords.toLocaleString()}</span></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex ml-8 mb-1">
            {monthLabels.map((label, i) => (
              <div key={i} className="w-[13px] text-[9px] text-parchment-dim/30">
                {label}
              </div>
            ))}
          </div>

          <div className="flex gap-0">
            <div className="flex flex-col gap-[2px] mr-1 mt-0">
              {['日', '一', '二', '三', '四', '五', '六'].map((day, i) => (
                <div key={i} className="h-[11px] text-[9px] text-parchment-dim/30 leading-[11px]">
                  {i % 2 === 1 ? day : ''}
                </div>
              ))}
            </div>

            <div className="flex gap-[2px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((cell, ci) => {
                    const words = cell.data?.words || 0;
                    const dayKey = cell.date.toISOString().slice(0, 10);
                    const mark = goalMarks?.[dayKey];
                    const markClass = mark?.achieved
                      ? 'ring-1 ring-emerald-400/90'
                      : mark?.missed
                        ? 'ring-1 ring-red-400/90'
                        : '';

                    return (
                      <div
                        key={ci}
                        className={`w-[11px] h-[11px] rounded-[2px] ${getHeatColor(words, maxWords)} border border-study-border/20 transition-colors ${markClass}`}
                        title={`${cell.date.toLocaleDateString('zh-CN')}${words > 0 ? `: ${words} 字` : ''}${mark?.achieved ? ' · 达标' : mark?.missed ? ' · 未达标' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3 ml-8">
            <span className="text-[9px] text-parchment-dim/30">少</span>
            {['bg-study-deep', 'bg-ink/20', 'bg-ink/40', 'bg-ink/60', 'bg-ink'].map((color, i) => (
              <div key={i} className={`w-[11px] h-[11px] rounded-[2px] ${color} border border-study-border/20`} />
            ))}
            <span className="text-[9px] text-parchment-dim/30">多</span>
            <span className="w-[11px] h-[11px] rounded-[2px] border border-study-border/20 ring-1 ring-emerald-400/90 ml-2" />
            <span className="text-[9px] text-parchment-dim/30">达标</span>
            <span className="w-[11px] h-[11px] rounded-[2px] border border-study-border/20 ring-1 ring-red-400/90 ml-1" />
            <span className="text-[9px] text-parchment-dim/30">未达标</span>
          </div>
        </div>
      </div>
    </div>
  );
}
