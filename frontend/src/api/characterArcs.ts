import client from './client';

export interface CharacterAppearance {
  appearance_id: string;
  chapter_outline_id: string;
  chapter_number: number;
  title: string | null;
  role_in_chapter: string;
  notes: string;
}

export interface CharacterArc {
  character_id: string;
  character_name: string;
  appearances: CharacterAppearance[];
  total_chapters: number;
  major_chapters: number;
}

export interface ChapterCharacters {
  chapter_number: number;
  title: string | null;
  characters: {
    character_id: string;
    name: string;
    role_in_chapter: string;
  }[];
}

export const characterArcsApi = {
  getCharacterArc: (characterId: string) =>
    client.get<CharacterArc>(`/characters/${characterId}/arc`),

  getOutlineArc: (outlineId: string) =>
    client.get<ChapterCharacters[]>(`/outlines/${outlineId}/character-arc`),

  addAppearance: (data: {
    character_id: string;
    chapter_outline_id: string;
    role_in_chapter?: string;
    notes?: string;
  }) => client.post<CharacterAppearance>('/character-appearances', data),

  updateAppearance: (id: string, data: { role_in_chapter?: string; notes?: string }) =>
    client.put<CharacterAppearance>(`/character-appearances/${id}`, data),

  deleteAppearance: (id: string) => client.delete(`/character-appearances/${id}`),
};
