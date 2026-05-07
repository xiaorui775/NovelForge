import { Scene } from '../api/scenes';

interface SceneCardProps {
  scene: Scene;
  onEdit: (scene: Scene) => void;
  onDelete: (id: string) => void;
}

const moodColors: Record<string, string> = {
  '紧张': 'bg-red-500/10 text-red-400',
  '温馨': 'bg-amber-500/10 text-amber-400',
  '悲伤': 'bg-blue-500/10 text-blue-400',
  '欢快': 'bg-green-500/10 text-green-400',
  '神秘': 'bg-purple-500/10 text-purple-400',
  '恐怖': 'bg-gray-500/10 text-gray-400',
};

export default function SceneCard({ scene, onEdit, onDelete }: SceneCardProps) {
  return (
    <div className="card-compact group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono bg-study-surface text-parchment-dim/40 px-1.5 py-0.5 rounded">
            #{scene.scene_number}
          </span>
          {scene.mood && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${moodColors[scene.mood] || 'bg-study-surface text-parchment-dim/50'}`}>
              {scene.mood}
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(scene)} className="p-1 text-parchment-dim/30 hover:text-ink transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
          <button onClick={() => onDelete(scene.id)} className="p-1 text-parchment-dim/30 hover:text-red-400 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {(scene.location || scene.time) && (
          <div className="flex items-center gap-3 text-[10px] text-parchment-dim/40">
            {scene.location && (
              <span className="flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                {scene.location}
              </span>
            )}
            {scene.time && (
              <span className="flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {scene.time}
              </span>
            )}
          </div>
        )}
        {scene.summary && (
          <p className="text-[11px] text-parchment-dim/60 leading-relaxed line-clamp-2">{scene.summary}</p>
        )}
      </div>
    </div>
  );
}
