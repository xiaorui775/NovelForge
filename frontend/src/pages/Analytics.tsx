import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, ComposedChart, Line,
} from 'recharts';
import { analyticsApi, AnalyticsOverview, MonthlyStats, ModelStats, ProjectStats, RecentActivity } from '../api/analytics';
import { useUIStore } from '../stores/uiStore';

const COLORS = ['#c9a96e', '#dfc291', '#a08550', '#7a6438', '#e8d5b0', '#5c4a2e'];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-study-card border border-study-border/50 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[11px] text-parchment-dim/60 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-mono" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? (p.value < 1 ? `$${p.value.toFixed(4)}` : p.value.toLocaleString()) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const { showToast } = useUIStore();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [byModel, setByModel] = useState<ModelStats[]>([]);
  const [byProject, setByProject] = useState<ProjectStats[]>([]);
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ovRes, moRes, mdRes, pjRes, rcRes] = await Promise.all([
        analyticsApi.getOverview(),
        analyticsApi.getMonthly(),
        analyticsApi.getByModel(),
        analyticsApi.getByProject(),
        analyticsApi.getRecent(15),
      ]);
      setOverview(ovRes.data);
      setMonthly(moRes.data);
      setByModel(mdRes.data);
      setByProject(pjRes.data);
      setRecent(rcRes.data);
    } catch {
      showToast('error', '加载统计数据失败');
    }
    setLoading(false);
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDuration = (ms: number) => {
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}min`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const pieData = byModel.map((m) => ({
    name: m.model_name,
    value: Number(m.cost) || 0,
  })).filter(d => d.value > 0);

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
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">使用统计</h1>
        <p className="text-parchment-dim/50 mt-1 text-sm">查看创作数据和资源消耗</p>
      </div>

      {/* Overview cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: '总生成次数', value: overview.total_generations, icon: '⚡' },
            { label: '总章节', value: overview.total_chapters, icon: '📖' },
            { label: '总字数', value: overview.total_words.toLocaleString(), icon: '✏️' },
            { label: '总项目', value: overview.total_projects, icon: '📁' },
          ].map((card) => (
            <div key={card.label} className="card-compact text-center">
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="text-2xl font-display font-bold text-parchment">{card.value}</div>
              <div className="text-[11px] text-parchment-dim/50 mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Token 消耗', value: formatTokens(overview.total_tokens) },
            { label: '总费用', value: `$${Number(overview.total_cost).toFixed(4)}` },
            { label: '平均评分', value: overview.avg_score ? Number(overview.avg_score).toFixed(1) : '-' },
            { label: '平均耗时', value: overview.avg_duration_ms ? formatDuration(overview.avg_duration_ms) : '-' },
          ].map((item) => (
            <div key={item.label} className="card-compact">
              <div className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium mb-1">{item.label}</div>
              <div className="text-lg font-display font-bold text-parchment">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly trend - AreaChart */}
        <div className="card">
          <div className="section-title mb-4">月度趋势</div>
          {monthly.length === 0 ? (
            <p className="text-parchment-dim/40 text-sm text-center py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a96e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c9a96e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dfc291" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#dfc291" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3529" strokeOpacity={0.5} />
                <XAxis dataKey="month" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
                <YAxis yAxisId="cost" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} tickFormatter={(v: number) => `$${v}`} />
                <YAxis yAxisId="tokens" orientation="right" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} tickFormatter={(v: number) => formatTokens(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="cost" type="monotone" dataKey="cost" name="费用" stroke="#c9a96e" fill="url(#gradCost)" strokeWidth={2} />
                <Area yAxisId="tokens" type="monotone" dataKey="tokens" name="Tokens" stroke="#dfc291" fill="url(#gradTokens)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By model - PieChart */}
        <div className="card">
          <div className="section-title mb-4">模型费用分布</div>
          {pieData.length === 0 ? (
            <p className="text-parchment-dim/40 text-sm text-center py-8">暂无数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value: string) => <span className="text-xs text-parchment-dim/60">{value}</span>}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Quality + Generations trend - ComposedChart */}
      {monthly.length > 0 && monthly.some(m => m.avg_score !== null) && (
        <div className="card mb-8">
          <div className="section-title mb-4">质量与生成趋势</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3d3529" strokeOpacity={0.5} />
              <XAxis dataKey="month" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
              <YAxis yAxisId="gen" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
              <YAxis yAxisId="score" orientation="right" domain={[0, 10]} tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="gen" dataKey="generations" name="生成次数" fill="#c9a96e" fillOpacity={0.3} radius={[4, 4, 0, 0]} />
              <Line yAxisId="score" type="monotone" dataKey="avg_score" name="平均评分" stroke="#e8d5b0" strokeWidth={2} dot={{ fill: '#e8d5b0', r: 4 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By project - BarChart */}
      {byProject.length > 0 && (
        <div className="card mb-8">
          <div className="section-title mb-4">项目消耗对比</div>
          <ResponsiveContainer width="100%" height={Math.max(200, byProject.length * 40 + 40)}>
            <BarChart data={byProject} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3d3529" strokeOpacity={0.5} horizontal={false} />
              <XAxis type="number" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} tickFormatter={(v: number) => `$${v}`} />
              <YAxis type="category" dataKey="project_name" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.6 }} axisLine={{ stroke: '#3d3529' }} width={120} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost" name="费用" fill="#c9a96e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent activity */}
      <div className="card">
        <div className="section-title mb-4">最近活动</div>
        {recent.length === 0 ? (
          <p className="text-parchment-dim/40 text-sm text-center py-8">暂无生成记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-study-border/40">
                  <th className="text-left py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">时间</th>
                  <th className="text-left py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">章节</th>
                  <th className="text-left py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">模型</th>
                  <th className="text-right py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">Tokens</th>
                  <th className="text-right py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">费用</th>
                  <th className="text-right py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">耗时</th>
                  <th className="text-right py-2.5 px-3 text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">评分</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-b border-study-border/20 hover:bg-study-glow/30 transition-colors">
                    <td className="py-2.5 px-3 text-parchment-dim/50 text-[11px] font-mono">
                      {new Date(a.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 text-parchment-dim/70">
                      {a.chapter ? `第${a.chapter.chapter_number}章 ${a.chapter.title || ''}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-parchment-dim/50 text-[11px]">{a.model_name || '-'}</td>
                    <td className="py-2.5 px-3 text-right text-parchment-dim/60 font-mono text-[11px]">
                      {formatTokens(a.token_input + a.token_output)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-parchment-dim/60 font-mono text-[11px]">
                      ${Number(a.cost).toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-parchment-dim/60 font-mono text-[11px]">
                      {a.duration_ms > 0 ? formatDuration(a.duration_ms) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {a.quality_score !== null ? (
                        <span className={`font-mono text-[11px] ${
                          a.quality_score >= 8 ? 'text-green-400' :
                          a.quality_score >= 6 ? 'text-amber-400' :
                          'text-red-400'
                        }`}>
                          {Number(a.quality_score).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-parchment-dim/30">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
