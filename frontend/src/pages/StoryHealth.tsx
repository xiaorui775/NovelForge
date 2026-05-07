import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import { analyticsApi, StoryHealth } from '../api/analytics';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

const COLORS = ['#e94560', '#f59e0b', '#6b7280'];
const PIE_COLORS = ['#10b981', '#f59e0b', '#374151'];

export default function StoryHealthPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [health, setHealth] = useState<StoryHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadHealth();
    }
  }, [projectId]);

  const loadHealth = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await analyticsApi.getStoryHealth(projectId);
      setHealth(data);
    } catch {
      showToast('error', '加载健康度数据失败');
    }
    setLoading(false);
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

  if (!health) {
    return (
      <div className="card text-center py-16">
        <p className="text-parchment-dim/40 text-sm">无法加载数据</p>
      </div>
    );
  }

  const completionData = [
    { name: '已完成', value: health.completed },
    { name: '进行中', value: health.in_progress },
    { name: '未开始', value: health.empty },
  ];

  const foreshadowingData = [
    { name: '开放', value: health.foreshadowing.open },
    { name: '已收', value: health.foreshadowing.resolved },
    { name: '废弃', value: health.foreshadowing.abandoned },
  ];

  const charEntries = Object.entries(health.character_frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const maxWordCount = Math.max(...health.chapter_words.map((c) => c.word_count), 1);

  return (
    <div className="animate-fade-in">
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
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">故事健康度</h1>
        </div>
        <div className="text-xs text-parchment-dim/50">
          {health.total_words.toLocaleString()} 字 · {health.total_chapters} 章
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: '已完成', value: health.completed, color: 'text-emerald-400' },
          { label: '进行中', value: health.in_progress, color: 'text-amber-400' },
          { label: '未开始', value: health.empty, color: 'text-parchment-dim/40' },
          { label: '总字数', value: health.total_words.toLocaleString(), color: 'text-ink' },
        ].map((card) => (
          <div key={card.label} className="card p-4 text-center">
            <p className="text-[11px] text-parchment-dim/40 uppercase tracking-wider mb-1">{card.label}</p>
            <p className={`text-2xl font-display font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Chapter completion donut */}
        <div className="card p-5">
          <h3 className="text-xs text-parchment-dim/50 uppercase tracking-wider mb-4">章节完成率</h3>
          <div className="flex items-center gap-6">
            <div className="w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={completionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {completionData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {completionData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-parchment-dim/60">{item.name}</span>
                  <span className="font-mono text-parchment-dim ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Foreshadowing status */}
        <div className="card p-5">
          <h3 className="text-xs text-parchment-dim/50 uppercase tracking-wider mb-4">伏笔状态</h3>
          {foreshadowingData.every((d) => d.value === 0) ? (
            <div className="flex items-center justify-center h-36 text-parchment-dim/30 text-sm">
              暂无伏笔数据
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-36 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={foreshadowingData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {foreshadowingData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {foreshadowingData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-parchment-dim/60">{item.name}</span>
                    <span className="font-mono text-parchment-dim ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Word count progression */}
      <div className="card p-5 mb-6">
        <h3 className="text-xs text-parchment-dim/50 uppercase tracking-wider mb-4">情节推进曲线</h3>
        {health.chapter_words.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-parchment-dim/30 text-sm">
            暂无章节数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={health.chapter_words}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="chapter_number"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#16213e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
                formatter={(value: number) => [`${value} 字`, '字数']}
                labelFormatter={(label) => `第 ${label} 章`}
              />
              <Line
                type="monotone"
                dataKey="word_count"
                stroke="#e94560"
                strokeWidth={2}
                dot={{ fill: '#e94560', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Character frequency */}
        <div className="card p-5">
          <h3 className="text-xs text-parchment-dim/50 uppercase tracking-wider mb-4">角色出场频率</h3>
          {charEntries.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-parchment-dim/30 text-sm">
              暂无角色数据（需设置场景的 POV 角色）
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, charEntries.length * 36)}>
              <BarChart data={charEntries.map(([name, count]) => ({ name, count }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#16213e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value: number) => [`${value} 次`, '出场']}
                />
                <Bar dataKey="count" fill="#e94560" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pacing heatmap */}
        <div className="card p-5">
          <h3 className="text-xs text-parchment-dim/50 uppercase tracking-wider mb-4">节奏热力图</h3>
          {health.chapter_words.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-parchment-dim/30 text-sm">
              暂无章节数据
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {health.chapter_words.map((ch) => {
                  const intensity = maxWordCount > 0 ? ch.word_count / maxWordCount : 0;
                  const bgColor =
                    ch.word_count === 0
                      ? 'bg-study-deep/50'
                      : intensity > 0.8
                      ? 'bg-ink'
                      : intensity > 0.5
                      ? 'bg-ink/60'
                      : intensity > 0.2
                      ? 'bg-ink/30'
                      : 'bg-ink/15';
                  return (
                    <div
                      key={ch.chapter_number}
                      className={`${bgColor} rounded aspect-square flex items-center justify-center group relative cursor-default`}
                      title={`${ch.title}: ${ch.word_count} 字`}
                    >
                      <span className="text-[9px] text-parchment-dim/40 font-mono">{ch.chapter_number}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-4 text-[10px] text-parchment-dim/30">
                <span>少</span>
                <div className="flex gap-0.5">
                  <div className="w-4 h-3 rounded-sm bg-ink/15" />
                  <div className="w-4 h-3 rounded-sm bg-ink/30" />
                  <div className="w-4 h-3 rounded-sm bg-ink/60" />
                  <div className="w-4 h-3 rounded-sm bg-ink" />
                </div>
                <span>多</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
