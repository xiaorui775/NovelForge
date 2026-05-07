import { useEffect, useState } from 'react';
import { costBudgetApi, CostBudget, UsageHistoryItem } from '../api/costBudget';
import { useUIStore } from '../stores/uiStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function CostBudgetSettings() {
  const { showToast } = useUIStore();
  const [budget, setBudget] = useState<CostBudget | null>(null);
  const [history, setHistory] = useState<UsageHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [limitInput, setLimitInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [budgetRes, historyRes] = await Promise.all([
        costBudgetApi.getCurrent(),
        costBudgetApi.getHistory(6),
      ]);
      setBudget(budgetRes.data);
      setHistory(historyRes.data);
      setLimitInput(budgetRes.data.monthly_limit.toString());
    } catch {
      showToast('error', '加载预算数据失败');
    }
    setLoading(false);
  };

  const handleSaveLimit = async () => {
    const limit = parseFloat(limitInput);
    if (isNaN(limit) || limit < 0) {
      showToast('error', '请输入有效的预算金额');
      return;
    }
    try {
      const { data } = await costBudgetApi.update({ monthly_limit: limit });
      setBudget(data);
      setEditing(false);
      showToast('success', '预算已更新');
    } catch {
      showToast('error', '更新失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-parchment-dim/40">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载中...
      </div>
    );
  }

  const usagePercent = budget ? (budget.monthly_limit > 0 ? (budget.current_usage / budget.monthly_limit) * 100 : 0) : 0;
  const remaining = budget ? Math.max(0, budget.monthly_limit - budget.current_usage) : 0;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">费用管理</h1>
        <p className="text-parchment-dim/50 mt-1 text-sm">设置月度费用预算，查看用量历史</p>
      </div>

      {/* Current month overview */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="card-compact">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">月度预算</p>
          {editing ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                className="input w-full text-lg font-display py-1.5"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                min={0}
                step={10}
              />
              <button onClick={handleSaveLimit} className="btn-primary text-xs px-3 py-1.5">保存</button>
              <button onClick={() => { setEditing(false); setLimitInput(budget?.monthly_limit.toString() || '100'); }} className="btn-ghost text-xs px-2 py-1.5">取消</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-display font-bold text-parchment">${(budget?.monthly_limit ?? 0).toFixed(2)}</p>
              <button onClick={() => setEditing(true)} className="btn-ghost text-[11px] px-2 py-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="card-compact">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">已使用</p>
          <p className={`text-2xl font-display font-bold mt-1 ${usagePercent >= 90 ? 'text-red-400' : usagePercent >= 70 ? 'text-amber-400' : 'text-parchment'}`}>
            ${(budget?.current_usage ?? 0).toFixed(4)}
          </p>
        </div>

        <div className="card-compact">
          <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">剩余</p>
          <p className="text-2xl font-display font-bold text-ink mt-1">${remaining.toFixed(4)}</p>
        </div>
      </div>

      {/* Usage progress bar */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-parchment-dim/70">本月用量</span>
          <span className="text-sm text-parchment-dim/50 font-mono">{usagePercent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-study-deep rounded-full h-3 overflow-hidden">
          <div
            className={`rounded-full h-3 transition-all duration-700 ${
              usagePercent >= 90 ? 'bg-gradient-to-r from-red-600 to-red-400' :
              usagePercent >= 70 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
              'bg-gradient-to-r from-ink-dark to-ink'
            }`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
        {usagePercent >= 90 && (
          <p className="text-[11px] text-red-400/70 mt-2">预算即将用完，生成请求将被拒绝</p>
        )}
      </div>

      {/* History chart */}
      {history.length > 0 && (
        <div className="card">
          <div className="section-title mb-6">用量历史</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,110,0.08)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'rgba(201,169,110,0.4)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(201,169,110,0.1)' }}
                />
                <YAxis
                  tick={{ fill: 'rgba(201,169,110,0.4)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(201,169,110,0.1)' }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#242019',
                    border: '1px solid #3d3529',
                    borderRadius: '8px',
                    color: '#f5f0e8',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`$${value.toFixed(4)}`, '']}
                />
                <Bar dataKey="usage" fill="#c9a96e" radius={[4, 4, 0, 0]} name="实际用量" />
                {budget && budget.monthly_limit > 0 && (
                  <ReferenceLine
                    y={budget.monthly_limit}
                    stroke="rgba(201,169,110,0.3)"
                    strokeDasharray="5 5"
                    label={{ value: '预算', fill: 'rgba(201,169,110,0.5)', fontSize: 11 }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
