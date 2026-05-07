import { useEffect, useState } from 'react';
import {
  GOAL_TYPES,
  WritingGoal,
  WritingGoalCreate,
  WritingGoalProgress,
  WritingGoalUpdate,
  writingGoalsApi,
} from '../api/writingGoals';
import { useUIStore } from '../stores/uiStore';

interface Props {
  projectId: string;
}

const defaultForm = (): WritingGoalCreate => {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 6);

  return {
    type: 'daily_words',
    target: 2000,
    start_date: today.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    notes: '',
  };
};

export default function WritingGoals({ projectId }: Props) {
  const { showToast } = useUIStore();
  const [goals, setGoals] = useState<WritingGoal[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, WritingGoalProgress>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WritingGoal | null>(null);
  const [form, setForm] = useState<WritingGoalCreate>(defaultForm());

  useEffect(() => {
    loadGoals();
  }, [projectId]);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const { data } = await writingGoalsApi.list(projectId);
      setGoals(data);
      if (data.length === 0) {
        setProgressMap({});
        return;
      }

      const progressResults = await Promise.allSettled(
        data.map((goal) => writingGoalsApi.progress(goal.id))
      );

      const nextProgressMap: Record<string, WritingGoalProgress> = {};
      progressResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          nextProgressMap[data[index].id] = result.value.data;
        }
      });

      setProgressMap(nextProgressMap);
    } catch {
      showToast('error', '加载目标失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (form.target <= 0) {
      showToast('warning', '目标值需大于 0');
      return;
    }
    if (form.end_date < form.start_date) {
      showToast('warning', '结束日期不能早于开始日期');
      return;
    }

    try {
      const { data } = await writingGoalsApi.create(projectId, form);
      const progress = await writingGoalsApi.progress(data.id);
      setGoals([data, ...goals]);
      setProgressMap({ ...progressMap, [data.id]: progress.data });
      setShowCreate(false);
      setForm(defaultForm());
      showToast('success', '目标已创建');
    } catch {
      showToast('error', '创建目标失败');
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (editing.target <= 0) {
      showToast('warning', '目标值需大于 0');
      return;
    }
    if (editing.end_date < editing.start_date) {
      showToast('warning', '结束日期不能早于开始日期');
      return;
    }

    const payload: WritingGoalUpdate = {
      type: editing.type,
      target: editing.target,
      start_date: editing.start_date,
      end_date: editing.end_date,
      notes: editing.notes,
    };

    try {
      const { data } = await writingGoalsApi.update(editing.id, payload);
      const progress = await writingGoalsApi.progress(data.id);
      setGoals(goals.map((goal) => (goal.id === data.id ? data : goal)));
      setProgressMap({ ...progressMap, [data.id]: progress.data });
      setEditing(null);
      showToast('success', '目标已更新');
    } catch {
      showToast('error', '更新失败');
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      await writingGoalsApi.delete(goalId);
      setGoals(goals.filter((goal) => goal.id !== goalId));
      const nextProgress = { ...progressMap };
      delete nextProgress[goalId];
      setProgressMap(nextProgress);
      showToast('success', '目标已删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-parchment-dim/45">追踪写作目标与连续创作状态</div>
        <button onClick={() => setShowCreate(true)} className="btn-ghost text-xs flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新建目标
        </button>
      </div>

      {showCreate && (
        <div className="card-compact space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input w-full text-sm py-1.5"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {GOAL_TYPES.map((goalType) => (
                <option key={goalType.value} value={goalType.value}>
                  {goalType.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="input w-full text-sm"
              placeholder="目标值"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: Number(e.target.value) || 0 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className="input w-full text-sm"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <input
              type="date"
              className="input w-full text-sm"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>

          <textarea
            className="textarea w-full h-20 text-sm"
            placeholder="备注（可选）"
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn-primary text-xs">保存</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-study-card rounded-lg" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 text-parchment-dim/30 text-sm">暂无写作目标</div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const progress = progressMap[goal.id];
            const percent = Math.min(100, progress?.progress_percent ?? 0);
            const goalType = GOAL_TYPES.find((item) => item.value === goal.type)?.label || goal.type;

            return (
              <div key={goal.id} className="card-compact group">
                {editing?.id === goal.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="input w-full text-sm py-1.5"
                        value={editing.type}
                        onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                      >
                        {GOAL_TYPES.map((goalTypeOption) => (
                          <option key={goalTypeOption.value} value={goalTypeOption.value}>
                            {goalTypeOption.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        className="input w-full text-sm"
                        value={editing.target}
                        onChange={(e) => setEditing({ ...editing, target: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        className="input w-full text-sm"
                        value={editing.start_date.slice(0, 10)}
                        onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                      />
                      <input
                        type="date"
                        className="input w-full text-sm"
                        value={editing.end_date.slice(0, 10)}
                        onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                      />
                    </div>
                    <textarea
                      className="textarea w-full h-20 text-sm"
                      value={editing.notes}
                      onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={handleUpdate} className="btn-primary text-xs">保存</button>
                      <button onClick={() => setEditing(null)} className="btn-ghost text-xs">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="tag text-[10px]">{goalType}</span>
                          <span className="text-xs text-parchment-dim/40">
                            {goal.start_date.slice(0, 10)} ~ {goal.end_date.slice(0, 10)}
                          </span>
                        </div>
                        <p className="text-sm text-parchment-dim/70">
                          进度 {progress?.current ?? 0} / {goal.target}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditing(goal)}
                          className="p-1 rounded text-parchment-dim/30 hover:text-ink transition-colors"
                          title="编辑"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="p-1 rounded text-parchment-dim/30 hover:text-red-400 transition-colors"
                          title="删除"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-study-deep rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-ink-dark to-ink transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-parchment-dim/40">
                        <span>{percent.toFixed(1)}%</span>
                        <span>连续 {progress?.consecutive_days ?? 0} 天</span>
                        <span>剩余 {progress?.days_remaining ?? 0} 天</span>
                      </div>
                    </div>

                    {goal.notes && <p className="mt-2 text-xs text-parchment-dim/45 whitespace-pre-wrap">{goal.notes}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
