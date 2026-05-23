import client from './client';

export interface Outline {
  id: string;
  project_id: string;
  total_chapters: number;
  synopsis: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterOutline {
  id: string;
  outline_id: string;
  chapter_number: number;
  title: string | null;
  summary: string;
  detail_outline: string | null;
  chapter_memo: string | null;
  content_summary: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OutlineCreate {
  total_chapters: number;
  synopsis?: string;
}

export interface ChapterOutlineCreate {
  chapter_number: number;
  title?: string;
  summary: string;
  sort_order: number;
}

export interface ChapterOutlineUpdate {
  title?: string;
  summary?: string;
  detail_outline?: string;
  chapter_memo?: string;
  sort_order?: number;
}

export interface ReverseOutlineItem {
  chapter_number: number;
  title: string;
  planned_summary: string | null;
  actual_summary: string | null;
  word_count: number;
  status: 'matched' | 'drifted' | 'missing' | 'extra';
  notes: string | null;
}

export interface ReverseOutlineResult {
  items: ReverseOutlineItem[];
  overall_assessment: string;
  match_rate: number;
}

export const outlinesApi = {
  get: (projectId: string) => client.get<Outline>(`/projects/${projectId}/outline`),

  create: (projectId: string, data: OutlineCreate) =>
    client.post<Outline>(`/projects/${projectId}/outline`, data),

  update: (outlineId: string, data: Partial<OutlineCreate>) =>
    client.put<Outline>(`/outlines/${outlineId}`, data),

  listChapters: (outlineId: string) =>
    client.get<ChapterOutline[]>(`/outlines/${outlineId}/chapters`),

  createChapter: (outlineId: string, data: ChapterOutlineCreate) =>
    client.post<ChapterOutline>(`/outlines/${outlineId}/chapters`, data),

  updateChapter: (chapterOutlineId: string, data: ChapterOutlineUpdate) =>
    client.put<ChapterOutline>(`/chapter-outlines/${chapterOutlineId}`, data),

  deleteChapter: (chapterOutlineId: string) =>
    client.delete(`/chapter-outlines/${chapterOutlineId}`),

  getChapter: (chapterOutlineId: string) =>
    client.get<ChapterOutline>(`/chapter-outlines/${chapterOutlineId}`),

  reorderChapters: (outlineId: string, items: { id: string; sort_order: number }[]) =>
    client.put<ChapterOutline[]>(`/outlines/${outlineId}/chapters/reorder`, items),

  expandDetail: (chapterOutlineId: string, modelId: string) =>
    client.post<ChapterOutline>(`/chapter-outlines/${chapterOutlineId}/expand-detail`, { model_id: modelId }, { timeout: 180000 }),

  generateOutline: (projectId: string, modelId: string, synopsis: string = '', totalChapters: number = 20, pacingStyle: string = '') =>
    client.post<Outline>(`/projects/${projectId}/outline/generate`, {
      model_id: modelId, synopsis, total_chapters: totalChapters, pacing_style: pacingStyle,
    }, { timeout: 180000 }),

  reverseOutline: (outlineId: string, modelId: string) =>
    client.post<ReverseOutlineResult>(`/outlines/${outlineId}/reverse-outline`, { model_id: modelId }, { timeout: 180000 }),

  splitChapter: (chapterOutlineId: string, splitPosition: number) =>
    client.post<ChapterOutline[]>(`/chapter-outlines/${chapterOutlineId}/split`, { split_position: splitPosition }),

  mergeChapters: (chapterOutlineId: string, chapterOutlineId2: string) =>
    client.post<ChapterOutline>(`/chapter-outlines/${chapterOutlineId}/merge`, { chapter_outline_id_2: chapterOutlineId2 }),
};
