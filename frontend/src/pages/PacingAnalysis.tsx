import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { modelsApi, ModelConfig } from '../api/models';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

interface PacingData {
  chapter_number: number;
  title: string | null;
  dialogue_ratio: number;
  narration_ratio: number;
  description_ratio: number;
  pacing_score: number;
  tension_level: number;
  emotional_tone: string;
}

const TONE_COLORS: Record<string, string> = {
  '紧张': '#e06060',
  '温馨': '#e8a0bf',
  '悲伤': '#6080c0',
  '欢快': '#80c080',
  '压抑': '#806080',
  '激昂': '#e0a040',
  '未知': '#a0a0a0',
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-study-card border border-study-border/50 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[11px] text-parchment-dim/60 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-mono" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? (p.value <= 1 ? `${(p.value * 100).toFixed(0)}%` : p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function PacingAnalysis() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [data, setData] = useState<PacingData[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadModels();
    }
  }, [projectId]);

  const loadModels = async () => {
    try {
      const { data: models } = await modelsApi.list();
      const active = models.filter((m) => m.is_active);
      setModels(active);
      if (active.length > 0) setSelectedModel(active[0].id);
    } catch {
      showToast('error', '加载模型列表失败');
    }
  };

  const handleAnalyze = async () => {
    if (!projectId || !selectedModel) return;
    setAnalyzing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/pacing-analysis?model_id=${selectedModel}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || '分析失败');
      }
      const result = await response.json();
      setData(result);
      showToast('success', '分析完成');
    } catch (err) {
      showToast('error', (err as Error).message || '分析失败');
    }
    setAnalyzing(false);
  };

  const ratioData = data.map((d) => ({
    name: `第${d.chapter_number}章`,
    对话: d.dialogue_ratio,
    叙述: d.narration_ratio,
    描写: d.description_ratio,
  }));

  const pacingData = data.map((d) => ({
    name: `第${d.chapter_number}章`,
    节奏: d.pacing_score,
    张力: d.tension_level,
  }));

  const toneData = data.map((d) => ({
    name: `第${d.chapter_number}章`,
    tone: d.emotional_tone,
    pacing: d.pacing_score,
  }));

  return (
    <div className="animate-fade-in">
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
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">节奏分析</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input text-xs"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !selectedModel}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {analyzing ? '分析中...' : '开始分析'}
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
            <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-1">节奏分析</p>
          <p className="text-parchment-dim/50 text-sm mb-4">选择模型后点击"开始分析"，AI 将分析每个章节的节奏和结构</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stacked Area - ratios */}
          <div className="card">
            <div className="section-title mb-4">章节结构比例</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={ratioData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3529" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
                <YAxis tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(value: string) => <span className="text-xs text-parchment-dim/60">{value}</span>} />
                <Area type="monotone" dataKey="对话" stackId="1" stroke="#c9a96e" fill="#c9a96e" fillOpacity={0.4} />
                <Area type="monotone" dataKey="叙述" stackId="1" stroke="#dfc291" fill="#dfc291" fillOpacity={0.4} />
                <Area type="monotone" dataKey="描写" stackId="1" stroke="#a08550" fill="#a08550" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pacing + Tension line chart */}
          <div className="card">
            <div className="section-title mb-4">节奏与张力</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pacingData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3529" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
                <YAxis domain={[0, 10]} tick={{ fill: '#f5f0e8', fontSize: 11, opacity: 0.5 }} axisLine={{ stroke: '#3d3529' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(value: string) => <span className="text-xs text-parchment-dim/60">{value}</span>} />
                <Bar dataKey="节奏" fill="#c9a96e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="张力" fill="#e8d5b0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Emotional tone */}
          <div className="card">
            <div className="section-title mb-4">情感色调</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {toneData.map((d, i) => (
                <div key={i} className="bg-study-deep/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-parchment-dim/40 mb-1">{d.name}</div>
                  <div
                    className="text-lg font-display font-bold"
                    style={{ color: TONE_COLORS[d.tone] || TONE_COLORS['未知'] }}
                  >
                    {d.tone}
                  </div>
                  <div className="text-[10px] text-parchment-dim/30 mt-1">节奏 {d.pacing}/10</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
