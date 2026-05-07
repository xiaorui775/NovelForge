import { useState, useEffect, useCallback } from 'react';
import { scenesApi, Scene } from '../../api/scenes';
import SceneCard from '../SceneCard';

interface ScenePanelProps {
  chapterId: string | null;
}

export default function ScenePanel({ chapterId }: ScenePanelProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [form, setForm] = useState({ location: '', time: '', summary: '', mood: '', notes: '' });

  const loadScenes = useCallback(async () => {
    if (!chapterId) return;
    try {
      const { data } = await scenesApi.list(chapterId);
      setScenes(data);
    } catch (err) { console.error('Failed to load scenes:', err); }
  }, [chapterId]);

  useEffect(() => { loadScenes(); }, [loadScenes]);

  const resetForm = () => {
    setForm({ location: '', time: '', summary: '', mood: '', notes: '' });
    setEditingScene(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!chapterId) return;
    try {
      if (editingScene) {
        await scenesApi.update(chapterId, editingScene.id, form);
      } else {
        await scenesApi.create(chapterId, { ...form, scene_number: scenes.length + 1 });
      }
      resetForm();
      loadScenes();
    } catch (err) { console.error('Failed to save scene:', err); }
  };

  const handleEdit = (scene: Scene) => {
    setEditingScene(scene);
    setForm({ location: scene.location, time: scene.time, summary: scene.summary, mood: scene.mood, notes: scene.notes });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!chapterId) return;
    try {
      await scenesApi.delete(chapterId, id);
      loadScenes();
    } catch (err) { console.error('Failed to delete scene:', err); }
  };

  if (!chapterId) return null;

  return (
    <div className="bg-study-card rounded-lg border border-study-border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-parchment-dim/70 uppercase tracking-wider">场景</h3>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="text-[10px] text-ink/60 hover:text-ink transition-colors"
        >
          + 添加
        </button>
      </div>

      {scenes.length === 0 && !showForm ? (
        <p className="text-[11px] text-parchment-dim/30 text-center py-3">暂无场景</p>
      ) : (
        <div className="space-y-2">
          {scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-3 pt-3 border-t border-study-border/40 space-y-2">
          <input
            type="text"
            className="input w-full text-xs py-1.5"
            placeholder="地点"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <input
            type="text"
            className="input w-full text-xs py-1.5"
            placeholder="时间"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />
          <input
            type="text"
            className="input w-full text-xs py-1.5"
            placeholder="情绪 (如: 紧张、温馨)"
            value={form.mood}
            onChange={(e) => setForm({ ...form, mood: e.target.value })}
          />
          <textarea
            className="textarea w-full text-xs h-16 resize-none"
            placeholder="场景摘要..."
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="btn-primary text-xs flex-1">
              {editingScene ? '保存' : '添加'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-xs">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
