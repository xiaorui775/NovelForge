import { useEffect, useState } from 'react';
import { characterArcsApi, CharacterArc, ChapterCharacters } from '../api/characterArcs';
import { Character } from '../api/characters';
import { useUIStore } from '../stores/uiStore';

interface Props {
  character: Character;
  outlineId: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  major: { label: '主要', color: 'bg-ink text-study-deep' },
  minor: { label: '次要', color: 'bg-ink/30 text-parchment' },
  mentioned: { label: '提及', color: 'bg-ink/10 text-parchment-dim/60' },
};

export default function CharacterArcView({ character, outlineId }: Props) {
  const { showToast } = useUIStore();
  const [arc, setArc] = useState<CharacterArc | null>(null);
  const [chapters, setChapters] = useState<ChapterCharacters[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [character.id, outlineId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [arcRes, chaptersRes] = await Promise.all([
        characterArcsApi.getCharacterArc(character.id).catch(() => null),
        characterArcsApi.getOutlineArc(outlineId),
      ]);
      if (arcRes) setArc(arcRes.data);
      setChapters(chaptersRes.data);
    } catch {
      showToast('error', '加载角色弧光数据失败');
    }
    setLoading(false);
  };

  const appearanceMap = new Map(
    (arc?.appearances || []).map((a) => [a.chapter_number, a])
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {arc && (
        <div className="flex items-center gap-4 text-[11px] text-parchment-dim/50">
          <span>出场章节: <span className="text-ink font-mono">{arc.total_chapters}</span></span>
          <span>主要章节: <span className="text-ink font-mono">{arc.major_chapters}</span></span>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-1">
        {chapters.map((ch) => {
          const appearance = appearanceMap.get(ch.chapter_number);
          const charInChapter = ch.characters.find((c) => c.character_id === character.id);
          const role = appearance?.role_in_chapter || (charInChapter ? 'minor' : null);

          return (
            <div
              key={ch.chapter_number}
              className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-study-deep/50 transition-colors"
            >
              <span className="w-8 text-right text-[11px] text-parchment-dim/30 font-mono">
                {ch.chapter_number}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-parchment-dim/70 truncate">
                  {ch.title || `第${ch.chapter_number}章`}
                </span>
              </div>
              {role ? (
                <span className={`px-2 py-0.5 rounded-full text-[9px] ${ROLE_LABELS[role]?.color || 'bg-ink/10 text-parchment-dim/50'}`}>
                  {ROLE_LABELS[role]?.label || role}
                </span>
              ) : (
                <span className="w-12" />
              )}
              {appearance?.notes && (
                <span className="text-[10px] text-parchment-dim/30 max-w-[120px] truncate" title={appearance.notes}>
                  {appearance.notes}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {chapters.length === 0 && (
        <p className="text-center text-xs text-parchment-dim/30 py-4">
          暂无章节数据
        </p>
      )}
    </div>
  );
}
